require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./db');
const defaultTemplate = require('./default-template');
const { mergeCharacterData, parseStoredCharacter } = require('./character-data');

const app = express();
// Behind nginx in production — without this, express-rate-limit (and req.ip
// generally) sees every request as coming from nginx's own address, making
// the rate limit effectively global across all users instead of per-client.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;
const SIGNUP_CODE = process.env.SIGNUP_CODE;
// Note: SITE_ADMIN_NAME still exists as an env var, but only db.js reads it
// now — for the one-time migration that promotes a pre-existing account to
// the site_admin role the first time this version runs. After that, role is
// the only thing that matters; this name-matching mechanism is retired.
const MAX_CHARACTERS_PER_SESSION = Number(process.env.MAX_CHARACTERS_PER_SESSION) || 6;

if (!SESSION_SECRET || !SIGNUP_CODE) {
  console.error('Missing SESSION_SECRET or SIGNUP_CODE in .env — both are required.');
  process.exit(1);
}

app.use(express.json({ limit: '1mb' }));
app.use(cookieSession({
  name: 'session',
  keys: [SESSION_SECRET],
  maxAge: 365 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
}));

// Rate limiting on auth endpoints specifically — these are the ones worth
// protecting against automated password guessing. Deliberately not applied
// globally: a broad limit would throttle legitimate gameplay traffic
// (character saves, dice-adjacent reads) for no security benefit.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 FAILED attempts per IP per window — generous for real use, tight for brute force
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failures count — a busy household signing up shouldn't trip this
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

function generateInviteCode() {
  const raw = crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x');
  return raw.toUpperCase();
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not signed in.' });
  }
  const user = db.prepare('SELECT id, display_name, role FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    req.session = null;
    return res.status(401).json({ error: 'Session no longer valid.' });
  }
  req.user = user;
  next();
}

function isMember(sessionId, userId) {
  return !!db.prepare('SELECT 1 FROM session_members WHERE session_id = ? AND user_id = ?').get(sessionId, userId);
}
function isSessionAdmin(sessionId, userId) {
  const s = db.prepare('SELECT created_by FROM sessions WHERE id = ?').get(sessionId);
  return !!s && s.created_by === userId;
}
function isSiteAdmin(user) {
  return user.role === 'site_admin';
}
function requireSiteAdmin(req, res, next) {
  if (!isSiteAdmin(req.user)) return res.status(403).json({ error: 'Site admin only.' });
  next();
}

// ---------- Auth ----------
// One endpoint handles two cases based on whether the caller already has a
// Two distinct gates, kept deliberately separate: SIGNUP_CODE controls
// whether someone can have an account on this server AT ALL (a general,
// platform-level code — not tied to any campaign). Once they have an
// account, a session's own invite code controls which specific campaign(s)
// they can see — entered from inside the Vault, never at signup.

app.post('/api/signup', authLimiter, (req, res) => {
  const { signupCode, displayName, password } = req.body || {};
  if (!signupCode || signupCode.trim() !== SIGNUP_CODE.trim()) {
    return res.status(403).json({ error: 'Invalid signup code.' });
  }
  const name = (displayName || '').trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: 'Choose a display name.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const existing = db.prepare('SELECT id FROM users WHERE display_name = ?').get(name);
  if (existing) {
    return res.status(409).json({ error: 'That name is already taken — pick another, or sign in instead if it\'s you.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (display_name, password_hash) VALUES (?, ?)').run(name, hash);

  // The very first account ever created on this server becomes site admin
  // automatically. Safe in a way name-matching wasn't: id=1 can only ever
  // be true once in this table's entire history (AUTOINCREMENT never
  // reuses ids, even after deletion), so this can't be retriggered later
  // by someone signing up with a particular name.
  if (info.lastInsertRowid === 1) {
    db.prepare("UPDATE users SET role = 'site_admin' WHERE id = 1").run();
  }

  req.session.userId = info.lastInsertRowid;
  res.json({ user: { id: info.lastInsertRowid, displayName: name } });
});

app.post('/api/login', authLimiter, (req, res) => {
  const { displayName, password } = req.body || {};
  if (!displayName || !password) return res.status(400).json({ error: 'Name and password required.' });
  const user = db.prepare('SELECT * FROM users WHERE display_name = ?').get(displayName.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'That name and password combination wasn\'t recognized.' });
  }
  req.session.userId = user.id;
  res.json({ user: { id: user.id, displayName: user.display_name } });
});

// Joining a session always requires being signed in already — this is pure
// session-membership, no account creation happens here anymore.
app.post('/api/join-session', requireAuth, authLimiter, (req, res) => {
  const { inviteCode } = req.body || {};
  if (!inviteCode) return res.status(400).json({ error: 'Invite code required.' });

  const targetSession = db.prepare('SELECT * FROM sessions WHERE invite_code = ?').get(inviteCode.trim());
  if (!targetSession) return res.status(403).json({ error: 'Invalid invite code.' });

  db.prepare('INSERT OR IGNORE INTO session_members (session_id, user_id) VALUES (?, ?)').run(targetSession.id, req.user.id);

  res.json({ session: { id: targetSession.id, name: targetSession.name } });
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, displayName: req.user.display_name, isSiteAdmin: isSiteAdmin(req.user) } });
});

// ---------- Site Admin (role-based — see the "role" column on users) ----------

app.get('/api/admin/overview', requireAuth, requireSiteAdmin, (req, res) => {
  const users = db.prepare('SELECT id, display_name AS displayName, role, created_at AS createdAt FROM users ORDER BY id ASC').all();
  const sessions = db.prepare(`
    SELECT s.id, s.name, s.invite_code AS inviteCode, s.created_by AS createdBy, u.display_name AS adminName,
      (SELECT COUNT(*) FROM session_members sm WHERE sm.session_id = s.id) AS memberCount,
      (SELECT COUNT(*) FROM characters c WHERE c.session_id = s.id) AS characterCount
    FROM sessions s LEFT JOIN users u ON u.id = s.created_by
    ORDER BY s.id ASC
  `).all();
  const characters = db.prepare(`
    SELECT c.id, c.name, c.updated_at AS updatedAt, u.display_name AS ownerName, s.name AS sessionName
    FROM characters c JOIN users u ON u.id = c.user_id JOIN sessions s ON s.id = c.session_id
    ORDER BY c.updated_at DESC
  `).all();
  res.json({ users, sessions, characters });
});

app.post('/api/admin/users/:id/promote', requireAuth, requireSiteAdmin, (req, res) => {
  const info = db.prepare("UPDATE users SET role = 'site_admin' WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'User not found.' });
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/demote', requireAuth, requireSiteAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  const adminCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'site_admin'").get().n;
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === 'site_admin' && adminCount <= 1) {
    return res.status(400).json({ error: "Can't remove the last site admin — promote someone else first." });
  }
  db.prepare("UPDATE users SET role = 'player' WHERE id = ?").run(targetId);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireAuth, requireSiteAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: "You can't delete your own account from here." });
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === 'site_admin') {
    const adminCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'site_admin'").get().n;
    if (adminCount <= 1) return res.status(400).json({ error: "Can't delete the last site admin — promote someone else first." });
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  if (info.changes === 0) return res.status(404).json({ error: 'User not found.' });
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/reset-password', requireAuth, requireSiteAdmin, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
});

app.patch('/api/admin/users/:id', requireAuth, requireSiteAdmin, (req, res) => {
  const { displayName } = req.body || {};
  const name = (displayName || '').trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: 'Name required.' });
  const existing = db.prepare('SELECT id FROM users WHERE display_name = ? AND id != ?').get(name, req.params.id);
  if (existing) return res.status(409).json({ error: 'That name is already taken.' });
  const info = db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'User not found.' });
  res.json({ ok: true });
});

app.delete('/api/admin/sessions/:id', requireAuth, requireSiteAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Session not found.' });
  res.json({ ok: true });
});

app.delete('/api/admin/characters/:id', requireAuth, requireSiteAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM characters WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Character not found.' });
  res.json({ ok: true });
});

// ---------- Sessions ----------

app.get('/api/sessions', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.name, s.created_by,
      (SELECT COUNT(*) FROM session_members sm WHERE sm.session_id = s.id) AS memberCount,
      (SELECT COUNT(*) FROM characters c WHERE c.session_id = s.id) AS characterCount
    FROM sessions s
    JOIN session_members m ON m.session_id = s.id
    WHERE m.user_id = ?
    ORDER BY s.created_at DESC
  `).all(req.user.id);
  res.json({
    sessions: rows.map(r => ({
      id: r.id, name: r.name, memberCount: r.memberCount, characterCount: r.characterCount,
      isAdmin: r.created_by === req.user.id,
    })),
  });
});

app.post('/api/sessions', requireAuth, (req, res) => {
  const name = (req.body && req.body.name || '').trim().slice(0, 60) || 'New Campaign';
  const inviteCode = generateInviteCode();
  const info = db.prepare('INSERT INTO sessions (name, invite_code, created_by) VALUES (?, ?, ?)')
    .run(name, inviteCode, req.user.id);
  db.prepare('INSERT INTO session_members (session_id, user_id) VALUES (?, ?)').run(info.lastInsertRowid, req.user.id);
  res.json({ id: info.lastInsertRowid, name, inviteCode });
});

app.get('/api/sessions/:id', requireAuth, (req, res) => {
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!s || !isMember(s.id, req.user.id)) return res.status(404).json({ error: 'Session not found.' });
  const admin = s.created_by === req.user.id;
  const payload = { id: s.id, name: s.name, isAdmin: admin };
  if (admin) {
    payload.inviteCode = s.invite_code;
    payload.members = db.prepare(`
      SELECT u.id, u.display_name AS displayName, sm.joined_at AS joinedAt
      FROM session_members sm JOIN users u ON u.id = sm.user_id
      WHERE sm.session_id = ? ORDER BY sm.joined_at ASC
    `).all(s.id);
  }
  res.json(payload);
});

app.post('/api/sessions/:id/regenerate-code', requireAuth, (req, res) => {
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found.' });
  if (s.created_by !== req.user.id) return res.status(403).json({ error: 'Only the session admin can do that.' });
  const inviteCode = generateInviteCode();
  db.prepare('UPDATE sessions SET invite_code = ? WHERE id = ?').run(inviteCode, s.id);
  res.json({ inviteCode });
});

app.delete('/api/sessions/:id/members/:userId', requireAuth, (req, res) => {
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found.' });
  if (s.created_by !== req.user.id) return res.status(403).json({ error: 'Only the session admin can do that.' });
  const targetId = Number(req.params.userId);
  if (targetId === req.user.id) return res.status(400).json({ error: "Admins can't remove themselves." });
  db.prepare('DELETE FROM characters WHERE session_id = ? AND user_id = ?').run(s.id, targetId);
  db.prepare('DELETE FROM session_members WHERE session_id = ? AND user_id = ?').run(s.id, targetId);
  res.json({ ok: true });
});

app.delete('/api/sessions/:id', requireAuth, (req, res) => {
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found.' });
  if (s.created_by !== req.user.id) return res.status(403).json({ error: 'Only the session admin can do that.' });
  db.prepare('DELETE FROM sessions WHERE id = ?').run(s.id); // cascades members + characters
  res.json({ ok: true });
});

// ---------- Vault (a player's own characters, across all sessions) ----------

app.get('/api/vault', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.updated_at AS updatedAt, c.session_id AS sessionId, s.name AS sessionName
    FROM characters c JOIN sessions s ON s.id = c.session_id
    WHERE c.user_id = ?
    ORDER BY c.updated_at DESC
  `).all(req.user.id);
  res.json({ characters: rows });
});

// ---------- Characters within a session (shared, read-only for non-owners) ----------

app.get('/api/sessions/:id/characters', requireAuth, (req, res) => {
  const sessionId = req.params.id;
  if (!isMember(sessionId, req.user.id)) return res.status(404).json({ error: 'Session not found.' });
  const rows = db.prepare(`
    SELECT c.id, c.name, c.updated_at AS updatedAt, c.user_id AS ownerId, u.display_name AS ownerName
    FROM characters c JOIN users u ON u.id = c.user_id
    WHERE c.session_id = ?
    ORDER BY c.updated_at DESC
  `).all(sessionId);
  res.json({
    characters: rows.map(r => ({ ...r, isOwner: r.ownerId === req.user.id })),
    limit: MAX_CHARACTERS_PER_SESSION,
    countForYou: rows.filter(r => r.ownerId === req.user.id).length,
  });
});

app.post('/api/characters', requireAuth, (req, res) => {
  const sessionId = req.body && req.body.sessionId;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required.' });
  if (!isMember(sessionId, req.user.id)) return res.status(403).json({ error: 'Not a member of that session.' });

  const existing = db.prepare('SELECT COUNT(*) AS n FROM characters WHERE session_id = ? AND user_id = ?')
    .get(sessionId, req.user.id).n;
  if (existing >= MAX_CHARACTERS_PER_SESSION) {
    return res.status(429).json({ error: `You've reached the limit of ${MAX_CHARACTERS_PER_SESSION} characters for this session.` });
  }

  const data = defaultTemplate();
  const info = db.prepare('INSERT INTO characters (user_id, session_id, name, data) VALUES (?, ?, ?, ?)')
    .run(req.user.id, sessionId, data.charName, JSON.stringify(data));
  res.json({ id: info.lastInsertRowid, data });
});

app.get('/api/characters/:id', requireAuth, (req, res) => {
  const row = db.prepare(`
    SELECT c.*, u.display_name AS ownerName, s.name AS sessionName
    FROM characters c JOIN users u ON u.id = c.user_id JOIN sessions s ON s.id = c.session_id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!row || !isMember(row.session_id, req.user.id)) return res.status(404).json({ error: 'Character not found.' });
  const data = parseStoredCharacter(row.data, row.id);
  if (!data) return res.status(500).json({ error: 'Character data could not be read.' });
  res.json({
    id: row.id, name: row.name, data, updatedAt: row.updated_at,
    ownerId: row.user_id, ownerName: row.ownerName, isOwner: row.user_id === req.user.id,
    sessionId: row.session_id, sessionName: row.sessionName,
  });
});

const VERSION_SNAPSHOT_MIN_GAP_MINUTES = 10;
const VERSION_KEEP_MAX = 20;

app.put('/api/characters/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT id, data, updated_at FROM characters WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Character not found, or not yours to edit.' });

  // Optional If-Match (the updated_at from GET). Old clients that omit it still
  // save; two Next tabs that both send it get a 409 instead of silent clobber.
  const ifMatch = req.get('If-Match');
  if (ifMatch && ifMatch !== row.updated_at) {
    return res.status(409).json({
      error: 'Character was saved elsewhere. Reload to continue.',
      updatedAt: row.updated_at,
    });
  }

  const existing = parseStoredCharacter(row.data, row.id) || {};
  const merged = mergeCharacterData(req.body, existing);
  if (!merged.ok) return res.status(400).json({ error: merged.error });
  const data = merged.data;

  const lastVersion = db.prepare(
    'SELECT saved_at FROM character_versions WHERE character_id = ? ORDER BY saved_at DESC LIMIT 1'
  ).get(req.params.id);
  const shouldSnapshot = !lastVersion ||
    (Date.now() - new Date(lastVersion.saved_at + 'Z').getTime()) > VERSION_SNAPSHOT_MIN_GAP_MINUTES * 60 * 1000;
  if (shouldSnapshot) {
    db.prepare('INSERT INTO character_versions (character_id, data) VALUES (?, ?)').run(req.params.id, row.data);
    const excess = db.prepare(
      'SELECT id FROM character_versions WHERE character_id = ? ORDER BY saved_at DESC LIMIT -1 OFFSET ?'
    ).all(req.params.id, VERSION_KEEP_MAX);
    excess.forEach(v => db.prepare('DELETE FROM character_versions WHERE id = ?').run(v.id));
  }

  const name = (data.charName || 'Unnamed').slice(0, 80);
  db.prepare("UPDATE characters SET data = ?, name = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(data), name, req.params.id);
  const updated = db.prepare('SELECT updated_at FROM characters WHERE id = ?').get(req.params.id);
  res.json({ ok: true, updatedAt: updated.updated_at });
});

app.get('/api/characters/:id/versions', requireAuth, (req, res) => {
  const row = db.prepare('SELECT id FROM characters WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Character not found, or not yours.' });
  const versions = db.prepare(
    'SELECT id, saved_at AS savedAt FROM character_versions WHERE character_id = ? ORDER BY saved_at DESC'
  ).all(req.params.id);
  res.json({ versions });
});

app.post('/api/characters/:id/versions/:versionId/restore', requireAuth, (req, res) => {
  const charRow = db.prepare('SELECT id, data FROM characters WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!charRow) return res.status(404).json({ error: 'Character not found, or not yours.' });
  const version = db.prepare(
    'SELECT data FROM character_versions WHERE id = ? AND character_id = ?'
  ).get(req.params.versionId, req.params.id);
  if (!version) return res.status(404).json({ error: 'Version not found.' });

  // Snapshot the CURRENT state before restoring, so restoring is itself undoable.
  db.prepare('INSERT INTO character_versions (character_id, data) VALUES (?, ?)').run(req.params.id, charRow.data);

  const current = parseStoredCharacter(charRow.data, charRow.id) || {};
  const incoming = parseStoredCharacter(version.data, req.params.id);
  if (!incoming) return res.status(500).json({ error: 'That version could not be read.' });
  const merged = mergeCharacterData(incoming, current);
  if (!merged.ok) return res.status(400).json({ error: merged.error });
  const restoredData = merged.data;
  const name = (restoredData.charName || 'Unnamed').slice(0, 80);
  db.prepare("UPDATE characters SET data = ?, name = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(restoredData), name, req.params.id);
  res.json({ ok: true, data: restoredData });
});

// Moving a character between sessions is owner-only, and restricted to
// sessions the owner is already a member of — otherwise they'd immediately
// lose access to their own character, since every read/write check requires
// session membership, not just ownership.
app.put('/api/characters/:id/move', requireAuth, (req, res) => {
  const targetSessionId = req.body && req.body.targetSessionId;
  if (!targetSessionId) return res.status(400).json({ error: 'targetSessionId required.' });

  const row = db.prepare('SELECT id, session_id FROM characters WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Character not found, or not yours to move.' });

  if (Number(targetSessionId) === row.session_id) return res.status(400).json({ error: 'Already in that session.' });
  if (!isMember(targetSessionId, req.user.id)) return res.status(403).json({ error: "You're not a member of that session." });

  const existing = db.prepare('SELECT COUNT(*) AS n FROM characters WHERE session_id = ? AND user_id = ?')
    .get(targetSessionId, req.user.id).n;
  if (existing >= MAX_CHARACTERS_PER_SESSION) {
    return res.status(429).json({ error: `You've reached the limit of ${MAX_CHARACTERS_PER_SESSION} characters for that session.` });
  }

  db.prepare("UPDATE characters SET session_id = ?, updated_at = datetime('now') WHERE id = ?")
    .run(targetSessionId, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/characters/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Character not found.' });
  const owner = row.user_id === req.user.id;
  const admin = isSessionAdmin(row.session_id, req.user.id);
  if (!owner && !admin) return res.status(403).json({ error: 'Not yours to delete.' });
  db.prepare('DELETE FROM characters WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Static frontend ----------
// Old bookmarks still use *.html query-string URLs. The Next UI lives at
// trailing-slash paths (/vault/, /sheet/?id=…). Keep both working.
const HTML_REDIRECTS = {
  '/vault.html': '/vault/',
  '/characters.html': '/vault/',
  '/session.html': '/session/',
  '/sheet.html': '/sheet/',
  '/import.html': '/import/',
  '/admin.html': '/admin/',
  '/compendium.html': '/compendium/',
  '/glossary.html': '/glossary/',
  '/index.html': '/',
};
app.get(Object.keys(HTML_REDIRECTS), (req, res) => {
  const dest = HTML_REDIRECTS[req.path];
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, dest + query);
});

const nextOut = path.join(__dirname, 'web', 'out');
if (fs.existsSync(nextOut)) {
  app.use(express.static(nextOut));
}
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`dnd-app listening on http://localhost:${PORT}`);
});

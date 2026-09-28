const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.SQLITE_PATH || path.join(__dirname, 'data.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Role-based site admin — replaces the old "whoever's display_name matches
// SITE_ADMIN_NAME" check, which had a real flaw: if that account were ever
// deleted, the next person to sign up with that exact name would silently
// become site admin. A role column tied to a specific user's id can't be
// re-acquired that way. ALTER TABLE ADD COLUMN has no "IF NOT EXISTS" in
// SQLite, so check the schema first — this needs to run safely every time
// the app starts, not just on a fresh database.
const userColumns = db.prepare("PRAGMA table_info(users)").all();
if (!userColumns.some(c => c.name === 'role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'");
}

// One-time bootstrap: if no one holds the site_admin role yet (either a
// fresh install, or the first run after this migration), and the old
// SITE_ADMIN_NAME env var is still set, promote whichever account currently
// matches it — preserves whoever was already the de facto admin, so this
// transition doesn't lock anyone out. After this runs once, the role column
// is the only thing that matters; SITE_ADMIN_NAME becomes inert.
{
  const hasAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'site_admin'").get();
  if (!hasAdmin && process.env.SITE_ADMIN_NAME) {
    const candidate = db.prepare('SELECT id FROM users WHERE display_name = ?').get(process.env.SITE_ADMIN_NAME);
    if (candidate) {
      db.prepare("UPDATE users SET role = 'site_admin' WHERE id = ?").run(candidate.id);
      console.log(`One-time migration: promoted "${process.env.SITE_ADMIN_NAME}" to site_admin role.`);
    }
  }
}

db.exec(`

-- A session is one campaign/table (e.g. "Curse of Strahd -- Tuesdays").
-- created_by is nullable so a bootstrap session can exist before any user
-- account does; the first person who joins it becomes its admin.
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_members (
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, user_id)
);

-- A character is owned by one player's vault, but lives inside one session.
-- Visible (read-only) to every member of that session; editable only by owner.
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'New Character',
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_session ON characters(session_id);
CREATE INDEX IF NOT EXISTS idx_session_members_user ON session_members(user_id);

-- Snapshots of a character's data over time, for undo/version history.
-- NOT written on every save (the app autosaves on every keystroke — that
-- would create hundreds of near-identical rows per editing session).
-- Only snapshotted when the most recent existing version is more than
-- VERSION_SNAPSHOT_MIN_GAP_MINUTES old (see server.js), so this captures
-- meaningful checkpoints over a session rather than noise.
CREATE TABLE IF NOT EXISTS character_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_character_versions_char ON character_versions(character_id);

-- Announced dice rolls for a session. The roller computes the result in the
-- browser (same as the local tray) and the server stores what was announced
-- so the rest of the table, including people who join late, see one log.
CREATE TABLE IF NOT EXISTS session_rolls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_session_rolls_session ON session_rolls(session_id, id);
`);

module.exports = db;

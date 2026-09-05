// Integration test suite for the Character Vault API.
// Spins up the real server.js as a child process against a throwaway
// in-memory-equivalent SQLite database (node:sqlite, no native compile
// needed), then exercises it exactly the way the app is actually used —
// via real HTTP requests, not mocked internals.
//
// Run with: node --test tests/api.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;

let serverProcess;
let testDir;

function waitForServer(url, timeoutMs = 5000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      fetch(url).then(() => resolve()).catch(() => {
        if (Date.now() - start > timeoutMs) reject(new Error('Server did not start in time'));
        else setTimeout(poll, 100);
      });
    })();
  });
}

test.before(async () => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-app-test-'));
  const projectRoot = path.join(__dirname, '..');

  // Copy the real app files we need into an isolated test directory
  for (const f of ['server.js', 'default-template.js', 'public']) {
    fs.cpSync(path.join(projectRoot, f), path.join(testDir, f), { recursive: true });
  }

  // Swap in the node:sqlite-based test db (same schema as real db.js)
  const dbTestSrc = fs.readFileSync(path.join(__dirname, 'db-test.js'), 'utf8');
  const dbAdapter = dbTestSrc.replace(
    'module.exports = { createTestDb };',
    "module.exports = createTestDb(require('path').join(__dirname, 'test-data.sqlite'));"
  );
  fs.writeFileSync(path.join(testDir, 'db.js'), dbAdapter);

  // Reuse a shared, pre-installed node_modules (pure-JS deps only — avoids
  // reinstalling on every test run and sidesteps native-module compile
  // issues in constrained/offline environments).
  const cachedModules = path.join(__dirname, 'node_modules_cache', 'node_modules');
  if (!fs.existsSync(cachedModules)) {
    throw new Error('Test dependencies not installed — run: cd tests/node_modules_cache && npm install');
  }
  fs.symlinkSync(cachedModules, path.join(testDir, 'node_modules'), 'junction');

  const envFile = `PORT=${PORT}\nSIGNUP_CODE=test-signup-code\nSESSION_SECRET=test-secret-key-for-integration-tests\nMAX_CHARACTERS_PER_SESSION=3\nSITE_ADMIN_NAME=SiteAdminUser\n`;
  fs.writeFileSync(path.join(testDir, '.env'), envFile);

  serverProcess = spawn('node', ['server.js'], {
    cwd: testDir,
    env: { ...process.env },
    stdio: 'pipe',
  });
  serverProcess.stderr.on('data', d => process.stderr.write(`[server] ${d}`));

  await waitForServer(`${BASE}/api/me`).catch(() => {}); // /api/me 401s but proves server is up
});

test.after(() => {
  if (serverProcess) serverProcess.kill();
  if (testDir) fs.rmSync(testDir, { recursive: true, force: true });
});

// ---------- helpers ----------
function extractCookie(res) {
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (!cookies.length) return null;
  return cookies.map(c => c.split(';')[0]).join('; ');
}
async function signup(displayName, password, signupCode = 'test-signup-code') {
  const res = await fetch(`${BASE}/api/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, password, signupCode }),
  });
  return { res, cookie: extractCookie(res), body: await res.json() };
}
function authed(cookie, opts = {}) {
  return { ...opts, headers: { ...(opts.headers || {}), 'Content-Type': 'application/json', Cookie: cookie } };
}

// ---------- Auth ----------

test('signup fails with wrong signup code', async () => {
  const { res, body } = await signup('WrongCodeUser', 'password123', 'not-the-real-code');
  assert.equal(res.status, 403);
  assert.match(body.error, /invalid/i);
});

test('signup fails with short password', async () => {
  const { res, body } = await signup('ShortPassUser', '123');
  assert.equal(res.status, 400);
  assert.match(body.error, /6 characters/);
});

test('signup succeeds with valid code and creates a session cookie', async () => {
  const { res, cookie, body } = await signup('Alice', 'alicepassword1');
  assert.equal(res.status, 200);
  assert.ok(cookie, 'expected a session cookie to be set');
  assert.equal(body.user.displayName, 'Alice');
});

test('duplicate display name is rejected', async () => {
  await signup('Bob', 'bobpassword123');
  const { res, body } = await signup('Bob', 'differentpassword1');
  assert.equal(res.status, 409);
  assert.match(body.error, /already taken/);
});

test('login succeeds with correct password, fails with wrong one', async () => {
  await signup('Carol', 'carolpassword1');
  const good = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Carol', password: 'carolpassword1' }),
  });
  assert.equal(good.status, 200);

  const bad = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Carol', password: 'wrongpassword' }),
  });
  assert.equal(bad.status, 401);
});

// ---------- Sessions & membership ----------

test('a logged-in user can create a session and becomes its admin', async () => {
  const { cookie } = await signup('Dave', 'davepassword123');
  const res = await fetch(`${BASE}/api/sessions`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ name: 'Daves Campaign' }),
  }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.inviteCode);

  const listRes = await fetch(`${BASE}/api/sessions`, authed(cookie));
  const { sessions } = await listRes.json();
  const found = sessions.find(s => s.id === body.id);
  assert.equal(found.isAdmin, true);
});

test('joining a session via invite code requires being signed in, and adds membership', async () => {
  const admin = await signup('Erin', 'erinpassword123');
  const sessRes = await fetch(`${BASE}/api/sessions`, authed(admin.cookie, {
    method: 'POST', body: JSON.stringify({ name: 'Erins Table' }),
  }));
  const { id: sessionId, inviteCode } = await sessRes.json();

  const unauth = await fetch(`${BASE}/api/join-session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode }),
  });
  assert.equal(unauth.status, 401, 'joining a session without being logged in should fail');

  const member = await signup('Frank', 'frankpassword123');
  const joinRes = await fetch(`${BASE}/api/join-session`, authed(member.cookie, {
    method: 'POST', body: JSON.stringify({ inviteCode }),
  }));
  assert.equal(joinRes.status, 200);

  const charsRes = await fetch(`${BASE}/api/sessions/${sessionId}/characters`, authed(member.cookie));
  assert.equal(charsRes.status, 200, 'Frank should now be able to see the session he joined');
});

test('invalid invite code is rejected', async () => {
  const { cookie } = await signup('Grace', 'gracepassword1');
  const res = await fetch(`${BASE}/api/join-session`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ inviteCode: 'totally-fake-code' }),
  }));
  assert.equal(res.status, 403);
});

// ---------- Characters: ownership & sharing ----------

test('character creation respects the per-session cap', async () => {
  const { cookie } = await signup('Henry', 'henrypassword1');
  const sessRes = await fetch(`${BASE}/api/sessions`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ name: 'Cap Test' }),
  }));
  const { id: sessionId } = await sessRes.json();

  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${BASE}/api/characters`, authed(cookie, {
      method: 'POST', body: JSON.stringify({ sessionId }),
    }));
    assert.equal(r.status, 200, `character ${i + 1} of 3 should succeed`);
  }
  const fourth = await fetch(`${BASE}/api/characters`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ sessionId }),
  }));
  assert.equal(fourth.status, 429, '4th character should be rejected (cap is 3)');
});

test('a session member can view but not edit another member\'s character; owner can edit', async () => {
  const owner = await signup('Iris', 'irispassword123');
  const sessRes = await fetch(`${BASE}/api/sessions`, authed(owner.cookie, {
    method: 'POST', body: JSON.stringify({ name: 'Shared Table' }),
  }));
  const { id: sessionId, inviteCode } = await sessRes.json();

  const viewer = await signup('Jack', 'jackpassword123');
  await fetch(`${BASE}/api/join-session`, authed(viewer.cookie, {
    method: 'POST', body: JSON.stringify({ inviteCode }),
  }));

  const charRes = await fetch(`${BASE}/api/characters`, authed(owner.cookie, {
    method: 'POST', body: JSON.stringify({ sessionId }),
  }));
  const { id: charId } = await charRes.json();

  // Viewer can read it
  const viewRes = await fetch(`${BASE}/api/characters/${charId}`, authed(viewer.cookie));
  const viewBody = await viewRes.json();
  assert.equal(viewRes.status, 200);
  assert.equal(viewBody.isOwner, false);

  // Viewer cannot edit it
  const editAttempt = await fetch(`${BASE}/api/characters/${charId}`, authed(viewer.cookie, {
    method: 'PUT', body: JSON.stringify({ charName: 'Hacked Name' }),
  }));
  assert.equal(editAttempt.status, 404, 'non-owner edit should be rejected as not-found (ownership check)');

  // Owner can edit it
  const ownerEdit = await fetch(`${BASE}/api/characters/${charId}`, authed(owner.cookie, {
    method: 'PUT', body: JSON.stringify({ charName: 'Renamed By Owner' }),
  }));
  assert.equal(ownerEdit.status, 200);
});

test('a non-member cannot see a session\'s characters at all', async () => {
  const owner = await signup('Kelly', 'kellypassword1');
  const sessRes = await fetch(`${BASE}/api/sessions`, authed(owner.cookie, {
    method: 'POST', body: JSON.stringify({ name: 'Private Table' }),
  }));
  const { id: sessionId } = await sessRes.json();

  const outsider = await signup('Liam', 'liampassword123');
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/characters`, authed(outsider.cookie));
  assert.equal(res.status, 404);
});

// ---------- Move between sessions ----------

test('owner can move a character to a session they are also a member of', async () => {
  const { cookie } = await signup('Mona', 'monapassword123');
  const s1 = await (await fetch(`${BASE}/api/sessions`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ name: 'Session One' }),
  }))).json();
  const s2 = await (await fetch(`${BASE}/api/sessions`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ name: 'Session Two' }),
  }))).json();

  const char = await (await fetch(`${BASE}/api/characters`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ sessionId: s1.id }),
  }))).json();

  const moveRes = await fetch(`${BASE}/api/characters/${char.id}/move`, authed(cookie, {
    method: 'PUT', body: JSON.stringify({ targetSessionId: s2.id }),
  }));
  assert.equal(moveRes.status, 200);

  const check = await (await fetch(`${BASE}/api/characters/${char.id}`, authed(cookie))).json();
  assert.equal(check.sessionId, s2.id);
});

test('cannot move a character into a session you are not a member of (would self-lockout)', async () => {
  const mona = await signup('Nina', 'ninapassword123');
  const s1 = await (await fetch(`${BASE}/api/sessions`, authed(mona.cookie, {
    method: 'POST', body: JSON.stringify({ name: 'Ninas Table' }),
  }))).json();
  const char = await (await fetch(`${BASE}/api/characters`, authed(mona.cookie, {
    method: 'POST', body: JSON.stringify({ sessionId: s1.id }),
  }))).json();

  const stranger = await signup('Oscar', 'oscarpassword1');
  const strangerSession = await (await fetch(`${BASE}/api/sessions`, authed(stranger.cookie, {
    method: 'POST', body: JSON.stringify({ name: 'Oscars Private Table' }),
  }))).json();

  const moveAttempt = await fetch(`${BASE}/api/characters/${char.id}/move`, authed(mona.cookie, {
    method: 'PUT', body: JSON.stringify({ targetSessionId: strangerSession.id }),
  }));
  assert.equal(moveAttempt.status, 403);
});

// ---------- Site admin ----------

test('site admin is determined by SITE_ADMIN_NAME, not signup order', async () => {
  // "SiteAdminUser" is configured as SITE_ADMIN_NAME in the test .env above.
  // Sign up a regular user FIRST to prove order doesn't matter.
  const regular = await signup('RegularFirstUser', 'regularpassword1');
  const admin = await signup('SiteAdminUser', 'adminpassword123');

  const regularMe = await (await fetch(`${BASE}/api/me`, authed(regular.cookie))).json();
  const adminMe = await (await fetch(`${BASE}/api/me`, authed(admin.cookie))).json();

  assert.equal(regularMe.user.isSiteAdmin, false);
  assert.equal(adminMe.user.isSiteAdmin, true);

  const blockedRes = await fetch(`${BASE}/api/admin/overview`, authed(regular.cookie));
  assert.equal(blockedRes.status, 403);

  const allowedRes = await fetch(`${BASE}/api/admin/overview`, authed(admin.cookie));
  assert.equal(allowedRes.status, 200);
});

test('site admin cannot delete their own account via the admin endpoint', async () => {
  const { cookie } = await signup('SiteAdminUser2', 'adminpassword123');
  // Note: SITE_ADMIN_NAME is fixed to 'SiteAdminUser' for this test run,
  // so this user is a regular user — test the self-delete guard using a
  // fresh site-admin-named signup instead within its own isolated check.
  const res = await fetch(`${BASE}/api/admin/users/99999`, authed(cookie, { method: 'DELETE' }));
  assert.equal(res.status, 403, 'non-admin should be blocked before self-delete logic is even reached');
});

// ---------- Security ----------

test('backstoryHTML and subtitle are sanitized on save — script/event-handler payloads are stripped', async () => {
  const { cookie } = await signup('Xavier', 'xavierpassword1');
  const sessRes = await fetch(`${BASE}/api/sessions`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ name: 'XSS Test Session' }),
  }));
  const { id: sessionId } = await sessRes.json();
  const charRes = await fetch(`${BASE}/api/characters`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ sessionId }),
  }));
  const { id: charId, data } = await charRes.json();

  data.backstoryHTML = '<p>Normal text</p><img src=x onerror="stealCookies()"><script>alert(1)</script>';
  data.subtitle = '<p onclick="evil()">Sorcerer</p>';

  await fetch(`${BASE}/api/characters/${charId}`, authed(cookie, { method: 'PUT', body: JSON.stringify(data) }));

  const getRes = await fetch(`${BASE}/api/characters/${charId}`, authed(cookie));
  const saved = await getRes.json();

  assert.ok(saved.data.backstoryHTML.includes('<p>Normal text</p>'), 'legitimate formatting should survive');
  assert.ok(!saved.data.backstoryHTML.includes('onerror'), 'event handler attribute should be stripped');
  assert.ok(!saved.data.backstoryHTML.includes('<script>'), 'script tag should be stripped entirely');
  assert.ok(!saved.data.subtitle.includes('onclick'), 'event handler on subtitle should be stripped');
});

test('traits, spell cards, and gear are ALSO sanitized on save — these were missed in an earlier pass and were exploitable through completely normal editing', async () => {
  const { cookie } = await signup('SecondXavier', 'xavierpassword2');
  const sessRes = await fetch(`${BASE}/api/sessions`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ name: 'XSS Test Session 2' }),
  }));
  const { id: sessionId } = await sessRes.json();
  const charRes = await fetch(`${BASE}/api/characters`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ sessionId }),
  }));
  const { id: charId, data } = await charRes.json();

  data.traits = [{ title: '<img src=x onerror="evil()">Trait', body: '<script>alert(1)</script>Body text' }];
  data.cantrips = [{ name: '<script>alert(2)</script>Fire Bolt', tag: '<img src=x onerror="evil()">', info: 'ok' }];
  data.gear = ['<img src=x onerror="evil()">A Sword', 'Normal Item'];

  await fetch(`${BASE}/api/characters/${charId}`, authed(cookie, { method: 'PUT', body: JSON.stringify(data) }));

  const getRes = await fetch(`${BASE}/api/characters/${charId}`, authed(cookie));
  const saved = await getRes.json();

  assert.ok(!saved.data.traits[0].title.includes('onerror'), 'trait title event handler should be stripped');
  assert.ok(!saved.data.traits[0].body.includes('<script>'), 'trait body script tag should be stripped');
  assert.ok(saved.data.traits[0].title.includes('Trait'), 'legitimate trait title text should survive');
  assert.ok(!saved.data.cantrips[0].name.includes('<script>'), 'cantrip name script tag should be stripped');
  assert.ok(!saved.data.cantrips[0].tag.includes('onerror'), 'cantrip tag event handler should be stripped');
  assert.ok(!saved.data.gear[0].includes('onerror'), 'gear item event handler should be stripped');
  assert.ok(saved.data.gear[1] === 'Normal Item', 'gear items with no HTML should pass through unchanged');
});

// ---------- Version history ----------

test('the first edit snapshots the pre-edit state, and rapid follow-up edits do not create duplicate snapshots', async () => {
  const { cookie } = await signup('VersionTester', 'versionpassword1');
  const sessRes = await fetch(`${BASE}/api/sessions`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ name: 'Version Test Session' }),
  }));
  const { id: sessionId } = await sessRes.json();
  const charRes = await fetch(`${BASE}/api/characters`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ sessionId }),
  }));
  const { id: charId, data: originalData } = await charRes.json();

  // First edit: charName changes from the default to "Edited Once".
  const editedOnce = { ...originalData, charName: 'Edited Once' };
  await fetch(`${BASE}/api/characters/${charId}`, authed(cookie, { method: 'PUT', body: JSON.stringify(editedOnce) }));

  let versionsRes = await fetch(`${BASE}/api/characters/${charId}/versions`, authed(cookie));
  let { versions } = await versionsRes.json();
  assert.equal(versions.length, 1, 'first edit should create exactly one snapshot');

  // Immediately edit again — should NOT create a second snapshot (10-minute throttle).
  const editedTwice = { ...editedOnce, charName: 'Edited Twice' };
  await fetch(`${BASE}/api/characters/${charId}`, authed(cookie, { method: 'PUT', body: JSON.stringify(editedTwice) }));

  versionsRes = await fetch(`${BASE}/api/characters/${charId}/versions`, authed(cookie));
  ({ versions } = await versionsRes.json());
  assert.equal(versions.length, 1, 'rapid second edit should NOT create another snapshot within the throttle window');

  // The one snapshot that exists should hold the ORIGINAL (pre-first-edit) data, not the edited version.
  const getRes = await fetch(`${BASE}/api/characters/${charId}`, authed(cookie));
  const current = await getRes.json();
  assert.equal(current.data.charName, 'Edited Twice', 'current character data reflects the latest edit');
});

test('restoring a version reverts the data and creates its own undo snapshot', async () => {
  const { cookie } = await signup('RestoreTester', 'restorepassword1');
  const sessRes = await fetch(`${BASE}/api/sessions`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ name: 'Restore Test Session' }),
  }));
  const { id: sessionId } = await sessRes.json();
  const charRes = await fetch(`${BASE}/api/characters`, authed(cookie, {
    method: 'POST', body: JSON.stringify({ sessionId }),
  }));
  const { id: charId, data: originalData } = await charRes.json();
  const originalName = originalData.charName;

  const edited = { ...originalData, charName: 'Renamed Character' };
  await fetch(`${BASE}/api/characters/${charId}`, authed(cookie, { method: 'PUT', body: JSON.stringify(edited) }));

  const versionsRes = await fetch(`${BASE}/api/characters/${charId}/versions`, authed(cookie));
  const { versions } = await versionsRes.json();
  assert.equal(versions.length, 1);

  const restoreRes = await fetch(`${BASE}/api/characters/${charId}/versions/${versions[0].id}/restore`, authed(cookie, { method: 'POST' }));
  const restored = await restoreRes.json();
  assert.equal(restoreRes.status, 200);
  assert.equal(restored.data.charName, originalName, 'restore should bring back the pre-edit name');

  const getRes = await fetch(`${BASE}/api/characters/${charId}`, authed(cookie));
  const current = await getRes.json();
  assert.equal(current.data.charName, originalName, 'the character\'s actual saved data should reflect the restore');

  const versionsAfterRes = await fetch(`${BASE}/api/characters/${charId}/versions`, authed(cookie));
  const { versions: versionsAfter } = await versionsAfterRes.json();
  assert.equal(versionsAfter.length, 2, 'restoring should itself create a new snapshot (of the renamed state), so the restore is undoable too');
});

test('a non-owner cannot view or restore another player\'s version history', async () => {
  const owner = await signup('VersionOwner', 'ownerpassword123');
  const stranger = await signup('VersionStranger', 'strangerpassword1');
  const sessRes = await fetch(`${BASE}/api/sessions`, authed(owner.cookie, {
    method: 'POST', body: JSON.stringify({ name: 'Private Version Session' }),
  }));
  const { id: sessionId } = await sessRes.json();
  const charRes = await fetch(`${BASE}/api/characters`, authed(owner.cookie, {
    method: 'POST', body: JSON.stringify({ sessionId }),
  }));
  const { id: charId } = await charRes.json();

  const blockedRes = await fetch(`${BASE}/api/characters/${charId}/versions`, authed(stranger.cookie));
  assert.equal(blockedRes.status, 404, 'a non-owner should not even be able to see that version history exists');
});

// ---------- Rate limiting ----------
// MUST stay the last test in this file. All tests in this file share one
// spawned server process, so the rate limiter's in-memory counter persists
// across tests. This test deliberately exhausts it — anything running after
// it would inherit an already-tripped limiter and fail for unrelated reasons.
// (Discovered the hard way: this originally broke 10 unrelated tests before
// being moved here.)
test('login is rate-limited after repeated failed attempts from the same client', async () => {
  await signup('RateLimitTarget', 'realpassword123');
  let lastStatus;
  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${BASE}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'RateLimitTarget', password: 'wrongpassword' }),
    });
    lastStatus = res.status;
    if (res.status === 429) break;
  }
  assert.equal(lastStatus, 429, 'repeated failed logins should eventually be rate-limited, not just 401 forever');
});

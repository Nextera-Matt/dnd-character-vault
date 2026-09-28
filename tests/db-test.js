// Test-only db.js using Node's built-in sqlite (no native compile needed).
// Same schema as the real db.js — kept in sync manually since better-sqlite3
// can't be installed in constrained CI/sandbox environments without network
// access to compile it. This is a known tradeoff, documented in Phase 0.
const { DatabaseSync } = require('node:sqlite');

function createTestDb(path = ':memory:') {
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
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
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'New Character',
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS character_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      saved_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
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
  `);
  return {
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        get: (...a) => stmt.get(...a),
        all: (...a) => stmt.all(...a),
        run: (...a) => { const info = stmt.run(...a); return { lastInsertRowid: info.lastInsertRowid, changes: info.changes }; },
      };
    },
    exec: (sql) => raw.exec(sql),
    close: () => raw.close(),
  };
}

module.exports = { createTestDb };

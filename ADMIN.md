# Character Vault — Backend Admin Reference

No `sqlite3` CLI is installed on the box, so everything below uses the `better-sqlite3` Node module already sitting in `/opt/dnd-app/node_modules` — no extra install needed. Run these from `/opt/dnd-app`.

**Before anything destructive:** back up the database first.
```bash
cp /opt/dnd-app/data.sqlite /opt/dnd-app/data.sqlite.bak-$(date +%Y%m%d-%H%M)
```

---

## Looking things up

**All users:**
```bash
node -e "
const db = require('better-sqlite3')('data.sqlite');
console.log(db.prepare('SELECT id, display_name, created_at FROM users').all());
"
```

**All sessions, with their admin's user id:**
```bash
node -e "
const db = require('better-sqlite3')('data.sqlite');
console.log(db.prepare('SELECT id, name, invite_code, created_by FROM sessions').all());
"
```

**All characters, with owner and session name:**
```bash
node -e "
const db = require('better-sqlite3')('data.sqlite');
console.log(db.prepare(\`
  SELECT c.id, c.name, u.display_name AS owner, s.name AS session
  FROM characters c
  JOIN users u ON u.id = c.user_id
  JOIN sessions s ON s.id = c.session_id
\`).all());
"
```

**Who's a member of which session:**
```bash
node -e "
const db = require('better-sqlite3')('data.sqlite');
console.log(db.prepare(\`
  SELECT s.name AS session, u.display_name AS member, sm.joined_at
  FROM session_members sm
  JOIN sessions s ON s.id = sm.session_id
  JOIN users u ON u.id = sm.user_id
  ORDER BY s.name
\`).all());
"
```

---

## Deleting things

**Delete a user by id** (cascades — also removes their session memberships and every character they own, everywhere):
```bash
node -e "
const db = require('better-sqlite3')('data.sqlite');
db.prepare('DELETE FROM users WHERE id = ?').run(1);
console.log('deleted');
"
```

**Delete a user by name instead of id:**
```bash
node -e "
const db = require('better-sqlite3')('data.sqlite');
db.prepare('DELETE FROM users WHERE display_name = ?').run('matt');
console.log('deleted');
"
```

**Delete a single character by id:**
```bash
node -e "
const db = require('better-sqlite3')('data.sqlite');
db.prepare('DELETE FROM characters WHERE id = ?').run(5);
console.log('deleted');
"
```

**Delete a whole session** (cascades — removes memberships and every character in it):
```bash
node -e "
const db = require('better-sqlite3')('data.sqlite');
db.prepare('DELETE FROM sessions WHERE id = ?').run(2);
console.log('deleted');
"
```

**Wipe everything and start completely fresh:**
```bash
sudo systemctl stop dnd-app
rm /opt/dnd-app/data.sqlite /opt/dnd-app/data.sqlite-*
sudo systemctl start dnd-app
```

---

## Fixing an account

**Reset someone's password** (they forgot it — no in-app reset flow exists yet):
```bash
node -e "
const bcrypt = require('bcryptjs');
const db = require('better-sqlite3')('data.sqlite');
const hash = bcrypt.hashSync('theirNewPassword123', 10);
db.prepare('UPDATE users SET password_hash = ? WHERE display_name = ?').run(hash, 'matt');
console.log('password reset');
"
```

**Rename a user** (careful — display name doubles as their login, and must stay unique):
```bash
node -e "
const db = require('better-sqlite3')('data.sqlite');
db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run('New Name', 1);
console.log('renamed');
"
```

---

## Want a real SQL prompt instead?

```bash
sudo dnf install sqlite -y
sqlite3 /opt/dnd-app/data.sqlite
```
Then standard SQL, `.tables` to list tables, `.quit` to exit.

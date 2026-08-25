#!/usr/bin/env node
// Backs up the Character Vault database using better-sqlite3's own backup
// API — safe to run while the app is live (WAL-mode aware), and doesn't
// depend on the sqlite3 CLI tool being installed on the box.
//
// Usage: node scripts/backup.js
// Intended to run via cron — see scripts/backup-cron-setup.md

const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { execSync } = require('child_process');

const APP_DIR = '/opt/dnd-app';
const BACKUP_DIR = '/root/backups/dnd-app';
const RETENTION_DAYS = 14;

const dbPath = path.join(APP_DIR, 'data.sqlite');
if (!fs.existsSync(dbPath)) {
  console.error(`ERROR: ${dbPath} not found — nothing to back up.`);
  process.exit(1);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const rawBackupPath = path.join(BACKUP_DIR, `data-${timestamp}.sqlite`);
const gzPath = `${rawBackupPath}.gz`;

const Database = require(path.join(APP_DIR, 'node_modules', 'better-sqlite3'));
const db = new Database(dbPath, { readonly: true });
db.backup(rawBackupPath)
  .then(() => {
    db.close();
    const input = fs.readFileSync(rawBackupPath);
    fs.writeFileSync(gzPath, zlib.gzipSync(input));
    fs.unlinkSync(rawBackupPath);
    console.log(`Backed up to ${gzPath}`);

    // Prune backups older than RETENTION_DAYS
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(BACKUP_DIR)) {
      if (!f.startsWith('data-') || !f.endsWith('.sqlite.gz')) continue;
      const full = path.join(BACKUP_DIR, f);
      if (fs.statSync(full).mtimeMs < cutoff) {
        fs.unlinkSync(full);
        console.log(`Pruned old backup: ${f}`);
      }
    }

    console.log('Current backups:');
    execSync(`ls -lh "${BACKUP_DIR}"`, { stdio: 'inherit' });
  })
  .catch(err => {
    console.error('Backup failed:', err);
    process.exit(1);
  });

# Setting up automated backups

## One-time setup on the VPS

```bash
cd /opt/dnd-app
node scripts/backup.js   # run once manually to confirm it works
```

You should see `Backed up to /root/backups/dnd-app/data-<timestamp>.sqlite.gz`.

## Schedule it with cron

```bash
sudo crontab -e
```

Add this line for a nightly backup at 3am:

```
0 3 * * * cd /opt/dnd-app && /usr/bin/node scripts/backup.js >> /var/log/dnd-app-backup.log 2>&1
```

Adjust `/usr/bin/node` if `which node` shows a different path.

## Getting backups off the box (important)

Backups sitting on the same VPS as the app don't protect you from a disk
failure or a bad `rm`. Options, roughly in order of effort:

- **Simplest**: periodically `scp` the `/root/backups/dnd-app/` folder down
  to your own machine
- **Better**: sync to an object storage bucket (Backblaze B2, or OVH's own
  Object Storage) with a small script or `rclone`, added as a second cron
  job right after the backup one
- **Best**: if you migrate to a managed Postgres later (see the main
  roadmap doc), most providers include automated off-box backups as part
  of the service — one less thing to maintain yourself

## Restoring from a backup

```bash
gunzip -k /root/backups/dnd-app/data-<timestamp>.sqlite.gz
sudo systemctl stop dnd-app
sudo cp /root/backups/dnd-app/data-<timestamp>.sqlite /opt/dnd-app/data.sqlite
sudo chown rocky:rocky /opt/dnd-app/data.sqlite
sudo systemctl start dnd-app
```

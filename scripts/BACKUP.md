# TorqueDesk off-box backup (Google Drive via rclone)

Nightly dump of the whole database + uploads + on-box backups to Google
Drive, with 30-day retention and a status endpoint that lets the admin UI
see at a glance whether backups are healthy.

## Prerequisites
- rclone installed on the host (`curl https://rclone.org/install.sh | sudo bash`).
- rclone configured with a remote named `gdrive` (see the step-by-step
  Google Drive guide in the admin chat log, or `rclone config`).
- Verify from the host: `sudo rclone lsd gdrive:` lists Drive folders.
- Docker Compose stack running (so `docker compose exec db pg_dump` works).

## Install (one time)

```bash
# 1. Copy the script and systemd units into place
sudo install -m 0755 scripts/rclone-backup.sh         /opt/torquedesk/scripts/rclone-backup.sh
sudo install -m 0644 scripts/torquedesk-backup.service /etc/systemd/system/torquedesk-backup.service
sudo install -m 0644 scripts/torquedesk-backup.timer   /etc/systemd/system/torquedesk-backup.timer

# 2. Review the environment vars in the .service file.
#    - TD_COMPOSE_DIR must point at the folder with your docker-compose.yml.
#    - TD_UPLOAD_DIR must be the host path of the /data volume.
#      Find it with: docker volume inspect torquedesk_data | grep Mountpoint
sudo nano /etc/systemd/system/torquedesk-backup.service

# 3. Enable the timer
sudo systemctl daemon-reload
sudo systemctl enable --now torquedesk-backup.timer
sudo systemctl list-timers torquedesk-backup.timer

# 4. Do a one-off test run and watch the log
sudo systemctl start torquedesk-backup.service
sudo tail -f /var/log/torquedesk-backup.log
```

## Verify in the admin UI

Open **/p/admin/backups**. The "Full database dump" card now shows an
**Offsite backup** chip:
- 🟢 "last offsite backup: 7h ago (142 MB)" → everything is working.
- 🟠 "last offsite backup: 2d ago" → check the timer: `systemctl status torquedesk-backup.timer`.
- 🔴 "backup failed: …" → see `/var/log/torquedesk-backup.log`.

## Restore from a Drive backup to a brand-new server

```bash
# On the new host
cd /opt/torquedesk
docker compose up -d db

# Pick a backup to restore (list them)
sudo rclone lsf gdrive:torquedesk-backups/

TS=20261013-023000   # pick the folder name
mkdir -p /tmp/restore && cd /tmp/restore
sudo rclone copy gdrive:torquedesk-backups/${TS}/ ./

# Restore the database
gunzip -c db.sql.gz | docker compose exec -T db psql -U torquedesk torquedesk

# Restore the uploads
sudo tar xzf uploads.tar.gz -C /var/lib/docker/volumes/torquedesk_data/_data/
sudo tar xzf onbox-backups.tar.gz -C /var/lib/docker/volumes/torquedesk_data/_data/  # optional

# Start the app
docker compose up -d server
```

## Retention
Default is 30 days (configurable via `RETAIN_DAYS` in the systemd unit).
Google Drive's own trash keeps deleted items another 30 days, so you have
~60 days of recoverability.

## Running on-demand without waiting for the timer
```bash
sudo systemctl start torquedesk-backup.service
# or
sudo /opt/torquedesk/scripts/rclone-backup.sh
```

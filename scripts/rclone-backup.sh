#!/usr/bin/env bash
# TorqueDesk off-box backup to Google Drive via rclone.
#
# What it does, in order:
#   1. pg_dump the whole Postgres database → gzip
#   2. tar the uploads directory
#   3. tar the on-box backups directory (so manual archives flow off-site too)
#   4. rclone copy the three files to gdrive:torquedesk-backups/<timestamp>/
#   5. rclone delete anything older than $RETAIN_DAYS from gdrive
#   6. write /data/backups/offsite-status.json so the admin UI can show
#      "last offsite backup OK" without re-running anything
#
# Idempotent + safe to run from cron. Locks itself so overlapping runs are
# a no-op. Exits non-zero on any failure.
#
# Config (override via env):
#   TD_COMPOSE_DIR     where docker-compose.yml lives            (default: /opt/torquedesk)
#   TD_DB_SERVICE      compose service name of the DB            (default: db)
#   TD_DB_USER         Postgres user                             (default: torquedesk)
#   TD_DB_NAME         Postgres database                         (default: torquedesk)
#   TD_UPLOAD_DIR      host path mounted to /data in container   (default: /var/lib/docker/volumes/torquedesk_data/_data)
#   TD_STATUS_FILE     where to drop status JSON                 (default: $TD_UPLOAD_DIR/backups/offsite-status.json)
#   TD_REMOTE          rclone remote:path                        (default: gdrive:torquedesk-backups)
#   RETAIN_DAYS        delete remote files older than N days     (default: 30)

set -eo pipefail

: "${TD_COMPOSE_DIR:=/opt/torquedesk}"
: "${TD_DB_SERVICE:=db}"
: "${TD_DB_USER:=torquedesk}"
: "${TD_DB_NAME:=torquedesk}"
: "${TD_UPLOAD_DIR:=/var/lib/docker/volumes/torquedesk_data/_data}"
: "${TD_STATUS_FILE:=${TD_UPLOAD_DIR}/backups/offsite-status.json}"
: "${TD_REMOTE:=gdrive:torquedesk-backups}"
: "${RETAIN_DAYS:=30}"

LOCK="/var/run/torquedesk-backup.lock"
TS=$(date -u +%Y%m%d-%H%M%S)
STAGE="/tmp/td-backup-${TS}"
LOG_LINE_PREFIX="[$(date -u +%FT%TZ)] "

log() { echo "${LOG_LINE_PREFIX}$*"; }
die() {
  local msg="$1"
  log "FAIL: $msg"
  write_status "fail" "$msg" 0 0
  exit 1
}

write_status() {
  local status="$1" message="$2" size_bytes="$3" duration_s="$4"
  mkdir -p "$(dirname "$TD_STATUS_FILE")" 2>/dev/null || true
  cat > "$TD_STATUS_FILE" <<EOF
{
  "status": "${status}",
  "message": "${message//\"/\\\"}",
  "timestamp": "$(date -u +%FT%TZ)",
  "remote": "${TD_REMOTE}/${TS}",
  "sizeBytes": ${size_bytes},
  "durationSeconds": ${duration_s}
}
EOF
}

# Prevent concurrent runs. Non-blocking.
exec 9>"$LOCK" || die "cannot open lockfile $LOCK"
flock -n 9 || { log "another backup is running — exiting"; exit 0; }

START=$(date +%s)
log "starting offsite backup → ${TD_REMOTE}/${TS}"

command -v rclone >/dev/null || die "rclone is not installed. See https://rclone.org/install"
command -v docker >/dev/null || die "docker is not available on this host"

mkdir -p "$STAGE"
trap 'rm -rf "$STAGE"' EXIT

# 1. Database dump
log "pg_dump…"
cd "$TD_COMPOSE_DIR"
docker compose exec -T "$TD_DB_SERVICE" pg_dump \
    --no-owner --no-privileges --clean --if-exists \
    -U "$TD_DB_USER" "$TD_DB_NAME" \
  | gzip -9 > "$STAGE/db.sql.gz" \
  || die "pg_dump failed"
log "  db.sql.gz $(du -h "$STAGE/db.sql.gz" | awk '{print $1}')"

# 2. Uploads (customer photos, document attachments, etc.)
if [ -d "$TD_UPLOAD_DIR/uploads" ]; then
  log "tar uploads…"
  tar czf "$STAGE/uploads.tar.gz" -C "$TD_UPLOAD_DIR" uploads \
    || die "uploads tar failed"
  log "  uploads.tar.gz $(du -h "$STAGE/uploads.tar.gz" | awk '{print $1}')"
else
  log "uploads directory not found at $TD_UPLOAD_DIR/uploads — skipping"
fi

# 3. On-box backups directory (so manual pg_dumps + per-tenant zips go offsite too).
#    Exclude the status file so we never recursively archive ourselves.
if [ -d "$TD_UPLOAD_DIR/backups" ]; then
  log "tar on-box backups…"
  tar czf "$STAGE/onbox-backups.tar.gz" \
      --exclude="offsite-status.json" \
      -C "$TD_UPLOAD_DIR" backups \
    || die "on-box backups tar failed"
  log "  onbox-backups.tar.gz $(du -h "$STAGE/onbox-backups.tar.gz" | awk '{print $1}')"
fi

# 4. Push to Drive
log "rclone copy → $TD_REMOTE/$TS/"
rclone copy "$STAGE" "${TD_REMOTE}/${TS}/" \
  --transfers=4 --checkers=4 --stats=0 --fast-list \
  || die "rclone copy failed"

TOTAL=$(du -sb "$STAGE" | awk '{print $1}')
log "pushed $(numfmt --to=iec "$TOTAL" 2>/dev/null || echo "$TOTAL bytes")"

# 5. Prune old remote backups
log "pruning remote files older than ${RETAIN_DAYS}d…"
rclone delete "$TD_REMOTE" --min-age "${RETAIN_DAYS}d" --rmdirs 2>&1 | tail -5 || true

DURATION=$(( $(date +%s) - START ))
write_status "ok" "backup complete" "$TOTAL" "$DURATION"
log "done in ${DURATION}s. status at $TD_STATUS_FILE"

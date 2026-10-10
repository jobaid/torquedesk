# Migrate apps.2set.com to Docker — zero data loss

This moves the TorqueDesk server from the current bare-metal `systemd` setup
to Docker Compose on the same host, without losing any company, user,
customer, document, photo, backup, or encrypted secret.

Everything that must survive:

| What                                 | Where it lives now | Where it'll live |
|--------------------------------------|--------------------|------------------|
| Postgres rows (every table)          | local Postgres     | `torquedesk_db` volume |
| Uploaded photos                      | `~/torquedesk/uploads/` | `torquedesk_data` volume (`/data/uploads`) |
| Weekly ZIP backups                   | `~/torquedesk/backups/` | `torquedesk_data` volume (`/data/backups`) |
| `TORQUEDESK_SECRET_KEY`              | systemd service env | `.env` next to compose file |
| OAuth client IDs/secrets             | systemd service env | `.env` next to compose file |

**If you lose `TORQUEDESK_SECRET_KEY`, every encrypted row becomes unreadable** — SMTP passwords, OAuth refresh tokens, Stripe secret keys. Copy it before anything else.

---

## 1. Copy the current encryption key + env

```bash
# On the server, pull the current secret key out of systemd:
sudo systemctl show torquedesk -p Environment --no-pager
```

Copy every `TORQUEDESK_SECRET_KEY=…` and `*_OAUTH_*` value you see. You'll paste them into `.env` in step 4.

## 2. Dump the current database

```bash
mkdir -p ~/migration
sudo -u postgres pg_dump -Fc torquedesk > ~/migration/torquedesk.dump
# Sanity check — should be at least a few MB:
ls -lh ~/migration/torquedesk.dump
```

## 3. Snapshot uploads + backups

```bash
tar czf ~/migration/data.tgz -C ~/torquedesk uploads backups 2>/dev/null || \
tar czf ~/migration/data.tgz -C ~/torquedesk uploads
```

## 4. Install Docker + stop the old service

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl stop torquedesk        # stop the old server
sudo systemctl disable torquedesk     # don't let systemd restart it
```

## 5. Create the .env file

```bash
cd ~/torquedesk
cp .env.example .env
nano .env
```

- `DB_PASSWORD` — pick a long random string (not reused elsewhere).
- `TORQUEDESK_SECRET_KEY` — **exactly** what you copied in step 1.
- OAuth values — whatever you had in systemd.

## 6. Build and start the containers

```bash
sudo docker compose up -d --build
sudo docker compose logs -f server    # Ctrl-C once you see "listening on :8080"
```

The DB container starts empty; the server runs its migrations against the fresh DB. We'll overwrite that with your real data next.

## 7. Restore your real data

```bash
# Load the dump into the containerised Postgres. --clean drops the empty
# tables the server just created and replaces them with your real ones.
sudo docker compose exec -T db pg_restore --clean --if-exists -U torquedesk -d torquedesk < ~/migration/torquedesk.dump

# Restore uploads + backups into the data volume.
sudo docker run --rm -v torquedesk_torquedesk_data:/data -v ~/migration:/mig alpine \
     sh -c "cd /data && tar xzf /mig/data.tgz"

# Bounce the server so it picks up the restored rows cleanly.
sudo docker compose restart server
sudo docker compose logs --tail=20 server
```

Expected log line: `applied migration …` for any new ones since your dump, then `TorqueDesk API listening on :8080`.

## 8. Point nginx at the container

Edit `/etc/nginx/sites-enabled/apps.2set.com` and make the upstream `127.0.0.1:8080` (same as before — the container exposes the same port on localhost). If it already was, no change needed. Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 9. Smoke-test

- https://apps.2set.com — shop login should work with existing credentials.
- https://apps.2set.com/p/admin — owner login should work.
- Open any company → owners show up, subscription + add-ons visible.
- Open a repair order → customer, items, photos all intact.
- Open an inspection → photos load.
- Settings → Backup → "Download latest" works.

If anything is off, roll back:

```bash
sudo docker compose down
sudo systemctl enable --now torquedesk    # back to bare-metal
```

Nothing was deleted during the migration; your old Postgres data directory and `~/torquedesk/uploads` are untouched.

## 10. Clean up (only after a day or two of smoke-test)

```bash
rm -rf ~/migration                       # remove the dump + tarball
# Keep the bare-metal binary + files around for a week in case you need to roll back.
```

---

## Day-2 ops

### View logs
```bash
sudo docker compose logs -f server
sudo docker compose logs -f db
```

### Upgrade to a new TorqueDesk release
```bash
cd ~/torquedesk && git pull
sudo docker compose build server
sudo docker compose up -d server
```

### Backup the containerised DB
```bash
sudo docker compose exec -T db pg_dump -Fc -U torquedesk torquedesk > ~/backup-$(date +%F).dump
```

### Backup the uploads/backups volume
```bash
sudo docker run --rm -v torquedesk_torquedesk_data:/data -v ~:/out alpine \
     tar czf /out/data-$(date +%F).tgz -C /data .
```

Store both files off-server (S3, Backblaze, your laptop) regularly.

### Rotate the Postgres password
Change `DB_PASSWORD` in `.env`, then:
```bash
# Update the DB user password:
sudo docker compose exec db psql -U torquedesk -c "ALTER USER torquedesk WITH PASSWORD 'NEW_PASSWORD';"
# Then restart the server so its DATABASE_URL picks it up:
sudo docker compose up -d server
```

**Do not** rotate `TORQUEDESK_SECRET_KEY` without first exporting every encrypted
secret with the old key and re-encrypting with the new one. Breaking that key
= losing SMTP passwords, OAuth tokens, Stripe secrets.

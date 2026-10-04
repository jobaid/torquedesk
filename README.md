# TorqueDesk

Repair information + shop workflow app.

- **Frontend:** React + Vite + Zustand (`src/`)
- **Backend:** Go REST API (`server/`)
- **Database:** PostgreSQL

## Run (development)

Terminal 1, API (starts an embedded PostgreSQL 16 in `server/.data` unless `DATABASE_URL` is set):

    npm run api                      # or: cd server && go run .

Terminal 2, frontend (proxies `/api` to http://localhost:8080):

    npm install
    npm run dev                      # http://localhost:5173

Production-style: `npm run build`, then `cd server && go build -o torquedesk-server . && ./torquedesk-server`.
This serves the API and the built `dist/` on http://localhost:8080.

Use an existing PostgreSQL:

    DATABASE_URL=postgres://user:pass@host:5432/torquedesk?sslmode=disable go run .

Migrations in `server/internal/db/migrations` run automatically at startup.

## What lives where

| Data | Stored in |
|------|-----------|
| Shop settings, staff, licenses, labor/tax/markup/fees, numbering, printing, document options, header/footer, audit log | PostgreSQL |
| Estimates, repair orders, invoices (with a frozen settings snapshot each) | PostgreSQL |
| Customers & their vehicles, favorites, search history, theme | Browser (localStorage) — not yet migrated |

## Settings architecture

- `server/internal/api/settings.go` declares each settings table as a `Resource` with `Field`s.
  Validation, GET/POST/PUT/PATCH/DELETE, row locking and audit logging come from `resource.go`.
  To add a setting: add a column in a new migration, add a `Field`, and add it to the UI page.
- `src/pages/settings/SettingsLayout.jsx` lists the settings pages. `kit.jsx` holds the shared form, list, unsaved-changes and permission helpers.

## Historical documents

When a document is created, the server stores `settings_snapshot`: labor rate, active taxes, shop fees, markups, document options, odometer unit and estimate validity.
All totals are computed from the snapshot (`src/lib/totals.js`), so changing settings never changes existing documents.
**Apply current settings** on a document is the explicit way to recalculate it.

## Permissions

| Role | Permissions |
|------|-------------|
| admin | everything |
| advisor | document settings, staff, documents |
| technician | view settings, edit documents |
| apprentice | read-only |

The API enforces these on every write. Login is a demo sign-in (any name, email and role). Replace `server/internal/api/auth.go` `login` with a real identity provider before production.

## Tests

    npm run test:totals              # fee/tax math (unit)

Repair data is sample content for demonstration — not OEM service information.

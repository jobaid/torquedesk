package api

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

// ---------------------------------------------------------------------------
// Tenant plumbing.
//
// Every authenticated main-app session carries a company_id baked into the
// signed token (see User.CompanyID). Data queries scope by that id.
//
// companyFrom(ctx) retrieves it. demoCompanyID() returns the backfill tenant
// used by the legacy /api/auth/login so pre-tenancy workflows keep working.
//
// requireActiveTenant is middleware that short-circuits requests from a
// company whose status is 'suspended', 'expired', or 'cancelled' with a 403
// so that no data query runs at all for an inactive tenant.
// ---------------------------------------------------------------------------

// companyFrom returns the authenticated user's company id (empty string for
// the saas_owner role, which doesn't belong to any tenant).
func companyFrom(ctx context.Context) string { return userFrom(ctx).CompanyID }

// demoCompanyID is cached: the migration creates it with a stable company_code.
type demoCache struct {
	sync.RWMutex
	id string
}

var demoC demoCache

func (s *Server) demoCompanyID(ctx context.Context) (string, error) {
	demoC.RLock()
	id := demoC.id
	demoC.RUnlock()
	if id != "" {
		return id, nil
	}
	demoC.Lock()
	defer demoC.Unlock()
	if demoC.id != "" {
		return demoC.id, nil
	}
	var out string
	err := s.db.QueryRow(ctx, `SELECT id::text FROM companies WHERE company_code = 'DEMO-SHOP-001'`).Scan(&out)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	// Self-heal: if the demo row has been deleted (or never seeded for some
	// reason), create it here so legacy demo logins never fail with a
	// "pre-tenancy" 401 on a fresh database.
	if out == "" {
		if err := s.db.QueryRow(ctx, `INSERT INTO companies
			(company_code, slug, name, legal_name, status, application_url, industry, timezone, notes)
			VALUES ('DEMO-SHOP-001', 'demo', 'Demo Shop', 'TorqueDesk Demo Shop', 'active', '/', 'Automotive', 'America/New_York',
				'Auto-created by tenancy.go self-heal.')
			ON CONFLICT (company_code) DO UPDATE SET updated_at = now()
			RETURNING id::text`).Scan(&out); err != nil {
			return "", err
		}
		// Seed per-company default settings for the newly-created demo tenant so
		// /api/settings returns 200 instead of 404 on first request.
		if err := s.tx(ctx, func(tx pgx.Tx) error { return s.InitCompanyDefaults(ctx, tx, out) }); err != nil {
			return "", err
		}
	}
	demoC.id = out
	return out, nil
}

// tenantStatus checks a company's current status. Cached briefly to keep
// per-request overhead minimal while still responding to a suspension
// within seconds.
type statusCache struct {
	sync.RWMutex
	m map[string]statusEntry
}

type statusEntry struct {
	status string
	until  time.Time
}

var statusC = statusCache{m: map[string]statusEntry{}}

func (s *Server) companyStatus(ctx context.Context, id string) (string, error) {
	statusC.RLock()
	e, ok := statusC.m[id]
	statusC.RUnlock()
	if ok && time.Now().Before(e.until) {
		return e.status, nil
	}
	var status string
	if err := s.db.QueryRow(ctx, `SELECT status FROM companies WHERE id::text = $1`, id).Scan(&status); err != nil {
		return "", err
	}
	statusC.Lock()
	statusC.m[id] = statusEntry{status: status, until: time.Now().Add(10 * time.Second)}
	statusC.Unlock()
	return status, nil
}

// invalidateCompanyStatus is called when the owner portal changes a company's
// access so the next data request sees the new status immediately.
func invalidateCompanyStatus(id string) {
	statusC.Lock()
	delete(statusC.m, id)
	statusC.Unlock()
}

var errTenantInactive = errors.New("tenant inactive")

// requireActiveTenant wraps a handler so a suspended/expired/cancelled
// company's token is accepted (the user can still log out and read /api/me)
// only on a short allowlist of endpoints; everything else returns 403.
func (s *Server) requireActiveTenant(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := companyFrom(r.Context())
		if cid == "" {
			h(w, r)
			return
		}
		status, err := s.companyStatus(r.Context(), cid)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeErr(w, 403, "Your company account no longer exists.")
				return
			}
			handleErr(w, err)
			return
		}
		if status == "suspended" || status == "expired" || status == "cancelled" {
			writeJSON(w, 403, map[string]any{
				"error":         "Your TorqueDesk subscription is currently " + status + ".",
				"companyStatus": status,
			})
			return
		}
		h(w, r)
	}
}

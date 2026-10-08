package api

// Repair / resync utilities. Reports (parts profit, payments, tax) read from
// the denormalized document_lines / document_taxes / document_fees tables.
// recalcDocument() keeps those in sync whenever a document is created or
// patched, but a backup restore inserts raw document rows without triggering
// a recalc — the child tables end up empty and the reports show nothing even
// though the data is actually present inside documents.items JSONB.
//
// RepairDocumentChildren walks the whole DB (or a single tenant), finds any
// document whose line/tax/fee child rows are missing or stale, and runs
// recalcDocument. Idempotent and safe to call repeatedly.

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/jackc/pgx/v5"
)

func (s *Server) repairRoutes(mux *http.ServeMux) {
	// Shop owner / manager can trigger a repair for their own tenant.
	mux.HandleFunc("POST /api/reports/resync", s.auth("shop.edit", s.resyncMyReports))
	// SaaS owner can repair everything.
	mux.HandleFunc("POST /api/owner/repair/documents", s.ownerAuth(s.resyncAllReports))
}

func (s *Server) resyncMyReports(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	n, err := s.repairChildrenForCompany(r.Context(), cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "recalculated": n})
}

func (s *Server) resyncAllReports(w http.ResponseWriter, r *http.Request) {
	n, err := s.repairChildrenForCompany(r.Context(), "")
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "recalculated": n})
}

// repairChildrenForCompany re-runs recalcDocument for every document in the
// given company (or every company when cid is empty). Prefers docs whose
// child tables are empty but a non-empty items JSONB exists — but we don't
// bother being clever; just recompute all of them. Each doc is its own
// transaction so one bad row doesn't poison the whole run.
func (s *Server) repairChildrenForCompany(ctx context.Context, cid string) (int, error) {
	q := `SELECT id::text FROM documents`
	args := []any{}
	if cid != "" {
		q += ` WHERE company_id::text = $1`
		args = append(args, cid)
	}
	q += ` ORDER BY created_at`
	rows, err := s.db.Query(ctx, q, args...)
	if err != nil {
		return 0, err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	recalculated := 0
	for _, id := range ids {
		err := s.tx(ctx, func(tx pgx.Tx) error { return recalcDocument(ctx, tx, id) })
		if err != nil {
			log.Printf("repair: doc %s: %v (skipped)", id, err)
			continue
		}
		recalculated++
	}
	return recalculated, nil
}

// StartReportsRepairAtBoot runs the repair once, 90 seconds after startup, if
// REPAIR_ON_BOOT=1. Off by default — not every boot should walk the whole
// database. Flip it on after a restore or a schema change that reset the
// child tables.
func (s *Server) StartReportsRepairAtBoot(ctx context.Context) {
	if httpEnvOn("REPAIR_ON_BOOT") {
		go func() {
			select {
			case <-ctx.Done():
				return
			default:
			}
			n, err := s.repairChildrenForCompany(ctx, "")
			if err != nil {
				log.Printf("boot repair: %v", err)
				return
			}
			log.Printf("boot repair: recalculated %d documents", n)
		}()
	}
}

func httpEnvOn(key string) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

// http imported above so the handler signatures compile; this line keeps
// the import alive for callers that don't use it directly.
var _ = http.StatusOK

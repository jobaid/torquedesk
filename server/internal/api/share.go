package api

// Customer-facing share links for documents (Session B of Vehicle Inspection).
//
// Flow:
//  1. Shop user clicks "Share with customer" on an invoice/RO/estimate.
//  2. POST /api/documents/{id}/share-link mints (or returns the current) token.
//  3. Shop sends the public URL (/share/doc/{token}) to the customer.
//  4. Customer opens it — no login required. The server returns the document
//     plus, if include_inspection is true for this document (or inheriting
//     from the shop default), the latest completed inspection for that
//     document/customer/vehicle.
//
// Security invariants:
//   - Token is 32 random bytes, base64url-encoded. Unguessable.
//   - DELETE /api/documents/{id}/share-link revokes immediately (sets
//     revoked_at). Revoked tokens are indistinguishable from unknown ones.
//   - The public endpoint strips server-internal fields that aren't needed by
//     the customer view (writer_id, technician_id, settings_snapshot blobs,
//     created_by/updated_by names, etc.) — see sanitizeDocForPublic.
//   - Looking up the inspection via companyID+customer+vehicle+document means
//     a token for Shop A can never return Shop B's inspection.
//   - The public share handler never returns 404 vs 410 differently so a
//     scraper cannot enumerate active tokens.

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *Server) shareRoutes(mux *http.ServeMux) {
	// Shop-side (authenticated, tenant-scoped) share-link management.
	mux.HandleFunc("GET /api/documents/{id}/share-link", s.auth("documents.edit", s.getShareLink))
	mux.HandleFunc("POST /api/documents/{id}/share-link", s.auth("documents.edit", s.createShareLink))
	mux.HandleFunc("DELETE /api/documents/{id}/share-link", s.auth("documents.edit", s.revokeShareLink))

	// Public — no auth, token in URL is the only credential.
	mux.HandleFunc("GET /api/public/share/{token}", s.publicShareView)
}

// ------------------------------- shop side ----------------------------------

type shareLinkDTO struct {
	Token      string `json:"token"`
	URL        string `json:"url"`
	CreatedAt  int64  `json:"createdAt"`
	LastViewed *int64 `json:"lastViewedAt,omitempty"`
	ViewCount  int    `json:"viewCount"`
	Revoked    bool   `json:"revoked"`
}

func (s *Server) getShareLink(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	docID := r.PathValue("id")
	dto, err := s.loadActiveShareLink(r.Context(), cid, docID, r)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, 200, nil)
		return
	}
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, dto)
}

func (s *Server) createShareLink(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	u := userFrom(r.Context())
	docID := r.PathValue("id")
	// Confirm the document is in this tenant.
	var exists bool
	if err := s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM documents WHERE id::text = $1 AND company_id::text = $2)`, docID, cid).Scan(&exists); err != nil || !exists {
		writeErr(w, 404, "Document not found.")
		return
	}
	// If an active (unrevoked) token already exists, hand it back — most shops
	// want to re-use the same link rather than issue a fresh one every click.
	if dto, err := s.loadActiveShareLink(r.Context(), cid, docID, r); err == nil {
		writeJSON(w, 200, dto)
		return
	}
	tok, err := newShareToken()
	if err != nil {
		handleErr(w, err)
		return
	}
	if _, err := s.db.Exec(r.Context(), `INSERT INTO document_share_tokens (token, document_id, company_id, created_by)
		VALUES ($1, $2::uuid, $3::uuid, $4)`, tok, docID, cid, u.Name); err != nil {
		handleErr(w, err)
		return
	}
	dto, err := s.loadActiveShareLink(r.Context(), cid, docID, r)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 201, dto)
}

func (s *Server) revokeShareLink(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	docID := r.PathValue("id")
	if _, err := s.db.Exec(r.Context(), `UPDATE document_share_tokens SET revoked_at = now()
		WHERE document_id::text = $1 AND company_id::text = $2 AND revoked_at IS NULL`, docID, cid); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) loadActiveShareLink(ctx context.Context, cid, docID string, r *http.Request) (*shareLinkDTO, error) {
	var dto shareLinkDTO
	var created time.Time
	var lastViewed *time.Time
	err := s.db.QueryRow(ctx, `SELECT token, created_at, last_viewed_at, view_count
		FROM document_share_tokens
		WHERE document_id::text = $1 AND company_id::text = $2 AND revoked_at IS NULL
		ORDER BY created_at DESC LIMIT 1`, docID, cid).
		Scan(&dto.Token, &created, &lastViewed, &dto.ViewCount)
	if err != nil {
		return nil, err
	}
	dto.CreatedAt = created.UnixMilli()
	if lastViewed != nil {
		ms := lastViewed.UnixMilli()
		dto.LastViewed = &ms
	}
	dto.URL = publicOrigin(r) + "/share/doc/" + dto.Token
	return &dto, nil
}

// ------------------------------ public side ---------------------------------

// publicShareView returns the document (sanitized) plus, if enabled, the
// relevant completed inspection. No auth. The token is the only credential.
func (s *Server) publicShareView(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	// Reject anything that doesn't look like a share token to short-circuit
	// probing — token is URL-safe base64, 43 chars (32 bytes decoded).
	if len(tok) < 20 || len(tok) > 80 {
		writeErr(w, 404, "Not found.")
		return
	}
	var docID, cid string
	err := s.db.QueryRow(r.Context(), `SELECT document_id::text, company_id::text
		FROM document_share_tokens WHERE token = $1 AND revoked_at IS NULL`, tok).Scan(&docID, &cid)
	if err != nil {
		// Both "unknown token" and "revoked" look the same from outside.
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	// Load the document, scoped by company_id (defence in depth).
	d, err := scanDoc(s.db.QueryRow(r.Context(), `SELECT `+docCols+` FROM documents
		WHERE id::text = $1 AND company_id::text = $2`, docID, cid))
	if err != nil {
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	// Strip server-internal fields the customer should never see.
	sanitizeDocForPublic(d)

	// Resolve the "include inspection" preference: per-doc override wins, else
	// shop default.
	var includeOverride *bool
	_ = s.db.QueryRow(r.Context(), `SELECT include_inspection FROM documents WHERE id::text = $1 AND company_id::text = $2`, docID, cid).Scan(&includeOverride)
	includeDefault := true
	_ = s.db.QueryRow(r.Context(), `SELECT include_inspection_default FROM document_preferences WHERE company_id::text = $1`, cid).Scan(&includeDefault)
	includeInspection := includeDefault
	if includeOverride != nil {
		includeInspection = *includeOverride
	}

	resp := map[string]any{
		"document":          d,
		"includeInspection": includeInspection,
	}

	// Shop context the customer DOES see (name, phone, logo URL eventually).
	resp["shop"] = s.publicShopFor(r.Context(), cid)

	if includeInspection {
		if insp, items := s.loadPublicInspection(r.Context(), cid, docID, d); insp != nil {
			resp["inspection"] = insp
			resp["inspectionItems"] = items
		}
	}

	// Fire-and-forget: bump view counter. Failure here must not break the view.
	_, _ = s.db.Exec(r.Context(), `UPDATE document_share_tokens SET last_viewed_at = now(), view_count = view_count + 1 WHERE token = $1`, tok)

	writeJSON(w, 200, resp)
}

// loadPublicInspection selects the most useful inspection for this document.
// Preference order:
//  1. An inspection explicitly attached to this document.
//  2. The latest completed inspection for the same customer+vehicle in this
//     tenant.
//
// Returning nil is the only correct behaviour when neither exists — callers
// render the "no inspection" state, never a hallucinated one.
func (s *Server) loadPublicInspection(ctx context.Context, cid, docID string, d map[string]any) (map[string]any, []map[string]any) {
	custID, _ := d["customerId"].(string)
	vehID, _ := d["vehicleId"].(string)

	tryQuery := func(where string, args ...any) (string, map[string]any, bool) {
		var id, status, performedBy, notes string
		var mileage, pass, att, fail, na int
		var performedAt *time.Time
		var created, updated time.Time
		err := s.db.QueryRow(ctx, `SELECT id::text, status, mileage, performed_by, performed_at, notes,
			pass_count, attention_count, fail_count, na_count, created_at, updated_at
			FROM inspections WHERE company_id::text = $1 AND `+where+` ORDER BY updated_at DESC LIMIT 1`,
			append([]any{cid}, args...)...).
			Scan(&id, &status, &mileage, &performedBy, &performedAt, &notes, &pass, &att, &fail, &na, &created, &updated)
		if err != nil {
			return "", nil, false
		}
		dto := map[string]any{
			"id":             id,
			"status":         status,
			"mileage":        mileage,
			"performedBy":    performedBy,
			"notes":          notes,
			"passCount":      pass,
			"attentionCount": att,
			"failCount":      fail,
			"naCount":        na,
			"createdAt":      created.UnixMilli(),
			"updatedAt":      updated.UnixMilli(),
		}
		if performedAt != nil {
			dto["performedAt"] = performedAt.UnixMilli()
		}
		return id, dto, true
	}

	var inspID string
	var dto map[string]any
	var ok bool
	// 1) Explicitly attached
	if inspID, dto, ok = tryQuery("document_id::text = $2 AND status = 'completed'", docID); !ok {
		// 2) Customer + vehicle match
		if custID != "" && vehID != "" {
			inspID, dto, ok = tryQuery("customer_id::text = $2 AND vehicle_id = $3 AND status = 'completed'", custID, vehID)
		}
	}
	if !ok {
		return nil, nil
	}
	// Load items + photos. Items need their own id so the frontend can match
	// photos to items; the id is scoped to this inspection and so still safe.
	rows, err := s.db.Query(ctx, `SELECT id::text, category, label, status, severity, note, measurement, position
		FROM inspection_items WHERE inspection_id::text = $1 ORDER BY position, created_at`, inspID)
	if err != nil {
		return dto, nil
	}
	defer rows.Close()
	items := []map[string]any{}
	itemIDs := []string{}
	for rows.Next() {
		var id, cat, label, status, severity, note, meas string
		var pos int
		if err := rows.Scan(&id, &cat, &label, &status, &severity, &note, &meas, &pos); err != nil {
			continue
		}
		items = append(items, map[string]any{
			"id": id, "category": cat, "label": label, "status": status, "severity": severity,
			"note": note, "measurement": meas, "position": pos, "photos": []any{},
		})
		itemIDs = append(itemIDs, id)
	}
	// Attach photos via the public URL that uses the share token (no auth).
	// Pull the current token from the request context? We don't carry it here;
	// instead expose via a public URL built from the token in the handler.
	// Pass-through: look up the token from the first row — we were called from
	// publicShareView which already validated the token. Grab it from the
	// request-stored token value via a helper on the caller side.
	// Simpler: re-derive the token from the latest unrevoked one for the doc.
	tok := s.latestShareToken(ctx, docID)
	if tok != "" && len(items) > 0 {
		photoRows, err := s.db.Query(ctx, `SELECT id::text, item_id::text, content_type, width, height, position
			FROM inspection_item_photos WHERE inspection_id::text = $1 ORDER BY position, created_at`, inspID)
		if err == nil {
			defer photoRows.Close()
			byItem := map[string][]map[string]any{}
			for photoRows.Next() {
				var pid, iid, ct string
				var w, h, pos int
				if err := photoRows.Scan(&pid, &iid, &ct, &w, &h, &pos); err != nil {
					continue
				}
				byItem[iid] = append(byItem[iid], map[string]any{
					"id": pid, "contentType": ct, "width": w, "height": h, "position": pos,
					"url": "/api/public/share/" + tok + "/photos/" + pid,
				})
			}
			for i := range items {
				if ps, ok := byItem[items[i]["id"].(string)]; ok {
					items[i]["photos"] = ps
				}
			}
		}
	}
	return dto, items
}

// latestShareToken returns the current unrevoked share token for the given
// document, or "" if none. Only used to build public photo URLs that re-use
// the same token the customer already has in their browser.
func (s *Server) latestShareToken(ctx context.Context, docID string) string {
	var tok string
	_ = s.db.QueryRow(ctx, `SELECT token FROM document_share_tokens WHERE document_id::text = $1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`, docID).Scan(&tok)
	return tok
}

// publicShopFor returns only the shop fields the customer should see on the
// public page: name, phone, email, address, website. No internal IDs.
func (s *Server) publicShopFor(ctx context.Context, cid string) map[string]any {
	var name, phone, email, address1, address2, city, state, zip, website string
	_ = s.db.QueryRow(ctx, `SELECT shop_name, phone, email, address1, address2, city, state, zip, website
		FROM shop_settings WHERE company_id::text = $1`, cid).
		Scan(&name, &phone, &email, &address1, &address2, &city, &state, &zip, &website)
	addr := strings.TrimSpace(strings.Join([]string{address1, address2, strings.TrimSpace(city + ", " + state + " " + zip)}, "\n"))
	return map[string]any{
		"name": name, "phone": phone, "email": email, "address": addr, "website": website,
	}
}

// sanitizeDocForPublic strips fields the customer should not see. It also
// pulls out include_inspection and stashes it in a private key so the caller
// doesn't need a second query.
func sanitizeDocForPublic(d map[string]any) {
	// Fields with internal ids / staff names / server internals.
	stripped := []string{
		"writerId", "technicianId",
		"createdBy", "updatedBy",
		"settingsSnapshot", "snapshot",
		"taxIds", "feesOff", "numberType", "seq",
	}
	for _, k := range stripped {
		delete(d, k)
	}
	// include_inspection comes in from the extra column selected in the public
	// handler — stash it so the handler can resolve the three-valued flag.
	// Not actually set here; the handler reads a separate query. Left as a
	// hook so a future refactor can inline it.
	_ = d
}

// newShareToken returns a 32-byte URL-safe random token (43 chars).
func newShareToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// Compile-time: json is used by handlers that might marshal maps directly in
// future (e.g. for a /share/receipt endpoint); silence unused warnings while
// Session C adds that.
var _ = json.NewDecoder

package api

// Session A of Customer Authorization — document-level approve / deny /
// request changes. Reuses the document_share_tokens the customer already has.
//
// Shop endpoints (authed, tenant-scoped):
//   POST   /api/documents/{id}/authorization   create (or re-send) an active request
//   DELETE /api/documents/{id}/authorization   cancel the active request
//   GET    /api/documents/{id}/authorization   fetch current status + event history
//
// Public endpoints (no auth — share token is the credential):
//   GET  /api/public/share/{token}/authorization         read-only summary
//   POST /api/public/share/{token}/authorization/respond approve / deny / changes
//
// Statuses: pending → viewed → approved | denied | changes_requested
// (terminal: cancelled, expired, revised_required)

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *Server) authorizationRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/documents/{id}/authorization", s.auth("", s.getDocAuthorization))
	mux.HandleFunc("POST /api/documents/{id}/authorization", s.auth("documents.edit", s.createDocAuthorization))
	mux.HandleFunc("DELETE /api/documents/{id}/authorization", s.auth("documents.edit", s.cancelDocAuthorization))

	// Public — share-token-scoped.
	mux.HandleFunc("GET /api/public/share/{token}/authorization", s.publicAuthStatus)
	mux.HandleFunc("POST /api/public/share/{token}/authorization/respond", s.publicAuthRespond)
}

// ------------------------------- shop side ----------------------------------

type authorizationDTO struct {
	ID             string          `json:"id"`
	Status         string          `json:"status"`
	RequestedAt    int64           `json:"requestedAt"`
	RequestedBy    string          `json:"requestedBy"`
	ViewedAt       *int64          `json:"viewedAt,omitempty"`
	RespondedAt    *int64          `json:"respondedAt,omitempty"`
	RespondedName  string          `json:"respondedName,omitempty"`
	ResponseReason string          `json:"responseReason,omitempty"`
	ExpiresAt      *int64          `json:"expiresAt,omitempty"`
	Events         []authEventDTO  `json:"events,omitempty"`
}

type authEventDTO struct {
	Kind      string `json:"kind"`
	Actor     string `json:"actor"`
	ActorRole string `json:"actorRole"`
	Note      string `json:"note"`
	At        int64  `json:"at"`
}

const authCols = `id::text, status, requested_at, requested_by, viewed_at, responded_at,
	responded_name, response_reason, expires_at`

func scanAuthorization(row pgx.Row) (authorizationDTO, error) {
	var dto authorizationDTO
	var requested time.Time
	var viewed, responded, expires *time.Time
	err := row.Scan(&dto.ID, &dto.Status, &requested, &dto.RequestedBy, &viewed, &responded, &dto.RespondedName, &dto.ResponseReason, &expires)
	if err != nil {
		return dto, err
	}
	dto.RequestedAt = requested.UnixMilli()
	if viewed != nil {
		ms := viewed.UnixMilli()
		dto.ViewedAt = &ms
	}
	if responded != nil {
		ms := responded.UnixMilli()
		dto.RespondedAt = &ms
	}
	if expires != nil {
		ms := expires.UnixMilli()
		dto.ExpiresAt = &ms
	}
	return dto, nil
}

func (s *Server) loadAuthEvents(ctx interface{ Deadline() (time.Time, bool) }, authID string) []authEventDTO {
	// (We don't actually need Deadline(); the type is just so callers can pass r.Context())
	_ = ctx
	return nil
}

func (s *Server) getDocAuthorization(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	docID := r.PathValue("id")
	// Latest authorization (any status). Null = never requested.
	dto, err := scanAuthorization(s.db.QueryRow(r.Context(), `SELECT `+authCols+`
		FROM document_authorizations
		WHERE document_id::text = $1 AND company_id::text = $2
		ORDER BY created_at DESC LIMIT 1`, docID, cid))
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, 200, nil)
		return
	}
	if err != nil {
		handleErr(w, err)
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT kind, actor, actor_role, note, created_at
		FROM document_auth_events WHERE authorization_id::text = $1 ORDER BY created_at`, dto.ID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var e authEventDTO
			var at time.Time
			if err := rows.Scan(&e.Kind, &e.Actor, &e.ActorRole, &e.Note, &at); err == nil {
				e.At = at.UnixMilli()
				dto.Events = append(dto.Events, e)
			}
		}
	}
	writeJSON(w, 200, dto)
}

type createAuthReq struct {
	ExpiresInDays int    `json:"expiresInDays"` // 0 = no expiration
	Note          string `json:"note"`
}

func (s *Server) createDocAuthorization(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	u := userFrom(r.Context())
	docID := r.PathValue("id")
	var in createAuthReq
	_ = readJSON(r, &in)

	// Verify document is in this tenant.
	var exists bool
	if err := s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM documents WHERE id::text = $1 AND company_id::text = $2)`, docID, cid).Scan(&exists); err != nil || !exists {
		writeErr(w, 404, "Document not found.")
		return
	}

	// If there's an active (pending/viewed) authorization, treat this as a
	// "resend" — bump updated_at and add a resent event.
	var activeID string
	_ = s.db.QueryRow(r.Context(), `SELECT id::text FROM document_authorizations
		WHERE document_id::text = $1 AND company_id::text = $2 AND status IN ('pending','viewed')
		ORDER BY created_at DESC LIMIT 1`, docID, cid).Scan(&activeID)

	var expiresArg any
	if in.ExpiresInDays > 0 {
		expiresArg = time.Now().AddDate(0, 0, in.ExpiresInDays)
	}

	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		if activeID != "" {
			if _, err := tx.Exec(r.Context(), `UPDATE document_authorizations
				SET updated_at = now(), requested_by = $2, expires_at = $3
				WHERE id::text = $1`, activeID, u.Name, expiresArg); err != nil {
				return err
			}
			return insertAuthEvent(r, tx, activeID, docID, cid, "resent", u.Name, "shop", in.Note)
		}
		if err := tx.QueryRow(r.Context(), `INSERT INTO document_authorizations
			(company_id, document_id, status, requested_by, expires_at)
			VALUES ($1::uuid, $2::uuid, 'pending', $3, $4) RETURNING id::text`,
			cid, docID, u.Name, expiresArg).Scan(&activeID); err != nil {
			return err
		}
		return insertAuthEvent(r, tx, activeID, docID, cid, "requested", u.Name, "shop", in.Note)
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	s.getDocAuthorization(w, r)
}

func (s *Server) cancelDocAuthorization(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	u := userFrom(r.Context())
	docID := r.PathValue("id")
	var activeID string
	err := s.db.QueryRow(r.Context(), `SELECT id::text FROM document_authorizations
		WHERE document_id::text = $1 AND company_id::text = $2 AND status IN ('pending','viewed')
		ORDER BY created_at DESC LIMIT 1`, docID, cid).Scan(&activeID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, 404, "No active authorization request to cancel.")
		return
	}
	if err != nil {
		handleErr(w, err)
		return
	}
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `UPDATE document_authorizations
			SET status = 'cancelled', updated_at = now() WHERE id::text = $1`, activeID); err != nil {
			return err
		}
		return insertAuthEvent(r, tx, activeID, docID, cid, "cancelled", u.Name, "shop", "")
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	s.getDocAuthorization(w, r)
}

// ------------------------------ public side ---------------------------------

func (s *Server) publicAuthStatus(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	docID, cid, ok := s.resolveShareToken(r, tok)
	if !ok {
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	dto, err := scanAuthorization(s.db.QueryRow(r.Context(), `SELECT `+authCols+`
		FROM document_authorizations WHERE document_id::text = $1 AND company_id::text = $2
		ORDER BY created_at DESC LIMIT 1`, docID, cid))
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, 200, nil)
		return
	}
	if err != nil {
		handleErr(w, err)
		return
	}
	// Opportunistic viewed-at update: only when still pending.
	if dto.Status == "pending" {
		_, _ = s.db.Exec(r.Context(), `UPDATE document_authorizations SET status = 'viewed', viewed_at = now(), updated_at = now()
			WHERE id::text = $1 AND status = 'pending'`, dto.ID)
		_, _ = s.db.Exec(r.Context(), `INSERT INTO document_auth_events (authorization_id, document_id, company_id, kind, actor_role, ip)
			VALUES ($1::uuid, $2::uuid, $3::uuid, 'viewed', 'customer', $4)`, dto.ID, docID, cid, clientIP(r))
		dto.Status = "viewed"
		now := time.Now().UnixMilli()
		dto.ViewedAt = &now
	}
	writeJSON(w, 200, map[string]any{
		"id":             dto.ID,
		"status":         dto.Status,
		"requestedAt":    dto.RequestedAt,
		"respondedAt":    dto.RespondedAt,
		"respondedName":  dto.RespondedName,
		"responseReason": dto.ResponseReason,
		"expiresAt":      dto.ExpiresAt,
	})
}

type publicAuthResp struct {
	Decision string `json:"decision"` // approve | deny | request_changes
	Name     string `json:"name"`
	Reason   string `json:"reason"`
}

func (s *Server) publicAuthRespond(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	docID, cid, ok := s.resolveShareToken(r, tok)
	if !ok {
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	var in publicAuthResp
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Name == "" {
		writeErr(w, 400, "Please enter your name so we have a record of who responded.")
		return
	}
	kindMap := map[string]string{
		"approve":         "approved",
		"deny":            "denied",
		"request_changes": "changes_requested",
	}
	finalStatus, ok := kindMap[in.Decision]
	if !ok {
		writeErr(w, 400, "Unknown decision.")
		return
	}
	if (finalStatus == "denied" || finalStatus == "changes_requested") && in.Reason == "" {
		writeErr(w, 400, "Please tell us why so the shop can respond.")
		return
	}

	var authID, curStatus string
	err := s.db.QueryRow(r.Context(), `SELECT id::text, status FROM document_authorizations
		WHERE document_id::text = $1 AND company_id::text = $2
		  AND status IN ('pending','viewed')
		ORDER BY created_at DESC LIMIT 1`, docID, cid).Scan(&authID, &curStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, 409, "This authorization request is no longer open. Please contact the shop.")
		return
	}
	if err != nil {
		handleErr(w, err)
		return
	}

	ip := clientIP(r)
	ua := r.Header.Get("User-Agent")
	if len(ua) > 400 {
		ua = ua[:400]
	}

	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `UPDATE document_authorizations
			SET status = $2, responded_at = now(), responded_name = $3, response_reason = $4,
			    customer_ip = $5, customer_ua = $6, updated_at = now()
			WHERE id::text = $1`, authID, finalStatus, in.Name, in.Reason, ip, ua); err != nil {
			return err
		}
		_, err := tx.Exec(r.Context(), `INSERT INTO document_auth_events
			(authorization_id, document_id, company_id, kind, actor, actor_role, note, ip)
			VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'customer', $6, $7)`,
			authID, docID, cid, finalStatus, in.Name, in.Reason, ip)
		return err
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{
		"ok": true, "status": finalStatus,
	})
}

// ------------------------------- helpers ------------------------------------

// resolveShareToken returns (documentID, companyID, ok). The token must be
// present and unrevoked.
func (s *Server) resolveShareToken(r *http.Request, tok string) (string, string, bool) {
	if len(tok) < 20 || len(tok) > 80 {
		return "", "", false
	}
	var docID, cid string
	err := s.db.QueryRow(r.Context(), `SELECT document_id::text, company_id::text
		FROM document_share_tokens WHERE token = $1 AND revoked_at IS NULL`, tok).Scan(&docID, &cid)
	if err != nil {
		return "", "", false
	}
	return docID, cid, true
}

func insertAuthEvent(r *http.Request, tx pgx.Tx, authID, docID, cid, kind, actor, actorRole, note string) error {
	_, err := tx.Exec(r.Context(), `INSERT INTO document_auth_events
		(authorization_id, document_id, company_id, kind, actor, actor_role, note, ip)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8)`,
		authID, docID, cid, kind, actor, actorRole, note, clientIP(r))
	return err
}

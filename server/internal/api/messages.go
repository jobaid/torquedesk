package api

// Session C: two-way chat per document.
//
// Thread model: one thread per (document, company). Messages are from role
// 'shop' (an authenticated shop user) or 'customer' (via the share token).
// Unread counts are derived from last-read timestamps on the document itself.
//
// Tenant isolation: shop endpoints scope by company_id. Public endpoints
// resolve the share token to a document and refuse to read or write any
// thread that doesn't belong to that token's document.
//
// Privacy: the public endpoint NEVER returns internal shop notes, staff names
// outside the thread, or anything from the parent document — the thread is a
// standalone chat payload. Customer-visible sender_name defaults to the shop
// name when the shop user didn't type a signature.

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *Server) messageRoutes(mux *http.ServeMux) {
	// Shop side
	mux.HandleFunc("GET /api/documents/{id}/messages", s.auth("", s.listShopMessages))
	mux.HandleFunc("POST /api/documents/{id}/messages", s.auth("documents.edit", s.postShopMessage))
	mux.HandleFunc("POST /api/documents/{id}/messages/read", s.auth("", s.markShopRead))
	mux.HandleFunc("GET /api/documents/{id}/messages/stream", s.auth("", s.sseShopMessages))
	// Unread-count rollup across all docs for the floating-messenger badge.
	mux.HandleFunc("GET /api/messages/unread", s.auth("", s.listUnread))

	// Public (share token)
	mux.HandleFunc("GET /api/public/share/{token}/messages", s.listPublicMessages)
	mux.HandleFunc("POST /api/public/share/{token}/messages", s.postPublicMessage)
	mux.HandleFunc("GET /api/public/share/{token}/messages/stream", s.ssePublicMessages)
}

type messageDTO struct {
	ID         string `json:"id"`
	SenderRole string `json:"senderRole"`
	SenderName string `json:"senderName"`
	Body       string `json:"body"`
	At         int64  `json:"at"`
}

// --------------------------- shop handlers ----------------------------------

func (s *Server) listShopMessages(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	docID := r.PathValue("id")
	// Confirm doc in tenant.
	var exists bool
	if err := s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM documents WHERE id::text = $1 AND company_id::text = $2)`, docID, cid).Scan(&exists); err != nil || !exists {
		writeErr(w, 404, "Document not found.")
		return
	}
	out, err := s.loadMessages(r, cid, docID)
	if err != nil {
		handleErr(w, err)
		return
	}
	// Unread count for the shop = messages from customer newer than shop_messages_read_at.
	var unread int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM document_messages m
		JOIN documents d ON d.id = m.document_id
		WHERE m.document_id::text = $1 AND m.sender_role = 'customer'
		  AND (d.shop_messages_read_at IS NULL OR m.created_at > d.shop_messages_read_at)`, docID).Scan(&unread)
	writeJSON(w, 200, map[string]any{"messages": out, "unread": unread})
}

type postShopMsgReq struct {
	Body string `json:"body"`
}

func (s *Server) postShopMessage(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	u := userFrom(r.Context())
	docID := r.PathValue("id")
	var in postShopMsgReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	body := strings.TrimSpace(in.Body)
	if body == "" {
		writeErr(w, 400, "Message is empty.")
		return
	}
	if len(body) > 4000 {
		writeErr(w, 400, "Message is too long (max 4000 characters).")
		return
	}
	var exists bool
	if err := s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM documents WHERE id::text = $1 AND company_id::text = $2)`, docID, cid).Scan(&exists); err != nil || !exists {
		writeErr(w, 404, "Document not found.")
		return
	}
	var newID string
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		if err := tx.QueryRow(r.Context(), `INSERT INTO document_messages
			(company_id, document_id, sender_role, sender_name, body, ip)
			VALUES ($1::uuid, $2::uuid, 'shop', $3, $4, $5) RETURNING id::text`,
			cid, docID, u.Name, body, clientIP(r)).Scan(&newID); err != nil {
			return err
		}
		_, err := tx.Exec(r.Context(), `UPDATE documents SET shop_messages_read_at = now() WHERE id::text = $1`, docID)
		return err
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	publishMessageEvent(docID, messageDTO{ID: newID, SenderRole: "shop", SenderName: u.Name, Body: body, At: time.Now().UnixMilli()})
	s.listShopMessages(w, r)
}

func (s *Server) markShopRead(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	docID := r.PathValue("id")
	ct, err := s.db.Exec(r.Context(), `UPDATE documents SET shop_messages_read_at = now()
		WHERE id::text = $1 AND company_id::text = $2`, docID, cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	if ct.RowsAffected() == 0 {
		writeErr(w, 404, "Document not found.")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// listUnread rolls up unread customer messages across every doc in the
// tenant, so the shop sidebar can show one badge.
func (s *Server) listUnread(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	rows, err := s.db.Query(r.Context(), `SELECT d.id::text, d.display_number, d.type,
		count(*) AS unread
		FROM document_messages m
		JOIN documents d ON d.id = m.document_id
		WHERE d.company_id::text = $1 AND m.sender_role = 'customer'
		  AND (d.shop_messages_read_at IS NULL OR m.created_at > d.shop_messages_read_at)
		GROUP BY d.id, d.display_number, d.type
		ORDER BY max(m.created_at) DESC LIMIT 100`, cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	total := 0
	for rows.Next() {
		var id, num, typ string
		var cnt int
		if err := rows.Scan(&id, &num, &typ, &cnt); err == nil {
			total += cnt
			out = append(out, map[string]any{"documentId": id, "number": num, "type": typ, "unread": cnt})
		}
	}
	writeJSON(w, 200, map[string]any{"total": total, "docs": out})
}

// --------------------------- public handlers --------------------------------

func (s *Server) listPublicMessages(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	docID, cid, ok := s.resolveShareToken(r, tok)
	if !ok {
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	out, err := s.loadMessages(r, cid, docID)
	if err != nil {
		handleErr(w, err)
		return
	}
	// Mark customer-side read.
	_, _ = s.db.Exec(r.Context(), `UPDATE documents SET customer_messages_read_at = now() WHERE id::text = $1`, docID)
	var unread int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM document_messages m
		JOIN documents d ON d.id = m.document_id
		WHERE m.document_id::text = $1 AND m.sender_role = 'shop'
		  AND (d.customer_messages_read_at IS NULL OR m.created_at > d.customer_messages_read_at)`, docID).Scan(&unread)
	writeJSON(w, 200, map[string]any{"messages": out, "unread": unread})
}

type postPublicMsgReq struct {
	Name string `json:"name"`
	Body string `json:"body"`
}

func (s *Server) postPublicMessage(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	docID, cid, ok := s.resolveShareToken(r, tok)
	if !ok {
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	var in postPublicMsgReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	name := strings.TrimSpace(in.Name)
	body := strings.TrimSpace(in.Body)
	if body == "" {
		writeErr(w, 400, "Message is empty.")
		return
	}
	if len(body) > 4000 {
		writeErr(w, 400, "Message is too long (max 4000 characters).")
		return
	}
	if name == "" {
		name = "Customer"
	}
	var newID string
	if err := s.db.QueryRow(r.Context(), `INSERT INTO document_messages
		(company_id, document_id, sender_role, sender_name, body, ip)
		VALUES ($1::uuid, $2::uuid, 'customer', $3, $4, $5) RETURNING id::text`,
		cid, docID, name, body, clientIP(r)).Scan(&newID); err != nil {
		handleErr(w, err)
		return
	}
	// Mark customer-side read (they just saw the thread by posting).
	_, _ = s.db.Exec(r.Context(), `UPDATE documents SET customer_messages_read_at = now() WHERE id::text = $1`, docID)
	publishMessageEvent(docID, messageDTO{ID: newID, SenderRole: "customer", SenderName: name, Body: body, At: time.Now().UnixMilli()})
	s.listPublicMessages(w, r)
}

// --------------------------- shared loader ----------------------------------

func (s *Server) loadMessages(r *http.Request, cid, docID string) ([]messageDTO, error) {
	rows, err := s.db.Query(r.Context(), `SELECT id::text, sender_role, sender_name, body, created_at
		FROM document_messages WHERE document_id::text = $1 AND company_id::text = $2
		ORDER BY created_at ASC`, docID, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []messageDTO{}
	for rows.Next() {
		var m messageDTO
		var at time.Time
		if err := rows.Scan(&m.ID, &m.SenderRole, &m.SenderName, &m.Body, &at); err != nil {
			return nil, err
		}
		m.At = at.UnixMilli()
		out = append(out, m)
	}
	return out, nil
}

// silence stray imports if a future helper is removed.
var _ = errors.Is

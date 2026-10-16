package api

// SaaS owner broadcast email — one message to every shop owner on the platform.
//
// Common use: "Scheduled maintenance 10 PM EST tonight", "New feature X is
// live", "Server moved to a new region". Each recipient gets a separate
// envelope via SendPlatformEmail so Reply-To, bounces, and templates work
// the same as every other platform notification.

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

func (s *Server) broadcastRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/owner/broadcast/preview", s.ownerAuth(s.broadcastPreview))
	mux.HandleFunc("POST /api/owner/broadcast", s.ownerAuth(s.broadcastSend))
}

type broadcastReq struct {
	Subject  string `json:"subject"`
	Body     string `json:"body"`     // plaintext OR html — detected
	Audience string `json:"audience"` // 'active' | 'all'
	DryRun   bool   `json:"dryRun"`
}

// broadcastPreview returns the recipient count for a given audience without
// actually sending.
func (s *Server) broadcastPreview(w http.ResponseWriter, r *http.Request) {
	audience := strings.TrimSpace(r.URL.Query().Get("audience"))
	if audience == "" {
		audience = "active"
	}
	emails, _ := s.broadcastRecipients(r.Context(), audience)
	writeJSON(w, 200, map[string]any{"count": len(emails), "audience": audience})
}

func (s *Server) broadcastSend(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in broadcastReq
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, 400, "invalid request")
		return
	}
	in.Subject = strings.TrimSpace(in.Subject)
	in.Body = strings.TrimSpace(in.Body)
	if in.Audience == "" {
		in.Audience = "active"
	}
	if in.Subject == "" || in.Body == "" {
		writeErr(w, 400, "subject and body are required")
		return
	}

	emails, err := s.broadcastRecipients(r.Context(), in.Audience)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if in.DryRun {
		writeJSON(w, 200, map[string]any{"recipients": len(emails), "dryRun": true})
		return
	}

	// Detect html vs plaintext: if the body contains an angle-bracketed tag,
	// treat it as html; otherwise wrap plaintext in <p> blocks.
	isHTML := strings.Contains(in.Body, "<") && strings.Contains(in.Body, ">")
	var htmlBody, textBody string
	if isHTML {
		htmlBody = in.Body
		textBody = stripTags(in.Body)
	} else {
		htmlBody = "<p>" + strings.ReplaceAll(htmlEscape(in.Body), "\n\n", "</p><p>") + "</p>"
		htmlBody = strings.ReplaceAll(htmlBody, "\n", "<br>")
		textBody = in.Body
	}

	fromName := s.platformFromName(r.Context())
	shell := platformEmailShell(fromName, in.Subject, htmlBody,
		"You are receiving this because your TorqueDesk shop is on our platform mailing list.")

	// Dedupe key timestamps the batch so retries within the same minute
	// don't double-send.
	batch := time.Now().UTC().Format("20060102150405")
	// Use context.Background() — the request context cancels when the HTTP
	// response is sent, which would kill the enqueue below mid-loop.
	go func() {
		ctx := context.Background()
		for _, email := range emails {
			s.SendPlatformEmail(ctx, []string{email}, in.Subject, shell, textBody,
				"broadcast", "broadcast:"+batch+":"+strings.ToLower(email))
		}
	}()

	details := map[string]any{"audience": in.Audience, "recipients": len(emails), "subject": in.Subject}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "broadcast_sent", "email", batch, nil, details, clientIP(r))

	writeJSON(w, 200, map[string]any{"ok": true, "recipients": len(emails), "batch": batch})
}

func (s *Server) broadcastRecipients(ctx context.Context, audience string) ([]string, error) {
	var where string
	switch audience {
	case "all":
		where = `co.status <> 'disabled' AND co.email <> ''`
	case "active":
		fallthrough
	default:
		where = `co.status = 'active' AND co.email <> '' AND c.status IN ('active','trial')`
	}
	rows, err := s.db.Query(ctx,
		`SELECT DISTINCT lower(co.email)
		   FROM company_owners co
		   JOIN companies c ON c.id = co.company_id
		  WHERE `+where)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var e string
		if err := rows.Scan(&e); err == nil && e != "" {
			out = append(out, e)
		}
	}
	return out, nil
}

// stripTags is a lightweight html → plaintext fallback for the text/plain
// email part. Not safe for arbitrary HTML sanitation — only used on content
// the SaaS owner typed themselves.
func stripTags(s string) string {
	var b strings.Builder
	in := false
	for _, r := range s {
		switch r {
		case '<':
			in = true
		case '>':
			in = false
		default:
			if !in {
				b.WriteRune(r)
			}
		}
	}
	return b.String()
}

package api

// Demo requests / contact form from the public marketing site.
//
// The marketing site's Contact page posts to /api/public/contact on
// www.fixoraerp.com, which nginx routes to this server. Each submission is
// stored in demo_requests and an alert is emailed to CONTACT_NOTIFY_EMAIL.
// The SaaS owner reviews them under Owner → Demo Requests and can email the
// requester the signup link with one click.

import (
	"context"
	"errors"
	"fmt"
	"html"
	"log"
	"net/http"
	"net/mail"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

var demoTopics = map[string]bool{"sales": true, "demo": true, "support": true, "other": true}
var demoStatuses = map[string]bool{"new": true, "link_sent": true, "closed": true}

func (s *Server) demoRequestRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/public/contact", contactLimit(s.publicContact))

	mux.HandleFunc("GET /api/owner/demo-requests", s.ownerAuth(s.ownerListDemoRequests))
	mux.HandleFunc("POST /api/owner/demo-requests/{id}/send-signup-link", s.ownerAuth(s.ownerSendSignupLink))
	mux.HandleFunc("PATCH /api/owner/demo-requests/{id}", s.ownerAuth(s.ownerUpdateDemoRequest))
}

func contactNotifyEmail() string {
	if v := strings.TrimSpace(os.Getenv("CONTACT_NOTIFY_EMAIL")); v != "" {
		return v
	}
	return "info@fixoraerp.com"
}

func signupLinkURL() string {
	if v := strings.TrimSpace(os.Getenv("SIGNUP_LINK_URL")); v != "" {
		return v
	}
	return "https://www.fixoraerp.com/signup"
}

// --------------------------------------------------- public intake

// Separate from loginLimit so a busy contact form can't lock people out of
// signing in, and so the 429 message makes sense to a prospect.
const (
	contactWindow   = 10 * time.Minute
	contactMaxPosts = 5
)

var contactLim = struct {
	sync.Mutex
	m map[string]*loginBucket
}{m: map[string]*loginBucket{}}

func contactLimit(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := clientIPForLimit(r)
		if ip != "" {
			now := time.Now()
			contactLim.Lock()
			b, ok := contactLim.m[ip]
			if !ok || now.After(b.resetAt) {
				b = &loginBucket{resetAt: now.Add(contactWindow)}
				contactLim.m[ip] = b
			}
			b.count++
			over := b.count > contactMaxPosts
			contactLim.Unlock()
			if over {
				writeErr(w, 429, "Too many messages from your network. Please wait a few minutes and try again.")
				return
			}
		}
		h(w, r)
	}
}

type contactIn struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Shop    string `json:"shop"`
	Phone   string `json:"phone"`
	Topic   string `json:"topic"`
	Message string `json:"message"`
}

func (s *Server) publicContact(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
	var in contactIn
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request body.")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Shop = strings.TrimSpace(in.Shop)
	in.Phone = strings.TrimSpace(in.Phone)
	in.Message = strings.TrimSpace(in.Message)
	if !demoTopics[in.Topic] {
		in.Topic = "other"
	}
	if in.Name == "" || in.Email == "" || in.Message == "" {
		writeErr(w, 400, "Name, email, and message are required.")
		return
	}
	if _, err := mail.ParseAddress(in.Email); err != nil {
		writeErr(w, 400, "That doesn't look like a valid email address.")
		return
	}
	if len(in.Name) > 200 || len(in.Shop) > 200 || len(in.Phone) > 50 || len(in.Message) > 4000 {
		writeErr(w, 413, "One of the fields is too long.")
		return
	}
	if strings.Count(strings.ToLower(in.Message), "http") >= 3 {
		writeErr(w, 400, "Please remove the links and try again.")
		return
	}

	var id string
	err := s.db.QueryRow(r.Context(), `
		INSERT INTO demo_requests (name, email, shop, phone, topic, message, source_ip)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`,
		in.Name, in.Email, in.Shop, in.Phone, in.Topic, in.Message, clientIPForLimit(r)).Scan(&id)
	if err != nil {
		log.Printf("demo_requests insert: %v", err)
		writeErr(w, 500, "We couldn't save your message. Please email info@fixoraerp.com directly.")
		return
	}

	s.notifyNewDemoRequest(r.Context(), id, in)
	writeJSON(w, 200, map[string]any{
		"ok":      true,
		"message": "Thanks! We received your message and will get back to you within one business day.",
	})
}

func demoEmailShell(title, body string) string {
	return `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
<div style="max-width:620px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="padding:20px 28px;background:linear-gradient(90deg,#f97316,#ea580c);color:#fff">
    <div style="font-weight:700;font-size:16px">Fixora ERP</div>
    <div style="opacity:.9;font-size:12px;margin-top:2px">` + html.EscapeString(title) + `</div>
  </div>
  <div style="padding:24px 28px;line-height:1.55;font-size:14px">` + body + `</div>
</div></body></html>`
}

var demoTopicLabel = map[string]string{
	"sales": "Sales / pricing", "demo": "Request a demo", "support": "Support", "other": "Other",
}

func (s *Server) notifyNewDemoRequest(ctx context.Context, id string, in contactIn) {
	row := func(k, v string) string {
		if v == "" {
			v = "—"
		}
		return `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top">` + k +
			`</td><td style="padding:4px 0">` + html.EscapeString(v) + `</td></tr>`
	}
	body := `<p>A new message was submitted on the website contact form.</p>
<table style="margin:12px 0;border-collapse:collapse;font-size:13px">` +
		row("Topic", demoTopicLabel[in.Topic]) + row("Name", in.Name) + row("Email", in.Email) +
		row("Shop", in.Shop) + row("Phone", in.Phone) + `</table>
<div style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:13px">` +
		html.EscapeString(in.Message) + `</div>
<p style="margin-top:16px;color:#64748b;font-size:12px">To send the signup link, open SaaS Admin → Demo Requests.</p>`

	if _, err := s.enqueueEmail(ctx, emailEnqueue{
		Scope:       "platform",
		To:          contactNotifyEmail(),
		Subject:     fmt.Sprintf("[Website] %s — %s", demoTopicLabel[in.Topic], in.Name),
		HTML:        demoEmailShell("New website message", body),
		Text:        fmt.Sprintf("New %s from %s <%s> (shop: %s, phone: %s):\n\n%s", demoTopicLabel[in.Topic], in.Name, in.Email, in.Shop, in.Phone, in.Message),
		Kind:        "demo_request_notify",
		RelatedType: "demo_request",
		RelatedID:   id,
		DedupeKey:   "demo_request_notify:" + id,
	}); err != nil {
		log.Printf("demo request notify email: %v", err)
	}
}

// --------------------------------------------------- owner

func (s *Server) ownerListDemoRequests(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	topic, status, search := q.Get("topic"), q.Get("status"), strings.TrimSpace(q.Get("search"))
	rows, err := s.db.Query(r.Context(), `
		SELECT id::text, name, email, shop, phone, topic, message, status,
		       link_sent_at, link_sent_count, link_sent_by, created_at
		FROM demo_requests
		WHERE ($1 = '' OR topic = $1)
		  AND ($2 = '' OR status = $2)
		  AND ($3 = '' OR name ILIKE '%'||$3||'%' OR email ILIKE '%'||$3||'%' OR shop ILIKE '%'||$3||'%')
		ORDER BY created_at DESC
		LIMIT 500`, topic, status, search)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, email, shop, phone, tp, msg, st, sentBy string
		var sentAt *time.Time
		var sentCount int
		var created time.Time
		if err := rows.Scan(&id, &name, &email, &shop, &phone, &tp, &msg, &st, &sentAt, &sentCount, &sentBy, &created); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		out = append(out, map[string]any{
			"id": id, "name": name, "email": email, "shop": shop, "phone": phone,
			"topic": tp, "message": msg, "status": st,
			"linkSentAt": sentAt, "linkSentCount": sentCount, "linkSentBy": sentBy,
			"createdAt": created,
		})
	}
	writeJSON(w, 200, out)
}

func (s *Server) ownerSendSignupLink(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var name, email, shop string
	var count int
	err := s.db.QueryRow(r.Context(),
		`SELECT name, email, shop, link_sent_count FROM demo_requests WHERE id::text = $1`, id).Scan(&name, &email, &shop, &count)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, 404, "Demo request not found.")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}

	// Editable under SaaS Admin → Email Templates → "Demo request — signup link".
	link := signupLinkURL()
	subject, body, _ := s.renderTemplate(r.Context(), "platform", "", "demo_signup_link", map[string]string{
		"name": html.EscapeString(name), "shop": html.EscapeString(shop),
		"email": html.EscapeString(email), "signup_url": html.EscapeString(link),
	})
	_, _, text := s.renderTemplate(r.Context(), "platform", "", "demo_signup_link", map[string]string{
		"name": name, "shop": shop, "email": email, "signup_url": link,
	})

	if _, err := s.enqueueEmail(r.Context(), emailEnqueue{
		Scope:       "platform",
		To:          email,
		Subject:     subject,
		HTML:        demoEmailShell("Get started with Fixora ERP", body),
		Text:        text,
		Kind:        "demo_signup_link",
		RelatedType: "demo_request",
		RelatedID:   id,
		DedupeKey:   fmt.Sprintf("demo_signup_link:%s:%d", id, count+1),
	}); err != nil {
		writeErr(w, 500, "Could not queue the email: "+err.Error())
		return
	}

	if _, err := s.db.Exec(r.Context(), `
		UPDATE demo_requests
		SET status = 'link_sent', link_sent_at = now(), link_sent_count = link_sent_count + 1,
		    link_sent_by = $2, updated_at = now()
		WHERE id::text = $1`, id, userFrom(r.Context()).Email); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "sentTo": email})
}

func (s *Server) ownerUpdateDemoRequest(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Status string `json:"status"`
	}
	if err := readJSON(r, &in); err != nil || !demoStatuses[in.Status] {
		writeErr(w, 400, "Status must be new, link_sent, or closed.")
		return
	}
	tag, err := s.db.Exec(r.Context(),
		`UPDATE demo_requests SET status = $2, updated_at = now() WHERE id::text = $1`, r.PathValue("id"), in.Status)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeErr(w, 404, "Demo request not found.")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

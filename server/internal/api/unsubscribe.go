package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// ----------------------------------------------------------------------------
// Email unsubscribe (marketing opt-out).
//
// Every broadcast/customer-broadcast email carries an unsubscribe link
// signed with HMAC-SHA256 so recipients can opt out with one click without
// needing to log in. Transactional emails (reset, signup, invoice) are
// exempt — they're not marketing.
//
// Flow:
//   1. enqueue -> unsubscribeToken(email) builds base64url(email).hex(mac)
//   2. link = <APP_ORIGIN>/api/public/unsubscribe?token=<token>
//   3. recipient clicks -> we verify + insert into email_unsubscribes
//   4. before any future broadcast, isUnsubscribed(email) filters them out
// ----------------------------------------------------------------------------

func (s *Server) unsubscribeRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/public/unsubscribe", s.publicUnsubscribe)
	mux.HandleFunc("POST /api/public/unsubscribe", s.publicUnsubscribe) // RFC 8058 One-Click
}

func (s *Server) publicUnsubscribe(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		_ = r.ParseForm()
		token = r.Form.Get("token")
	}
	email, ok := verifyUnsubscribeToken(token, s.secret)
	if !ok || email == "" {
		writeHTMLPage(w, 400, "Invalid unsubscribe link",
			"<p>This unsubscribe link is invalid or expired. Please contact support if you want to be removed from our mailing list.</p>")
		return
	}
	if r.URL.Query().Get("resubscribe") == "1" {
		_, _ = s.db.Exec(r.Context(), `DELETE FROM email_unsubscribes WHERE lower(email) = lower($1)`, email)
		writeHTMLPage(w, 200, "You're subscribed again",
			"<p>Great news! <strong>"+htmlEscape(email)+"</strong> will receive Fixora updates again.</p>")
		return
	}
	_, _ = s.db.Exec(r.Context(), `
		INSERT INTO email_unsubscribes (email, source) VALUES (lower($1), 'link')
		ON CONFLICT (email) DO UPDATE SET unsubscribed_at = now()`, email)
	writeHTMLPage(w, 200, "Unsubscribed",
		"<p>You're unsubscribed. <strong>"+htmlEscape(email)+"</strong> will no longer receive Fixora marketing emails.</p>"+
			"<p style=\"font-size:13px;color:#6b7280\">You'll still get important transactional emails like password resets and invoices — those aren't marketing.</p>"+
			"<p><a href=\"?token="+url.QueryEscape(token)+"&amp;resubscribe=1\">Changed your mind? Resubscribe</a></p>")
}

// isUnsubscribed returns true if the email has opted out.
func (s *Server) isUnsubscribed(ctx context.Context, email string) bool {
	if email == "" {
		return false
	}
	var exists bool
	_ = s.db.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM email_unsubscribes WHERE lower(email) = lower($1))`,
		email).Scan(&exists)
	return exists
}

// filterUnsubscribed strips opted-out addresses from a recipient list.
func (s *Server) filterUnsubscribed(ctx context.Context, emails []string) []string {
	if len(emails) == 0 {
		return emails
	}
	out := make([]string, 0, len(emails))
	for _, e := range emails {
		if !s.isUnsubscribed(ctx, e) {
			out = append(out, e)
		}
	}
	return out
}

// unsubscribeFooter returns the html + text footer snippets to append to a
// marketing email so each recipient sees their own personalized link.
func (s *Server) unsubscribeFooter(email string) (htmlFooter, textFooter string) {
	link := s.unsubscribeURL(email)
	htmlFooter = `<p style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;line-height:1.5;text-align:center">` +
		`You received this because your email is on Fixora's platform mailing list.<br>` +
		`<a href="` + link + `" style="color:#9ca3af">Unsubscribe</a> &nbsp;·&nbsp; ` +
		`<a href="` + link + `" style="color:#9ca3af">Manage preferences</a></p>`
	textFooter = "\n\n---\nUnsubscribe from Fixora marketing emails: " + link + "\n"
	return
}

// unsubscribeURL builds the HMAC-signed one-click opt-out link.
func (s *Server) unsubscribeURL(email string) string {
	origin := strings.TrimSpace(os.Getenv("APP_ORIGIN"))
	if origin == "" {
		origin = "https://my.fixoraerp.com"
	}
	return origin + "/api/public/unsubscribe?token=" + url.QueryEscape(unsubscribeToken(email, s.secret))
}

// unsubscribeToken = base64url(email) + "." + hex(HMAC_SHA256(secret, email))
func unsubscribeToken(email string, secret []byte) string {
	email = strings.ToLower(strings.TrimSpace(email))
	payload := base64.RawURLEncoding.EncodeToString([]byte(email))
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(email))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return payload + "." + sig
}

func verifyUnsubscribeToken(token string, secret []byte) (string, bool) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return "", false
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", false
	}
	email := strings.ToLower(strings.TrimSpace(string(raw)))
	if email == "" {
		return "", false
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", false
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(email))
	expect := mac.Sum(nil)
	if !hmac.Equal(sig, expect) {
		return "", false
	}
	return email, true
}

// writeHTMLPage is a tiny self-contained success/error landing page.
func writeHTMLPage(w http.ResponseWriter, status int, title, body string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`<!doctype html><html lang="en"><head><meta charset="utf-8">` +
		`<meta name="viewport" content="width=device-width,initial-scale=1">` +
		`<title>` + htmlEscape(title) + ` — Fixora</title>` +
		`<style>body{margin:0;background:#f8fafc;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;` +
		`display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}` +
		`.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:40px 36px;max-width:480px;` +
		`box-shadow:0 10px 30px rgba(15,23,42,.06);text-align:center}` +
		`h1{margin:0 0 14px;font-size:22px;font-weight:700;color:#0f172a}` +
		`p{color:#475569;line-height:1.6;font-size:15px;margin:0 0 12px}` +
		`a{color:#f58220;text-decoration:none;font-weight:600}a:hover{text-decoration:underline}` +
		`.brand{color:#f58220;font-weight:900;letter-spacing:-0.02em;font-size:28px;margin-bottom:12px}</style></head>` +
		`<body><div class="card"><div class="brand">Fixora</div><h1>` + htmlEscape(title) + `</h1>` + body + `</div></body></html>`))
}

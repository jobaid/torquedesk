package api

// Shop Manager → Customer Broadcast.
//
// A shop sends one email to every customer on file (deal / promo /
// maintenance note). Attached photo is stored in a 24h-TTL directory and
// served from a public URL (no auth) so the <img src> in the email works
// across every mail client. Files older than 24h are deleted by a
// background sweep that runs hourly.

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const broadcastTTL = 24 * time.Hour

func (s *Server) customerBroadcastRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/customer-broadcast/preview", s.auth("", s.shopBroadcastPreview))
	mux.HandleFunc("POST /api/customer-broadcast/upload", s.auth("shop.edit", s.shopBroadcastUpload))
	mux.HandleFunc("POST /api/customer-broadcast", s.auth("shop.edit", s.shopBroadcastSend))
	// Public image serve. No auth — email recipients fetch via <img src>.
	mux.HandleFunc("GET /broadcast-images/", s.serveBroadcastImage)
}

func broadcastImageDir() string {
	if v := strings.TrimSpace(os.Getenv("BROADCAST_IMG_DIR")); v != "" {
		return v
	}
	if v := strings.TrimSpace(os.Getenv("UPLOAD_DIR")); v != "" {
		return filepath.Join(v, "broadcast-images")
	}
	return "./uploads/broadcast-images"
}

// StartCustomerBroadcastSweeper boots a goroutine that purges expired
// broadcast images every hour. Call once from Server.New.
func (s *Server) StartCustomerBroadcastSweeper() {
	go func() {
		sweepBroadcastImages()
		t := time.NewTicker(time.Hour)
		for range t.C {
			sweepBroadcastImages()
		}
	}()
}

func sweepBroadcastImages() {
	dir := broadcastImageDir()
	cutoff := time.Now().Add(-broadcastTTL)
	_ = filepath.Walk(dir, func(p string, info os.FileInfo, err error) error {
		if err != nil || info == nil || info.IsDir() {
			return nil
		}
		if info.ModTime().Before(cutoff) {
			_ = os.Remove(p)
		}
		return nil
	})
}

// ---- preview ---------------------------------------------------------------

func (s *Server) shopBroadcastPreview(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var count int
	_ = s.db.QueryRow(r.Context(),
		`SELECT count(DISTINCT lower(email)) FROM customers
		  WHERE company_id::text = $1 AND email <> '' AND email LIKE '%@%'`, u.CompanyID).Scan(&count)
	writeJSON(w, 200, map[string]any{"count": count})
}

// ---- upload ----------------------------------------------------------------

var broadcastImageMIME = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/gif":  ".gif",
}

func (s *Server) shopBroadcastUpload(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10MB
		writeErr(w, 400, "could not read upload: "+err.Error())
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		writeErr(w, 400, "file field is required")
		return
	}
	defer file.Close()

	// Sniff MIME from content, not the filename, to block anything non-image.
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	ct := http.DetectContentType(buf[:n])
	ext, ok := broadcastImageMIME[ct]
	if !ok {
		writeErr(w, 400, "unsupported image type (allowed: jpeg, png, webp, gif)")
		return
	}
	// Rewind so we can copy the whole thing.
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeErr(w, 400, "could not read upload")
		return
	}

	id, err := randomHex(16)
	if err != nil {
		writeErr(w, 500, "could not allocate id")
		return
	}

	dir := filepath.Join(broadcastImageDir(), u.CompanyID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeErr(w, 500, "could not create upload dir: "+err.Error())
		return
	}
	name := id + ext
	dst := filepath.Join(dir, name)
	out, err := os.Create(dst)
	if err != nil {
		writeErr(w, 500, "could not open destination: "+err.Error())
		return
	}
	defer out.Close()
	if _, err := io.Copy(out, file); err != nil {
		_ = os.Remove(dst)
		writeErr(w, 500, "write failed: "+err.Error())
		return
	}
	_ = hdr // kept for logging if we want

	// Return a URL the email can embed. Absolute URL uses the request origin
	// so a Vite dev proxy, a staging host, and prod all work without config.
	publicPath := "/broadcast-images/" + u.CompanyID + "/" + name
	writeJSON(w, 200, map[string]any{
		"url":       publicPath,
		"absolute":  publicOrigin(r) + publicPath,
		"expiresAt": time.Now().Add(broadcastTTL).UTC(),
	})
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ---- public image serve ----------------------------------------------------

func (s *Server) serveBroadcastImage(w http.ResponseWriter, r *http.Request) {
	// Expected: /broadcast-images/<company_id>/<file>.<ext>
	rel := strings.TrimPrefix(r.URL.Path, "/broadcast-images/")
	if rel == "" || strings.Contains(rel, "..") || strings.Contains(rel, "\\") {
		http.NotFound(w, r)
		return
	}
	parts := strings.SplitN(rel, "/", 2)
	if len(parts) != 2 {
		http.NotFound(w, r)
		return
	}
	disk := filepath.Join(broadcastImageDir(), filepath.Clean(parts[0]), filepath.Clean(parts[1]))
	// Prefix check — never escape the broadcast image dir.
	absBase, _ := filepath.Abs(broadcastImageDir())
	absFile, _ := filepath.Abs(disk)
	if !strings.HasPrefix(absFile, absBase) {
		http.NotFound(w, r)
		return
	}
	info, err := os.Stat(disk)
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	// Enforce TTL at serve time too, so a file that's past 24h never shows
	// up even if the hourly sweep hasn't fired yet.
	if time.Since(info.ModTime()) > broadcastTTL {
		_ = os.Remove(disk)
		http.NotFound(w, r)
		return
	}
	ext := strings.ToLower(filepath.Ext(disk))
	if ct := mime.TypeByExtension(ext); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, disk)
}

// ---- send ------------------------------------------------------------------

type shopBroadcastReq struct {
	Subject  string `json:"subject"`
	Body     string `json:"body"`
	ImageURL string `json:"imageUrl,omitempty"` // relative like /broadcast-images/...
	DryRun   bool   `json:"dryRun,omitempty"`
}

func (s *Server) shopBroadcastSend(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	// Entitlement gate — reuses the existing company_features flag.
	if !s.companyHasFeature(r.Context(), u.CompanyID, "customer_broadcast") {
		writeJSON(w, 403, map[string]any{
			"error":        "Customer broadcast email is not enabled for your shop. Contact your TorqueDesk administrator.",
			"missingAddon": "customer_broadcast",
		})
		return
	}
	var in shopBroadcastReq
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, 400, "invalid request")
		return
	}
	in.Subject = strings.TrimSpace(in.Subject)
	in.Body = strings.TrimSpace(in.Body)
	if in.Subject == "" || in.Body == "" {
		writeErr(w, 400, "subject and body are required")
		return
	}

	rows, err := s.db.Query(r.Context(),
		`SELECT DISTINCT lower(email) FROM customers
		  WHERE company_id::text = $1 AND email <> '' AND email LIKE '%@%'`, u.CompanyID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	emails := []string{}
	for rows.Next() {
		var e string
		if err := rows.Scan(&e); err == nil && e != "" {
			emails = append(emails, e)
		}
	}
	rows.Close()
	if in.DryRun {
		writeJSON(w, 200, map[string]any{"recipients": len(emails), "dryRun": true})
		return
	}

	// Shop display name for From / sender identity.
	var shopName string
	_ = s.db.QueryRow(r.Context(), `SELECT name FROM companies WHERE id::text = $1`, u.CompanyID).Scan(&shopName)

	// Build HTML: wrap plain text if no tags, prepend image if provided.
	isHTML := strings.Contains(in.Body, "<") && strings.Contains(in.Body, ">")
	htmlBody := in.Body
	if !isHTML {
		htmlBody = "<p>" + strings.ReplaceAll(htmlEscape(in.Body), "\n\n", "</p><p>") + "</p>"
		htmlBody = strings.ReplaceAll(htmlBody, "\n", "<br>")
	}
	if in.ImageURL != "" {
		absImg := in.ImageURL
		if strings.HasPrefix(absImg, "/") {
			absImg = publicOrigin(r) + absImg
		}
		htmlBody = fmt.Sprintf(`<p><img src="%s" alt="" style="max-width:100%%;height:auto;border-radius:6px"></p>`, htmlEscape(absImg)) + htmlBody
	}
	textBody := stripTags(in.Body)

	fromName := shopName
	if fromName == "" {
		fromName = s.platformFromName(r.Context())
	}
	shell := platformEmailShell(fromName, in.Subject, htmlBody,
		"You are receiving this because you are a customer of "+htmlEscape(fromName)+".")

	batch := time.Now().UTC().Format("20060102150405")
	// Use context.Background() — r.Context() cancels when the HTTP response
	// returns, which would kill every enqueue in the goroutine below.
	go func() {
		ctx := context.Background()
		for _, email := range emails {
			s.SendPlatformEmail(ctx, []string{email}, in.Subject, shell, textBody,
				"customer_broadcast", "cbr:"+u.CompanyID+":"+batch+":"+strings.ToLower(email))
		}
		log.Printf("customer_broadcast: queued %d emails for company %s batch %s", len(emails), u.CompanyID, batch)
	}()

	writeJSON(w, 200, map[string]any{"ok": true, "recipients": len(emails), "batch": batch})
}


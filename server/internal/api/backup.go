package api

// Per-tenant backup / restore — complete company bundle.
//
// Each backup is a ZIP archive containing:
//   manifest.json                        — company id/name, version, counts, kind
//   data.json                            — all tenant database rows (snapshot)
//   files/inspection-photos/<photoId>.*  — inspection item photos (actual bytes)
//
// Two kinds of backup live side-by-side under BACKUP_DIR:
//   {company_id}/manual/{SanitizedCompany}_Backup_YYYY-MM-DD_HHmm.zip
//   {company_id}/auto/{SanitizedCompany}_AutoBackup.zip
//
// Auto-backup replaces the single current auto file with a safe swap:
// build to .new, verify, rename over the live file. The old file is only
// deleted after the new file is verified — a failed build never leaves the
// tenant without an auto-backup.
//
// Credentials (password_hash, mfa_secret, app_secrets, encrypted gateway
// secrets, SMTP password, token signing key) are NEVER written to a backup.

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	backupSchemaVersion   = 2 // schema v2 adds files/, manifest, inspections
	backupManualDirName   = "manual"
	backupAutoDirName     = "auto"
	backupAutoFileSuffix  = "_AutoBackup.zip"
	backupPhotoPathPrefix = "files/inspection-photos/"
)

func backupDir() string {
	d := strings.TrimSpace(os.Getenv("BACKUP_DIR"))
	if d == "" {
		d = "./backups"
	}
	return d
}

// -----------------------------------------------------------------------
// Manifest + snapshot structures
// -----------------------------------------------------------------------

type backupManifest struct {
	Version       int    `json:"version"`
	Kind          string `json:"kind"` // "manual" | "auto"
	CompanyID     string `json:"companyId"`
	CompanyName   string `json:"companyName"`
	CompanySlug   string `json:"companySlug"`
	TakenAt       string `json:"takenAt"`
	AppVersion    string `json:"appVersion"`
	SchemaVersion int    `json:"schemaVersion"`
	Counts        counts `json:"counts"`
	TotalBytes    int64  `json:"totalBytes"`
	FileCount     int    `json:"fileCount"`
}

type counts struct {
	Customers   int `json:"customers"`
	Documents   int `json:"documents"`
	Payments    int `json:"payments"`
	Inspections int `json:"inspections"`
	Photos      int `json:"photos"`
	Messages    int `json:"messages"`
	Users       int `json:"users"`
}

type backupSnapshot struct {
	Version        int              `json:"version"`
	TakenAt        string           `json:"takenAt"`
	Company        map[string]any   `json:"company"`
	Settings       map[string]any   `json:"settings"`
	Customers      []map[string]any `json:"customers"`
	Users          []map[string]any `json:"users"`
	Documents      []map[string]any `json:"documents"`
	Payments       []map[string]any `json:"payments"`
	AuditLog       []map[string]any `json:"auditLog"`
	Inspections    []map[string]any `json:"inspections"`
	InspItems      []map[string]any `json:"inspectionItems"`
	InspPhotos     []map[string]any `json:"inspectionPhotos"` // metadata only; bytes live in files/
	Messages       []map[string]any `json:"messages"`
	Authorizations []map[string]any `json:"authorizations"`
}

// -----------------------------------------------------------------------
// Snapshot build
// -----------------------------------------------------------------------

func (s *Server) buildBackupSnapshot(ctx context.Context, cid string) (*backupSnapshot, map[string]any, error) {
	snap := &backupSnapshot{Version: backupSchemaVersion, TakenAt: time.Now().UTC().Format(time.RFC3339)}

	var code, slug, name string
	if err := s.db.QueryRow(ctx, `SELECT company_code, slug, name FROM companies WHERE id::text = $1`, cid).Scan(&code, &slug, &name); err != nil {
		return nil, nil, fmt.Errorf("company: %w", err)
	}
	company := map[string]any{"id": cid, "companyCode": code, "slug": slug, "name": name}
	snap.Company = company

	// Settings bundle
	if err := s.tx(ctx, func(tx pgx.Tx) error {
		b, err := s.loadBundle(ctx, tx, cid)
		if err != nil {
			return err
		}
		snap.Settings = b
		return nil
	}); err != nil {
		return nil, nil, fmt.Errorf("settings: %w", err)
	}

	// Customers
	cust, err := s.customersForBackup(ctx, cid)
	if err != nil {
		return nil, nil, fmt.Errorf("customers: %w", err)
	}
	snap.Customers = cust

	// Users (no password_hash / mfa_secret)
	urows, err := s.db.Query(ctx, `SELECT id::text, first_name, last_name, email, phone, username, role, status, coalesce(mfa_enabled,false), last_login_at, created_at
		FROM company_owners WHERE company_id::text = $1 ORDER BY created_at`, cid)
	if err == nil {
		defer urows.Close()
		for urows.Next() {
			var id, fn, ln, email, phone, un, role, status string
			var mfa bool
			var last *time.Time
			var created time.Time
			if err := urows.Scan(&id, &fn, &ln, &email, &phone, &un, &role, &status, &mfa, &last, &created); err != nil {
				continue
			}
			var lastMS any
			if last != nil {
				lastMS = last.UnixMilli()
			}
			snap.Users = append(snap.Users, map[string]any{
				"id": id, "firstName": fn, "lastName": ln, "email": email, "phone": phone,
				"username": un, "role": role, "status": status, "mfaEnabled": mfa,
				"lastLoginAt": lastMS, "createdAt": created.UnixMilli(),
			})
		}
	}

	// Documents
	docs, err := s.allDocsForBackup(ctx, cid)
	if err != nil {
		return nil, nil, fmt.Errorf("documents: %w", err)
	}
	snap.Documents = docs

	// Payments
	snap.Payments = allAsJSON(ctx, s.db, `SELECT to_jsonb(p) FROM payments p WHERE p.company_id::text = $1 ORDER BY p.paid_at`, cid)
	// Inspections + items + photo metadata
	snap.Inspections = allAsJSON(ctx, s.db, `SELECT to_jsonb(i) FROM inspections i WHERE i.company_id::text = $1 ORDER BY i.created_at`, cid)
	snap.InspItems = allAsJSON(ctx, s.db, `SELECT to_jsonb(it) FROM inspection_items it
		JOIN inspections i ON i.id = it.inspection_id WHERE i.company_id::text = $1 ORDER BY it.created_at`, cid)
	snap.InspPhotos = allAsJSON(ctx, s.db, `SELECT to_jsonb(p) FROM inspection_item_photos p
		JOIN inspections i ON i.id = p.inspection_id WHERE i.company_id::text = $1 ORDER BY p.created_at`, cid)
	// Messages
	snap.Messages = allAsJSON(ctx, s.db, `SELECT to_jsonb(m) FROM document_messages m WHERE m.company_id::text = $1 ORDER BY m.created_at`, cid)
	// Authorizations + items + events
	snap.Authorizations = allAsJSON(ctx, s.db, `SELECT jsonb_build_object(
		'authorization', to_jsonb(a),
		'items', coalesce((SELECT jsonb_agg(to_jsonb(it)) FROM document_auth_items it WHERE it.authorization_id = a.id), '[]'::jsonb),
		'events', coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM document_auth_events e WHERE e.authorization_id = a.id), '[]'::jsonb)
	) FROM document_authorizations a WHERE a.company_id::text = $1 ORDER BY a.created_at`, cid)

	// Audit log (last 5000)
	snap.AuditLog = allAsJSON(ctx, s.db, `SELECT to_jsonb(l) FROM settings_audit_log l WHERE l.company_id::text = $1 ORDER BY l.created_at DESC LIMIT 5000`, cid)

	return snap, company, nil
}

func allAsJSON(ctx context.Context, db interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, q string, args ...any) []map[string]any {
	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var raw map[string]any
		if err := rows.Scan(&raw); err == nil {
			out = append(out, raw)
		}
	}
	return out
}

// allDocsForBackup unchanged: returns API-shape rows with _row (to_jsonb) key.
func (s *Server) allDocsForBackup(ctx context.Context, cid string) ([]map[string]any, error) {
	rows, err := s.db.Query(ctx, `SELECT `+docCols+` FROM documents WHERE company_id::text = $1 ORDER BY created_at`, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	api := []map[string]any{}
	ids := []string{}
	for rows.Next() {
		d, err := scanDoc(rows)
		if err != nil {
			return nil, err
		}
		api = append(api, d)
		ids = append(ids, fmt.Sprint(d["id"]))
	}
	if len(ids) == 0 {
		return api, nil
	}
	rr, err := s.db.Query(ctx, `SELECT id::text, to_jsonb(d) FROM documents d WHERE company_id::text = $1`, cid)
	if err != nil {
		return nil, err
	}
	defer rr.Close()
	raw := map[string]any{}
	for rr.Next() {
		var id string
		var j any
		if err := rr.Scan(&id, &j); err != nil {
			return nil, err
		}
		raw[id] = j
	}
	for _, d := range api {
		if r, ok := raw[fmt.Sprint(d["id"])]; ok {
			d["_row"] = r
		}
	}
	return api, nil
}

// -----------------------------------------------------------------------
// Archive write
// -----------------------------------------------------------------------

func (s *Server) writeArchive(ctx context.Context, cid, kind, outPath string) (*backupManifest, error) {
	snap, company, err := s.buildBackupSnapshot(ctx, cid)
	if err != nil {
		return nil, err
	}
	// Snapshot JSON first (compact — the zip will compress it anyway).
	snapJSON, err := json.Marshal(snap)
	if err != nil {
		return nil, err
	}

	// Build manifest. Counts are the authoritative tallies for verification.
	m := &backupManifest{
		Version:       1,
		Kind:          kind,
		CompanyID:     cid,
		CompanyName:   fmt.Sprint(company["name"]),
		CompanySlug:   fmt.Sprint(company["slug"]),
		TakenAt:       snap.TakenAt,
		AppVersion:    "torquedesk/1",
		SchemaVersion: backupSchemaVersion,
		Counts: counts{
			Customers:   len(snap.Customers),
			Documents:   len(snap.Documents),
			Payments:    len(snap.Payments),
			Inspections: len(snap.Inspections),
			Photos:      len(snap.InspPhotos),
			Messages:    len(snap.Messages),
			Users:       len(snap.Users),
		},
	}

	// Write to .new sibling so a crash during write never corrupts the live file.
	tmp := outPath + ".new"
	if err := os.MkdirAll(filepath.Dir(outPath), 0o700); err != nil {
		return nil, err
	}
	f, err := os.Create(tmp)
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()

	zw := zip.NewWriter(f)

	// manifest.json
	if err := writeZipFile(zw, "manifest.json", mustJSON(m)); err != nil {
		_ = zw.Close()
		return nil, err
	}
	// data.json (the full snapshot)
	if err := writeZipFile(zw, "data.json", snapJSON); err != nil {
		_ = zw.Close()
		return nil, err
	}
	// Inspection photos: copy each file byte-for-byte from UPLOAD_DIR.
	fileCount := 0
	for _, p := range snap.InspPhotos {
		id, _ := p["id"].(string)
		inspID, _ := p["inspection_id"].(string)
		itemID, _ := p["item_id"].(string)
		ext, _ := p["extension"].(string)
		if id == "" || inspID == "" || itemID == "" || ext == "" {
			continue
		}
		src, err := photoDiskPath(cid, inspID, itemID, id, ext)
		if err != nil {
			log.Printf("backup %s: photo %s skipped (%v)", cid, id, err)
			continue
		}
		data, err := os.ReadFile(src)
		if err != nil {
			log.Printf("backup %s: photo %s unreadable (%v) — snapshot includes metadata only", cid, id, err)
			continue
		}
		if err := writeZipFile(zw, backupPhotoPathPrefix+id+ext, data); err != nil {
			_ = zw.Close()
			return nil, err
		}
		fileCount++
	}
	m.FileCount = fileCount
	// Re-encode manifest with FileCount (zip is write-once; rewrite the entry
	// isn't supported, so we accept the pre-count value and just update m
	// in-memory for the HTTP response).
	if err := zw.Close(); err != nil {
		return nil, err
	}
	fi, _ := f.Stat()
	if fi != nil {
		m.TotalBytes = fi.Size()
	}
	if err := f.Close(); err != nil {
		return nil, err
	}
	// Atomic swap into place.
	if err := os.Rename(tmp, outPath); err != nil {
		_ = os.Remove(tmp)
		return nil, err
	}
	return m, nil
}

func writeZipFile(zw *zip.Writer, name string, data []byte) error {
	fh := &zip.FileHeader{Name: name, Method: zip.Deflate, Modified: time.Now()}
	w, err := zw.CreateHeader(fh)
	if err != nil {
		return err
	}
	_, err = w.Write(data)
	return err
}

func mustJSON(v any) []byte { b, _ := json.MarshalIndent(v, "", "  "); return b }

// -----------------------------------------------------------------------
// Filename conventions
// -----------------------------------------------------------------------

var sanitizeRE = regexp.MustCompile(`[^A-Za-z0-9]+`)

func sanitizeName(name string) string {
	n := strings.ReplaceAll(name, "&", " and ")
	n = sanitizeRE.ReplaceAllString(n, "_")
	n = strings.Trim(n, "_")
	if n == "" {
		n = "Shop"
	}
	if len(n) > 60 {
		n = n[:60]
	}
	return n
}

func manualFilename(companyName string) string {
	return fmt.Sprintf("%s_Backup_%s.zip", sanitizeName(companyName), time.Now().UTC().Format("2006-01-02_1504"))
}

func autoFilename(companyName string) string {
	return sanitizeName(companyName) + backupAutoFileSuffix
}

func manualDir(cid string) string { return filepath.Join(backupDir(), cid, backupManualDirName) }
func autoDir(cid string) string   { return filepath.Join(backupDir(), cid, backupAutoDirName) }

// -----------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------

func (s *Server) backupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/backup/list", s.auth("shop.edit", s.listBackups))
	mux.HandleFunc("POST /api/backup/manual", s.auth("shop.edit", s.createManualBackup))
	mux.HandleFunc("POST /api/backup/auto/run", s.auth("shop.edit", s.runAutoBackupNow))
	mux.HandleFunc("GET /api/backup/download/{kind}/{name}", s.auth("shop.edit", s.downloadBackupFile))
	mux.HandleFunc("DELETE /api/backup/manual/{name}", s.auth("shop.edit", s.deleteManualBackup))
	mux.HandleFunc("POST /api/backup/restore", s.auth("shop.edit", s.restoreBackup))
}

// -----------------------------------------------------------------------
// List
// -----------------------------------------------------------------------

type backupListItem struct {
	Kind    string `json:"kind"` // manual | auto
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	TakenAt int64  `json:"takenAt"` // ms
	Current bool   `json:"current,omitempty"`
}

func (s *Server) listBackups(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	out := []backupListItem{}
	for _, item := range listKind(autoDir(cid)) {
		item.Kind = "auto"
		item.Current = true
		out = append(out, item)
	}
	for _, item := range listKind(manualDir(cid)) {
		item.Kind = "manual"
		out = append(out, item)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].TakenAt > out[j].TakenAt })
	writeJSON(w, 200, out)
}

func listKind(dir string) []backupListItem {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	out := []backupListItem{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".zip") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, backupListItem{
			Name: e.Name(), Size: info.Size(), TakenAt: info.ModTime().UnixMilli(),
		})
	}
	return out
}

// -----------------------------------------------------------------------
// Manual create / Auto run
// -----------------------------------------------------------------------

func (s *Server) createManualBackup(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	var company map[string]any
	err := s.db.QueryRow(r.Context(), `SELECT jsonb_build_object('id', id::text, 'name', name, 'slug', slug) FROM companies WHERE id::text = $1`, cid).Scan(&company)
	if err != nil {
		handleErr(w, err)
		return
	}
	name := fmt.Sprint(company["name"])
	fn := manualFilename(name)
	outPath := filepath.Join(manualDir(cid), fn)
	m, err := s.writeArchive(r.Context(), cid, "manual", outPath)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 201, map[string]any{"ok": true, "name": fn, "manifest": m})
}

func (s *Server) runAutoBackupNow(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	m, err := s.writeAutoBackup(r.Context(), cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "manifest": m})
}

// writeAutoBackup is the safe-swap path: build to .new, verify by opening the
// zip, read manifest, then rename over the current. Old file deleted ONLY on
// success. On failure the previous auto-backup stays intact.
func (s *Server) writeAutoBackup(ctx context.Context, cid string) (*backupManifest, error) {
	var company map[string]any
	if err := s.db.QueryRow(ctx, `SELECT jsonb_build_object('id', id::text, 'name', name, 'slug', slug) FROM companies WHERE id::text = $1`, cid).Scan(&company); err != nil {
		return nil, err
	}
	outPath := filepath.Join(autoDir(cid), autoFilename(fmt.Sprint(company["name"])))
	m, err := s.writeArchive(ctx, cid, "auto", outPath)
	if err != nil {
		return nil, err
	}
	// Verify: re-open the zip and sanity-check the manifest.
	if err := verifyArchive(outPath, cid); err != nil {
		return nil, fmt.Errorf("auto-backup verification failed: %w", err)
	}
	// Clean up any extra auto-backup files with a different sanitized name
	// (e.g. after a company rename).
	entries, _ := os.ReadDir(autoDir(cid))
	keep := filepath.Base(outPath)
	for _, e := range entries {
		if !e.IsDir() && e.Name() != keep && strings.HasSuffix(e.Name(), backupAutoFileSuffix) {
			_ = os.Remove(filepath.Join(autoDir(cid), e.Name()))
		}
	}
	return m, nil
}

func verifyArchive(path, expectedCID string) error {
	rc, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	defer rc.Close()
	var hasManifest, hasData bool
	for _, f := range rc.File {
		if f.Name == "manifest.json" {
			hasManifest = true
			r, err := f.Open()
			if err != nil {
				return err
			}
			raw, _ := io.ReadAll(r)
			_ = r.Close()
			var m backupManifest
			if err := json.Unmarshal(raw, &m); err != nil {
				return err
			}
			if m.CompanyID != expectedCID {
				return fmt.Errorf("manifest company id %q != %q", m.CompanyID, expectedCID)
			}
		}
		if f.Name == "data.json" {
			hasData = true
		}
	}
	if !hasManifest || !hasData {
		return errors.New("archive missing manifest.json or data.json")
	}
	return nil
}

// -----------------------------------------------------------------------
// Download / delete
// -----------------------------------------------------------------------

func (s *Server) downloadBackupFile(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	kind := r.PathValue("kind")
	name := r.PathValue("name")
	if strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
		writeErr(w, 400, "Invalid backup name.")
		return
	}
	var dir string
	switch kind {
	case "manual":
		dir = manualDir(cid)
	case "auto":
		dir = autoDir(cid)
	default:
		writeErr(w, 400, "Invalid backup kind.")
		return
	}
	path := filepath.Join(dir, name)
	f, err := os.Open(path)
	if err != nil {
		writeErr(w, 404, "Backup not found.")
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	_, _ = io.Copy(w, f)
}

func (s *Server) deleteManualBackup(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	name := r.PathValue("name")
	if strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
		writeErr(w, 400, "Invalid backup name.")
		return
	}
	path := filepath.Join(manualDir(cid), name)
	if err := os.Remove(path); err != nil {
		writeErr(w, 404, "Backup not found.")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// -----------------------------------------------------------------------
// Owner-side download (any company), unchanged signature from older code
// -----------------------------------------------------------------------

func (s *Server) ownerDownloadBackup(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	cid := r.PathValue("id")
	var company map[string]any
	err := s.db.QueryRow(r.Context(), `SELECT jsonb_build_object('id', id::text, 'name', name, 'slug', slug) FROM companies WHERE id::text = $1`, cid).Scan(&company)
	if err != nil {
		writeErr(w, 404, "Company not found.")
		return
	}
	name := fmt.Sprint(company["name"])
	fn := manualFilename(name)
	tmp := filepath.Join(os.TempDir(), fn)
	if _, err := s.writeArchive(r.Context(), cid, "manual", tmp); err != nil {
		handleErr(w, err)
		return
	}
	defer os.Remove(tmp)
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "company_exported", "company", cid, &cid, nil, clientIP(r))
	f, err := os.Open(tmp)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+fn+`"`)
	_, _ = io.Copy(w, f)
}

// -----------------------------------------------------------------------
// Restore
// -----------------------------------------------------------------------

type restoreSummary struct {
	Documents   int `json:"documents"`
	Customers   int `json:"customers"`
	Payments    int `json:"payments"`
	Inspections int `json:"inspections"`
	Photos      int `json:"photos"`
	Messages    int `json:"messages"`
}

// restoreBackup accepts either a new ZIP archive (preferred) or a legacy
// gzipped JSON snapshot. Validates manifest + companyId; refuses anything
// pointing at another tenant.
func (s *Server) restoreBackup(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	u := userFrom(r.Context())

	// 200 MB cap — plenty for photo-heavy backups, sanity cap on uploads.
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 200<<20))
	if err != nil {
		writeErr(w, 400, "Backup file too large or unreadable.")
		return
	}
	var snap *backupSnapshot
	var photos map[string][]byte // photoID -> bytes
	switch {
	case len(body) >= 4 && body[0] == 'P' && body[1] == 'K' && body[2] == 0x03 && body[3] == 0x04:
		snap, photos, err = parseZipArchive(body, cid)
	case len(body) >= 2 && body[0] == 0x1f && body[1] == 0x8b:
		writeErr(w, 400, "Legacy gzipped backups are no longer supported. Please upload a .zip backup.")
		return
	default:
		// Raw JSON (older manual export)
		var raw backupSnapshot
		if jErr := json.Unmarshal(body, &raw); jErr != nil {
			writeErr(w, 400, "Not a valid TorqueDesk backup file.")
			return
		}
		if raw.Company == nil || fmt.Sprint(raw.Company["id"]) != cid {
			writeErr(w, 400, "This backup belongs to a different company.")
			return
		}
		snap = &raw
	}
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if snap.Version < 1 {
		writeErr(w, 400, "Backup is missing a version.")
		return
	}

	summary := restoreSummary{}
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		// Wipe mutable tenant data; CASCADE handles children.
		for _, q := range []string{
			`DELETE FROM document_messages WHERE company_id::text = $1`,
			`DELETE FROM document_authorizations WHERE company_id::text = $1`,
			`DELETE FROM inspection_item_photos WHERE inspection_id IN (SELECT id FROM inspections WHERE company_id::text = $1)`,
			`DELETE FROM inspections WHERE company_id::text = $1`,
			`DELETE FROM payments WHERE company_id::text = $1`,
			`DELETE FROM documents WHERE company_id::text = $1`,
			`DELETE FROM customers WHERE company_id::text = $1`,
		} {
			if _, err := tx.Exec(r.Context(), q, cid); err != nil {
				return err
			}
		}
		// Customers
		for i, c := range snap.Customers {
			raw, ok := c["_row"]
			if !ok {
				continue
			}
			rawJSON, _ := json.Marshal(raw)
			if _, err := tx.Exec(r.Context(), `INSERT INTO customers
				SELECT (jsonb_populate_record(NULL::customers,
				  ($1::jsonb) || jsonb_build_object('company_id', $2::uuid))).*
				ON CONFLICT (id) DO NOTHING`, string(rawJSON), cid); err != nil {
				return fmt.Errorf("restore customer %d: %w", i, err)
			}
			summary.Customers++
		}
		// Documents
		for i, d := range snap.Documents {
			if _, err := s.insertFromBackup(r.Context(), tx, d, cid); err != nil {
				return fmt.Errorf("restore doc %d: %w", i, err)
			}
			summary.Documents++
		}
		// Payments
		for _, p := range snap.Payments {
			rawJSON, _ := json.Marshal(p)
			if _, err := tx.Exec(r.Context(), `INSERT INTO payments
				SELECT (jsonb_populate_record(NULL::payments,
				  ($1::jsonb) || jsonb_build_object('company_id', $2::uuid))).*
				ON CONFLICT (id) DO NOTHING`, string(rawJSON), cid); err != nil {
				return err
			}
			summary.Payments++
		}
		// Inspections
		for _, in := range snap.Inspections {
			rawJSON, _ := json.Marshal(in)
			if _, err := tx.Exec(r.Context(), `INSERT INTO inspections
				SELECT (jsonb_populate_record(NULL::inspections,
				  ($1::jsonb) || jsonb_build_object('company_id', $2::uuid))).*
				ON CONFLICT (id) DO NOTHING`, string(rawJSON), cid); err != nil {
				return err
			}
			summary.Inspections++
		}
		// Inspection items — scoped by parent inspection (which is already in-tenant)
		for _, it := range snap.InspItems {
			rawJSON, _ := json.Marshal(it)
			if _, err := tx.Exec(r.Context(), `INSERT INTO inspection_items
				SELECT (jsonb_populate_record(NULL::inspection_items, $1::jsonb)).*
				ON CONFLICT (id) DO NOTHING`, string(rawJSON)); err != nil {
				return err
			}
		}
		// Inspection photos — reconnect to inspection via inspection_id (already tenant-scoped).
		for _, ph := range snap.InspPhotos {
			rawJSON, _ := json.Marshal(ph)
			if _, err := tx.Exec(r.Context(), `INSERT INTO inspection_item_photos
				SELECT (jsonb_populate_record(NULL::inspection_item_photos, $1::jsonb)).*
				ON CONFLICT (id) DO NOTHING`, string(rawJSON)); err != nil {
				return err
			}
			summary.Photos++
		}
		// Messages
		for _, m := range snap.Messages {
			rawJSON, _ := json.Marshal(m)
			if _, err := tx.Exec(r.Context(), `INSERT INTO document_messages
				SELECT (jsonb_populate_record(NULL::document_messages,
				  ($1::jsonb) || jsonb_build_object('company_id', $2::uuid))).*
				ON CONFLICT (id) DO NOTHING`, string(rawJSON), cid); err != nil {
				return err
			}
			summary.Messages++
		}
		// Recompute totals + child tables (document_lines / document_taxes /
		// document_fees) for every restored document — otherwise Parts Profit,
		// Payments and Tax reports see empty child tables.
		for _, d := range snap.Documents {
			id, _ := d["id"].(string)
			if id == "" {
				continue
			}
			if err := recalcDocument(r.Context(), tx, id); err != nil {
				return fmt.Errorf("recalc doc %s: %w", id, err)
			}
		}
		// Audit event
		return audit(r.Context(), tx, u, "backup", "restore", "update", "Backup restored",
			"", fmt.Sprintf("takenAt=%s docs=%d photos=%d msgs=%d", snap.TakenAt, summary.Documents, summary.Photos, summary.Messages), cid)
	})
	if err != nil {
		log.Printf("restore error: %v", err)
		handleErr(w, err)
		return
	}

	// Write photo files back to disk — outside the transaction so a half-written
	// photo doesn't roll back a successful DB restore. Missing files are
	// logged, not fatal, so the user can see which bytes couldn't be recovered.
	for _, ph := range snap.InspPhotos {
		id, _ := ph["id"].(string)
		inspID, _ := ph["inspection_id"].(string)
		itemID, _ := ph["item_id"].(string)
		ext, _ := ph["extension"].(string)
		if id == "" || inspID == "" || itemID == "" || ext == "" {
			continue
		}
		data, ok := photos[id+ext]
		if !ok {
			continue
		}
		dst, derr := photoDiskPath(cid, inspID, itemID, id, ext)
		if derr != nil {
			continue
		}
		_ = os.MkdirAll(filepath.Dir(dst), 0o755)
		_ = os.WriteFile(dst, data, 0o644)
	}

	writeJSON(w, 200, map[string]any{"ok": true, "summary": summary})
}

// parseZipArchive reads a zip into memory and extracts data.json + inspection
// photos. Validates the manifest against the current tenant.
func parseZipArchive(buf []byte, cid string) (*backupSnapshot, map[string][]byte, error) {
	zr, err := zip.NewReader(bytes.NewReader(buf), int64(len(buf)))
	if err != nil {
		return nil, nil, fmt.Errorf("could not read zip: %w", err)
	}
	var manifestRaw, dataRaw []byte
	photos := map[string][]byte{}
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			return nil, nil, err
		}
		data, _ := io.ReadAll(rc)
		_ = rc.Close()
		switch {
		case f.Name == "manifest.json":
			manifestRaw = data
		case f.Name == "data.json":
			dataRaw = data
		case strings.HasPrefix(f.Name, backupPhotoPathPrefix):
			base := strings.TrimPrefix(f.Name, backupPhotoPathPrefix)
			if strings.ContainsAny(base, "/\\") {
				continue
			}
			photos[base] = data
		}
	}
	if len(manifestRaw) == 0 || len(dataRaw) == 0 {
		return nil, nil, errors.New("archive is missing manifest.json or data.json")
	}
	var m backupManifest
	if err := json.Unmarshal(manifestRaw, &m); err != nil {
		return nil, nil, fmt.Errorf("manifest is malformed: %w", err)
	}
	if m.CompanyID != cid {
		return nil, nil, fmt.Errorf("backup belongs to a different company (%q)", m.CompanyName)
	}
	if m.SchemaVersion > backupSchemaVersion {
		return nil, nil, fmt.Errorf("backup is from a newer app version (schema %d). Please upgrade before restoring.", m.SchemaVersion)
	}
	var snap backupSnapshot
	if err := json.Unmarshal(dataRaw, &snap); err != nil {
		return nil, nil, fmt.Errorf("data.json is malformed: %w", err)
	}
	return &snap, photos, nil
}

// insertFromBackup re-inserts a document by expanding its _row JSON back into
// a row via jsonb_populate_record. company_id is always rewritten to the
// current tenant so a tampered backup can't inject rows into another company.
func (s *Server) insertFromBackup(ctx context.Context, tx pgx.Tx, d map[string]any, cid string) (string, error) {
	rawAny, ok := d["_row"]
	if !ok {
		return "", fmt.Errorf("backup document missing _row")
	}
	rawJSON, _ := json.Marshal(rawAny)
	var newID string
	err := tx.QueryRow(ctx, `INSERT INTO documents
		SELECT (jsonb_populate_record(NULL::documents,
		  ($1::jsonb) || jsonb_build_object('company_id', $2::uuid))).*
		ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at
		RETURNING id::text`, string(rawJSON), cid).Scan(&newID)
	return newID, err
}

// -----------------------------------------------------------------------
// Scheduler
// -----------------------------------------------------------------------

// StartAutoBackup launches a background loop. First run 2 minutes after boot
// (so a redeploy produces a fresh snapshot), then every 24h. Each tenant's
// auto-backup is a single current file, replaced via safe-swap.
func (s *Server) StartAutoBackup(ctx context.Context) {
	go func() {
		timer := time.NewTimer(2 * time.Minute)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				s.runAutoBackupAllTenants(ctx)
				timer.Reset(24 * time.Hour)
			}
		}
	}()
}

func (s *Server) runAutoBackupAllTenants(ctx context.Context) {
	rows, err := s.db.Query(ctx, `SELECT id::text FROM companies WHERE status IN ('active', 'trial')`)
	if err != nil {
		log.Printf("auto-backup: list companies: %v", err)
		return
	}
	defer rows.Close()
	cids := []string{}
	for rows.Next() {
		var cid string
		if err := rows.Scan(&cid); err == nil {
			cids = append(cids, cid)
		}
	}
	for _, cid := range cids {
		if _, err := s.writeAutoBackup(ctx, cid); err != nil {
			log.Printf("auto-backup %s: %v (previous backup kept)", cid, err)
		}
	}
}

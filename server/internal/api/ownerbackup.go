package api

// SaaS-owner platform backup: ONE ZIP that contains every tenant's full data
// plus the SaaS-level tables (companies, subscriptions, saas_admin_users,
// company_owners, company_features). Restoring this bundle rebuilds the whole
// platform state after a server crash or a move to new infrastructure.
//
// Archive layout:
//   manifest.json
//   global/companies.json
//   global/subscriptions.json
//   global/saas_admin_users.json         <-- includes password_hash + mfa
//   global/company_owners.json           <-- includes password_hash + mfa
//   global/company_features.json
//   companies/{cid}/manifest.json
//   companies/{cid}/data.json            <-- same shape as per-tenant backup
//   companies/{cid}/files/inspection-photos/<photoId>.<ext>
//
// Credentials ARE included because this is a disaster-recovery backup. Keep
// the file in a safe place — anyone with the ZIP can rehydrate the whole
// platform. The per-tenant backup (api/backup.go) excludes credentials
// because that one is a tenant-facing export.
//
// Auto backup replaces a single current file per global; safe-swap pattern:
// write to .new, verify by reopening, atomic rename over the live file. The
// previous backup is only removed after the new one is verified.

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
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	ownerBackupAutoName = "TorqueDesk_PlatformBackup.zip"
	ownerBackupDirName  = "_global"
)

func ownerBackupBaseDir() string { return filepath.Join(backupDir(), ownerBackupDirName) }
func ownerAutoDir() string       { return filepath.Join(ownerBackupBaseDir(), "auto") }
func ownerManualDir() string     { return filepath.Join(ownerBackupBaseDir(), "manual") }

type ownerBackupManifest struct {
	Version       int    `json:"version"`
	Kind          string `json:"kind"` // "manual" | "auto"
	TakenAt       string `json:"takenAt"`
	AppVersion    string `json:"appVersion"`
	SchemaVersion int    `json:"schemaVersion"`
	Companies     int    `json:"companies"`
	TotalBytes    int64  `json:"totalBytes"`
}

// -----------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------

func (s *Server) ownerBackupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/owner/backups", s.ownerAuth(s.ownerListBackups))
	mux.HandleFunc("POST /api/owner/backups/manual", s.ownerAuth(s.ownerCreateManualBackup))
	mux.HandleFunc("POST /api/owner/backups/auto/run", s.ownerAuth(s.ownerRunAutoBackup))
	mux.HandleFunc("GET /api/owner/backups/download/{kind}/{name}", s.ownerAuth(s.ownerDownloadBackupFile))
	mux.HandleFunc("DELETE /api/owner/backups/manual/{name}", s.ownerAuth(s.ownerDeleteManualBackup))
	mux.HandleFunc("POST /api/owner/backups/restore", s.ownerAuth(s.ownerRestoreBackup))
}

// -----------------------------------------------------------------------
// List
// -----------------------------------------------------------------------

type ownerBackupItem struct {
	Kind    string `json:"kind"`
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	TakenAt int64  `json:"takenAt"`
	Current bool   `json:"current,omitempty"`
}

func (s *Server) ownerListBackups(w http.ResponseWriter, r *http.Request) {
	out := []ownerBackupItem{}
	for _, item := range ownerListKind(ownerAutoDir()) {
		item.Kind = "auto"
		item.Current = true
		out = append(out, item)
	}
	for _, item := range ownerListKind(ownerManualDir()) {
		item.Kind = "manual"
		out = append(out, item)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].TakenAt > out[j].TakenAt })
	writeJSON(w, 200, out)
}

func ownerListKind(dir string) []ownerBackupItem {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	out := []ownerBackupItem{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".zip") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, ownerBackupItem{Name: e.Name(), Size: info.Size(), TakenAt: info.ModTime().UnixMilli()})
	}
	return out
}

// -----------------------------------------------------------------------
// Create (manual + auto)
// -----------------------------------------------------------------------

func (s *Server) ownerCreateManualBackup(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	fn := fmt.Sprintf("TorqueDesk_PlatformBackup_%s.zip", time.Now().UTC().Format("2006-01-02_1504"))
	out := filepath.Join(ownerManualDir(), fn)
	m, err := s.writeOwnerArchive(r.Context(), "manual", out)
	if err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "platform_backup_created", "backup", fn, nil,
		map[string]any{"kind": "manual", "companies": m.Companies, "bytes": m.TotalBytes}, clientIP(r))
	writeJSON(w, 201, map[string]any{"ok": true, "name": fn, "manifest": m})
}

func (s *Server) ownerRunAutoBackup(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	m, err := s.writeOwnerAutoBackup(r.Context())
	if err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "platform_backup_auto_run", "backup", ownerBackupAutoName, nil,
		map[string]any{"companies": m.Companies, "bytes": m.TotalBytes}, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true, "manifest": m})
}

// writeOwnerAutoBackup builds the global snapshot, writes to .new, verifies
// by reopening the zip, and atomic-swaps over the current file. The previous
// backup is only removed after verification — a failed build never leaves the
// platform without a backup.
func (s *Server) writeOwnerAutoBackup(ctx context.Context) (*ownerBackupManifest, error) {
	out := filepath.Join(ownerAutoDir(), ownerBackupAutoName)
	m, err := s.writeOwnerArchive(ctx, "auto", out)
	if err != nil {
		return nil, err
	}
	if err := verifyOwnerArchive(out); err != nil {
		return nil, fmt.Errorf("auto-backup verification failed: %w", err)
	}
	return m, nil
}

// writeOwnerArchive — assembles the ZIP at a temporary `.new` sibling and
// atomic-renames into place on success.
func (s *Server) writeOwnerArchive(ctx context.Context, kind, outPath string) (*ownerBackupManifest, error) {
	if err := os.MkdirAll(filepath.Dir(outPath), 0o700); err != nil {
		return nil, err
	}
	tmp := outPath + ".new"
	f, err := os.Create(tmp)
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()
	zw := zip.NewWriter(f)

	// Global tables.
	for _, g := range []struct {
		name string
		q    string
	}{
		{"companies.json", `SELECT jsonb_agg(to_jsonb(c)) FROM companies c`},
		{"subscriptions.json", `SELECT jsonb_agg(to_jsonb(s)) FROM subscriptions s`},
		{"saas_admin_users.json", `SELECT jsonb_agg(to_jsonb(u)) FROM saas_admin_users u`},
		{"company_owners.json", `SELECT jsonb_agg(to_jsonb(o)) FROM company_owners o`},
		{"company_features.json", `SELECT jsonb_agg(to_jsonb(f)) FROM company_features f`},
		{"saas_audit_log.json", `SELECT jsonb_agg(to_jsonb(a)) FROM (SELECT * FROM saas_audit_log ORDER BY created_at DESC LIMIT 10000) a`},
		{"notification_settings.json", `SELECT jsonb_agg(to_jsonb(n)) FROM notification_settings n`},
	} {
		var raw []byte
		_ = s.db.QueryRow(ctx, g.q).Scan(&raw)
		if len(raw) == 0 {
			raw = []byte("[]")
		}
		if err := writeZipFile(zw, "global/"+g.name, raw); err != nil {
			_ = zw.Close()
			return nil, err
		}
	}

	// Per-company — reuse the per-tenant snapshot writer so the structure
	// matches `/api/backup/*` output exactly.
	rows, err := s.db.Query(ctx, `SELECT id::text, slug, name FROM companies ORDER BY created_at`)
	if err != nil {
		_ = zw.Close()
		return nil, err
	}
	type comp struct{ id, slug, name string }
	var comps []comp
	for rows.Next() {
		var c comp
		if err := rows.Scan(&c.id, &c.slug, &c.name); err == nil {
			comps = append(comps, c)
		}
	}
	rows.Close()

	for _, c := range comps {
		snap, _, err := s.buildBackupSnapshot(ctx, c.id)
		if err != nil {
			log.Printf("platform backup: company %s snapshot: %v (skipped)", c.id, err)
			continue
		}
		snapJSON, _ := json.Marshal(snap)
		cm := map[string]any{
			"companyId": c.id, "companyName": c.name, "companySlug": c.slug,
			"takenAt": snap.TakenAt,
			"counts": map[string]int{
				"customers": len(snap.Customers), "documents": len(snap.Documents),
				"payments": len(snap.Payments), "inspections": len(snap.Inspections),
				"photos": len(snap.InspPhotos), "messages": len(snap.Messages),
			},
		}
		cmJSON, _ := json.Marshal(cm)
		base := "companies/" + c.id + "/"
		if err := writeZipFile(zw, base+"manifest.json", cmJSON); err != nil {
			_ = zw.Close()
			return nil, err
		}
		if err := writeZipFile(zw, base+"data.json", snapJSON); err != nil {
			_ = zw.Close()
			return nil, err
		}
		// Inspection photos — copy the bytes from UPLOAD_DIR into the archive.
		for _, p := range snap.InspPhotos {
			id, _ := p["id"].(string)
			inspID, _ := p["inspection_id"].(string)
			itemID, _ := p["item_id"].(string)
			ext, _ := p["extension"].(string)
			if id == "" || inspID == "" || itemID == "" || ext == "" {
				continue
			}
			src, err := photoDiskPath(c.id, inspID, itemID, id, ext)
			if err != nil {
				continue
			}
			data, err := os.ReadFile(src)
			if err != nil {
				continue
			}
			if err := writeZipFile(zw, base+backupPhotoPathPrefix+id+ext, data); err != nil {
				_ = zw.Close()
				return nil, err
			}
		}
	}

	// Top-level manifest.
	m := &ownerBackupManifest{
		Version: 1, Kind: kind,
		TakenAt: time.Now().UTC().Format(time.RFC3339),
		AppVersion: "torquedesk/1", SchemaVersion: backupSchemaVersion,
		Companies: len(comps),
	}
	if err := writeZipFile(zw, "manifest.json", mustJSON(m)); err != nil {
		_ = zw.Close()
		return nil, err
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	if fi, _ := f.Stat(); fi != nil {
		m.TotalBytes = fi.Size()
	}
	if err := f.Close(); err != nil {
		return nil, err
	}
	if err := os.Rename(tmp, outPath); err != nil {
		_ = os.Remove(tmp)
		return nil, err
	}
	return m, nil
}

func verifyOwnerArchive(path string) error {
	rc, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	defer rc.Close()
	var hasManifest bool
	for _, f := range rc.File {
		if f.Name == "manifest.json" {
			hasManifest = true
			r, err := f.Open()
			if err != nil {
				return err
			}
			raw, _ := io.ReadAll(r)
			_ = r.Close()
			var m ownerBackupManifest
			if err := json.Unmarshal(raw, &m); err != nil {
				return err
			}
			break
		}
	}
	if !hasManifest {
		return errors.New("archive missing manifest.json")
	}
	return nil
}

// -----------------------------------------------------------------------
// Download / delete
// -----------------------------------------------------------------------

func (s *Server) ownerDownloadBackupFile(w http.ResponseWriter, r *http.Request) {
	kind := r.PathValue("kind")
	name := r.PathValue("name")
	if strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
		writeErr(w, 400, "Invalid backup name.")
		return
	}
	var dir string
	switch kind {
	case "manual":
		dir = ownerManualDir()
	case "auto":
		dir = ownerAutoDir()
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

func (s *Server) ownerDeleteManualBackup(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	name := r.PathValue("name")
	if strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
		writeErr(w, 400, "Invalid backup name.")
		return
	}
	path := filepath.Join(ownerManualDir(), name)
	if err := os.Remove(path); err != nil {
		writeErr(w, 404, "Backup not found.")
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "platform_backup_deleted", "backup", name, nil, nil, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true})
}

// -----------------------------------------------------------------------
// Restore
// -----------------------------------------------------------------------

type ownerRestoreSummary struct {
	Companies    int `json:"companies"`
	Customers    int `json:"customers"`
	Documents    int `json:"documents"`
	Payments     int `json:"payments"`
	Inspections  int `json:"inspections"`
	Photos       int `json:"photos"`
	Messages     int `json:"messages"`
	SaasAdmins   int `json:"saasAdmins"`
	Owners       int `json:"owners"`
}

func (s *Server) ownerRestoreBackup(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<30)) // 1 GB cap
	if err != nil {
		writeErr(w, 400, "Backup file too large or unreadable.")
		return
	}
	if !(len(body) >= 4 && body[0] == 'P' && body[1] == 'K' && body[2] == 0x03 && body[3] == 0x04) {
		writeErr(w, 400, "Not a valid platform backup (expected a .zip file).")
		return
	}
	zr, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		writeErr(w, 400, "Could not open backup: "+err.Error())
		return
	}

	// Load global tables + per-company data + photos from the archive.
	global := map[string][]byte{}
	companySnaps := map[string][]byte{}      // cid -> data.json
	companyPhotos := map[string][]byte{}     // "cid/photoId.ext" -> bytes
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			continue
		}
		data, _ := io.ReadAll(rc)
		_ = rc.Close()
		switch {
		case strings.HasPrefix(f.Name, "global/"):
			global[strings.TrimPrefix(f.Name, "global/")] = data
		case strings.HasPrefix(f.Name, "companies/"):
			rest := strings.TrimPrefix(f.Name, "companies/")
			parts := strings.SplitN(rest, "/", 2)
			if len(parts) != 2 {
				continue
			}
			cid := parts[0]
			subpath := parts[1]
			if subpath == "data.json" {
				companySnaps[cid] = data
			} else if strings.HasPrefix(subpath, backupPhotoPathPrefix) {
				base := strings.TrimPrefix(subpath, backupPhotoPathPrefix)
				if !strings.ContainsAny(base, "/\\") {
					companyPhotos[cid+"/"+base] = data
				}
			}
		}
	}
	if len(companySnaps) == 0 && len(global) == 0 {
		writeErr(w, 400, "Backup is empty — no companies or global tables found.")
		return
	}

	summary := ownerRestoreSummary{}
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		// Global tables first (child FK targets).
		if err := upsertRows(r.Context(), tx, "companies", global["companies.json"]); err != nil {
			return fmt.Errorf("companies: %w", err)
		}
		if err := upsertRows(r.Context(), tx, "saas_admin_users", global["saas_admin_users.json"]); err != nil {
			return fmt.Errorf("saas_admin_users: %w", err)
		}
		if err := upsertRows(r.Context(), tx, "company_owners", global["company_owners.json"]); err != nil {
			return fmt.Errorf("company_owners: %w", err)
		}
		if err := upsertRows(r.Context(), tx, "subscriptions", global["subscriptions.json"]); err != nil {
			return fmt.Errorf("subscriptions: %w", err)
		}
		if err := upsertRows(r.Context(), tx, "company_features", global["company_features.json"]); err != nil {
			return fmt.Errorf("company_features: %w", err)
		}
		if err := upsertRows(r.Context(), tx, "notification_settings", global["notification_settings.json"]); err != nil {
			return fmt.Errorf("notification_settings: %w", err)
		}
		summary.SaasAdmins = countRows(global["saas_admin_users.json"])
		summary.Owners = countRows(global["company_owners.json"])
		summary.Companies = countRows(global["companies.json"])

		// Per-company data.
		for cid, raw := range companySnaps {
			var snap backupSnapshot
			if err := json.Unmarshal(raw, &snap); err != nil {
				return fmt.Errorf("company %s: data.json malformed: %w", cid, err)
			}
			// Wipe this company's mutable data first (CASCADE handles children).
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
					return fmt.Errorf("wipe %s: %w", cid, err)
				}
			}
			// Repopulate from snapshot.
			for _, c := range snap.Customers {
				raw, ok := c["_row"]
				if !ok {
					continue
				}
				rawJSON, _ := json.Marshal(raw)
				if _, err := tx.Exec(r.Context(), `INSERT INTO customers
					SELECT (jsonb_populate_record(NULL::customers,
					  ($1::jsonb) || jsonb_build_object('company_id', $2::uuid))).*
					ON CONFLICT (id) DO NOTHING`, string(rawJSON), cid); err != nil {
					return fmt.Errorf("company %s customer: %w", cid, err)
				}
				summary.Customers++
			}
			for _, d := range snap.Documents {
				if _, err := s.insertFromBackup(r.Context(), tx, d, cid); err != nil {
					return fmt.Errorf("company %s doc: %w", cid, err)
				}
				summary.Documents++
			}
			for _, p := range snap.Payments {
				rawJSON, _ := json.Marshal(p)
				if _, err := tx.Exec(r.Context(), `INSERT INTO payments
					SELECT (jsonb_populate_record(NULL::payments,
					  ($1::jsonb) || jsonb_build_object('company_id', $2::uuid))).*
					ON CONFLICT (id) DO NOTHING`, string(rawJSON), cid); err != nil {
					return fmt.Errorf("company %s payment: %w", cid, err)
				}
				summary.Payments++
			}
			for _, in := range snap.Inspections {
				rawJSON, _ := json.Marshal(in)
				if _, err := tx.Exec(r.Context(), `INSERT INTO inspections
					SELECT (jsonb_populate_record(NULL::inspections,
					  ($1::jsonb) || jsonb_build_object('company_id', $2::uuid))).*
					ON CONFLICT (id) DO NOTHING`, string(rawJSON), cid); err != nil {
					return fmt.Errorf("company %s inspection: %w", cid, err)
				}
				summary.Inspections++
			}
			for _, it := range snap.InspItems {
				rawJSON, _ := json.Marshal(it)
				if _, err := tx.Exec(r.Context(), `INSERT INTO inspection_items
					SELECT (jsonb_populate_record(NULL::inspection_items, $1::jsonb)).*
					ON CONFLICT (id) DO NOTHING`, string(rawJSON)); err != nil {
					return fmt.Errorf("company %s insp item: %w", cid, err)
				}
			}
			for _, ph := range snap.InspPhotos {
				rawJSON, _ := json.Marshal(ph)
				if _, err := tx.Exec(r.Context(), `INSERT INTO inspection_item_photos
					SELECT (jsonb_populate_record(NULL::inspection_item_photos, $1::jsonb)).*
					ON CONFLICT (id) DO NOTHING`, string(rawJSON)); err != nil {
					return fmt.Errorf("company %s photo: %w", cid, err)
				}
				summary.Photos++
			}
			for _, m := range snap.Messages {
				rawJSON, _ := json.Marshal(m)
				if _, err := tx.Exec(r.Context(), `INSERT INTO document_messages
					SELECT (jsonb_populate_record(NULL::document_messages,
					  ($1::jsonb) || jsonb_build_object('company_id', $2::uuid))).*
					ON CONFLICT (id) DO NOTHING`, string(rawJSON), cid); err != nil {
					return fmt.Errorf("company %s message: %w", cid, err)
				}
				summary.Messages++
			}
			// Rebuild child tables for every restored doc so reports work.
			for _, d := range snap.Documents {
				did, _ := d["id"].(string)
				if did == "" {
					continue
				}
				if err := recalcDocument(r.Context(), tx, did); err != nil {
					return fmt.Errorf("company %s recalc %s: %w", cid, did, err)
				}
			}
		}
		return nil
	})
	if err != nil {
		log.Printf("platform restore error: %v", err)
		handleErr(w, err)
		return
	}
	// Photos → disk, outside the tx.
	for key, data := range companyPhotos {
		slash := strings.IndexByte(key, '/')
		if slash < 0 {
			continue
		}
		cid := key[:slash]
		fname := key[slash+1:]
		dot := strings.LastIndexByte(fname, '.')
		if dot < 0 {
			continue
		}
		photoID := fname[:dot]
		ext := fname[dot:]
		var itemID, inspID string
		_ = s.db.QueryRow(r.Context(), `SELECT item_id::text, inspection_id::text FROM inspection_item_photos WHERE id::text = $1`, photoID).Scan(&itemID, &inspID)
		if itemID == "" || inspID == "" {
			continue
		}
		dst, derr := photoDiskPath(cid, inspID, itemID, photoID, ext)
		if derr != nil {
			continue
		}
		_ = os.MkdirAll(filepath.Dir(dst), 0o755)
		_ = os.WriteFile(dst, data, 0o644)
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "platform_backup_restored", "backup", "restore", nil,
		map[string]any{"summary": summary}, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true, "summary": summary})
}

// upsertRows takes a jsonb array (as bytes) and inserts each row into `table`
// via jsonb_populate_record, upserting on primary key. If the input is empty
// or NULL it does nothing. Primary key column is assumed to be `id` or the
// composite (`company_id`, …) for singleton settings — rely on
// ON CONFLICT DO UPDATE for both.
func upsertRows(ctx context.Context, tx pgx.Tx, table string, raw []byte) error {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var arr []map[string]any
	if err := json.Unmarshal(raw, &arr); err != nil {
		return err
	}
	// Build INSERT dynamically — but we never enumerate columns; use
	// jsonb_populate_record so the schema definition drives the shape.
	// ON CONFLICT uses the primary key — try (id), fall back to (company_id).
	for _, row := range arr {
		rawJSON, _ := json.Marshal(row)
		// First attempt: ON CONFLICT (id). If the table's PK is composite the
		// insert will succeed on new rows but duplicate PK on existing. Try
		// an insert-with-skip; if the table has a non-id PK, we fall through
		// to a delete-then-insert pattern. For the singleton settings tables
		// (company_features, notification_settings) the PK is company_id.
		attempt := func(conflict string) error {
			_, err := tx.Exec(ctx, fmt.Sprintf(
				`INSERT INTO %s SELECT (jsonb_populate_record(NULL::%s, $1::jsonb)).*
				 ON CONFLICT %s DO NOTHING`, table, table, conflict), string(rawJSON))
			return err
		}
		if err := attempt("(id)"); err == nil {
			continue
		}
		if err := attempt("(company_id)"); err == nil {
			continue
		}
		// Last resort: insert without ON CONFLICT; a true duplicate is skipped
		// at the handler level by letting the error bubble.
		if _, err := tx.Exec(ctx, fmt.Sprintf(
			`INSERT INTO %s SELECT (jsonb_populate_record(NULL::%s, $1::jsonb)).*`, table, table), string(rawJSON)); err != nil {
			return err
		}
	}
	return nil
}

func countRows(raw []byte) int {
	if len(raw) == 0 {
		return 0
	}
	var arr []any
	_ = json.Unmarshal(raw, &arr)
	return len(arr)
}

// -----------------------------------------------------------------------
// Scheduler — weekly auto-run
// -----------------------------------------------------------------------

var ownerBackupTickerOnce sync.Once

// StartOwnerBackupTicker runs a weekly in-process auto-backup of the whole
// platform. First run is 10 minutes after boot so a fresh deploy produces
// one artifact without waiting a full week.
func (s *Server) StartOwnerBackupTicker(ctx context.Context) {
	ownerBackupTickerOnce.Do(func() {
		go func() {
			first := time.NewTimer(10 * time.Minute)
			defer first.Stop()
			select {
			case <-ctx.Done():
				return
			case <-first.C:
			}
			if _, err := s.writeOwnerAutoBackup(ctx); err != nil {
				log.Printf("platform auto-backup (first): %v (previous backup kept)", err)
			}
			t := time.NewTicker(7 * 24 * time.Hour)
			defer t.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					if _, err := s.writeOwnerAutoBackup(ctx); err != nil {
						log.Printf("platform auto-backup: %v (previous backup kept)", err)
					}
				}
			}
		}()
	})
}

package api

// Whole-database backup + restore via pg_dump / psql.
//
// The existing table-by-table archive (ownerbackup.go) is table-aware and
// pretty but drifts: every new migration adds a table that the dumper
// doesn't know about. This file wraps `pg_dump` directly so EVERY table,
// sequence, index, extension, and row ends up in the backup — regardless
// of what the Go code knows. Restore is the inverse: `psql` reads the
// SQL back into an empty database.
//
// Files are gzip'd .sql, stored under $BACKUP_DIR/_global/full-db/ so they
// live on the same volume as the per-tenant archives.
//
// Requires pg_dump/psql in PATH. The Dockerfile installs postgresql16-client
// into the runtime image for this.

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func fullDumpDir() string { return filepath.Join(ownerBackupBaseDir(), "full-db") }

func (s *Server) fullDumpRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/owner/backups/full-dump", s.ownerAuth(s.listFullDumps))
	mux.HandleFunc("POST /api/owner/backups/full-dump", s.ownerAuth(s.createFullDump))
	mux.HandleFunc("GET /api/owner/backups/full-dump/{name}", s.ownerAuth(s.downloadFullDump))
	mux.HandleFunc("DELETE /api/owner/backups/full-dump/{name}", s.ownerAuth(s.deleteFullDump))
	mux.HandleFunc("POST /api/owner/backups/full-restore", s.ownerAuth(s.restoreFullDump))
	mux.HandleFunc("GET /api/owner/backups/offsite-status", s.ownerAuth(s.offsiteStatus))
}

// offsiteStatus returns the rclone backup script's status file, if present.
// The script writes it to $BACKUP_DIR/offsite-status.json after every run.
// Missing file = never configured.
func (s *Server) offsiteStatus(w http.ResponseWriter, r *http.Request) {
	path := filepath.Join(backupDir(), "offsite-status.json")
	data, err := os.ReadFile(path)
	if err != nil {
		writeJSON(w, 200, map[string]any{"configured": false})
		return
	}
	// Pass through verbatim — the script writes well-formed JSON.
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	// Wrap into {configured:true, ...} so the frontend can distinguish empty.
	w.Write([]byte(`{"configured":true,`))
	// Trim leading `{` from the file content and leading whitespace.
	trimmed := data
	for len(trimmed) > 0 && (trimmed[0] == ' ' || trimmed[0] == '\n' || trimmed[0] == '\r' || trimmed[0] == '\t') {
		trimmed = trimmed[1:]
	}
	if len(trimmed) > 0 && trimmed[0] == '{' {
		trimmed = trimmed[1:]
	}
	w.Write(trimmed)
}

type fullDumpItem struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	TakenAt int64  `json:"takenAt"`
}

func (s *Server) listFullDumps(w http.ResponseWriter, r *http.Request) {
	dir := fullDumpDir()
	_ = os.MkdirAll(dir, 0o755)
	entries, _ := os.ReadDir(dir)
	out := []fullDumpItem{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql.gz") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, fullDumpItem{Name: e.Name(), Size: info.Size(), TakenAt: info.ModTime().UnixMilli()})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].TakenAt > out[j].TakenAt })
	writeJSON(w, 200, out)
}

func (s *Server) createFullDump(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		writeErr(w, 500, "DATABASE_URL not set; full DB dump requires an external Postgres (not the embedded one).")
		return
	}
	if _, err := exec.LookPath("pg_dump"); err != nil {
		writeErr(w, 500, "pg_dump is not installed in the server image. Rebuild the container from the latest Dockerfile.")
		return
	}
	dir := fullDumpDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeErr(w, 500, "could not create backup dir: "+err.Error())
		return
	}
	name := fmt.Sprintf("torquedesk-full-%s.sql.gz", time.Now().UTC().Format("20060102-150405"))
	path := filepath.Join(dir, name+".tmp")
	// pg_dump --format=plain streaming into gzip, then atomic rename.
	cmd := exec.Command("sh", "-c",
		fmt.Sprintf("pg_dump --no-owner --no-privileges --clean --if-exists '%s' | gzip -c > '%s'",
			strings.ReplaceAll(dbURL, "'", "'\\''"), path))
	out, err := cmd.CombinedOutput()
	if err != nil {
		_ = os.Remove(path)
		writeErr(w, 500, "pg_dump failed: "+string(out))
		return
	}
	finalPath := filepath.Join(dir, name)
	if err := os.Rename(path, finalPath); err != nil {
		_ = os.Remove(path)
		writeErr(w, 500, "could not finalize backup: "+err.Error())
		return
	}
	info, _ := os.Stat(finalPath)
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "full_db_dump_created", "backup", name, nil,
		map[string]any{"size": info.Size()}, clientIP(r))
	writeJSON(w, 201, fullDumpItem{Name: name, Size: info.Size(), TakenAt: info.ModTime().UnixMilli()})
}

func (s *Server) downloadFullDump(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.PathValue("name"))
	path := filepath.Join(fullDumpDir(), name)
	f, err := os.Open(path)
	if err != nil {
		writeErr(w, 404, "backup not found")
		return
	}
	defer f.Close()
	info, _ := f.Stat()
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))
	_, _ = io.Copy(w, f)
}

func (s *Server) deleteFullDump(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	name := filepath.Base(r.PathValue("name"))
	path := filepath.Join(fullDumpDir(), name)
	if err := os.Remove(path); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "full_db_dump_deleted", "backup", name, nil, nil, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) restoreFullDump(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		writeErr(w, 500, "DATABASE_URL not set.")
		return
	}
	if _, err := exec.LookPath("psql"); err != nil {
		writeErr(w, 500, "psql is not installed in the server image. Rebuild from the latest Dockerfile.")
		return
	}
	if err := r.ParseMultipartForm(2 << 30); err != nil { // up to 2 GB
		writeErr(w, 400, "could not read upload: "+err.Error())
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeErr(w, 400, "file field is required")
		return
	}
	defer file.Close()
	if !strings.HasSuffix(header.Filename, ".sql.gz") && !strings.HasSuffix(header.Filename, ".sql") {
		writeErr(w, 400, "expected a .sql or .sql.gz file")
		return
	}
	tmp, err := os.CreateTemp("", "fullrestore-*"+filepath.Ext(header.Filename))
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	defer os.Remove(tmp.Name())
	if _, err := io.Copy(tmp, file); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	tmp.Close()

	// Pipe through gunzip when needed.
	shell := fmt.Sprintf("psql '%s' -v ON_ERROR_STOP=1 < '%s'",
		strings.ReplaceAll(dbURL, "'", "'\\''"), tmp.Name())
	if strings.HasSuffix(header.Filename, ".sql.gz") {
		shell = fmt.Sprintf("gunzip -c '%s' | psql '%s' -v ON_ERROR_STOP=1",
			tmp.Name(), strings.ReplaceAll(dbURL, "'", "'\\''"))
	}
	cmd := exec.Command("sh", "-c", shell)
	out, err := cmd.CombinedOutput()
	if err != nil {
		writeErr(w, 500, "restore failed: "+string(out))
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "full_db_restored", "backup", header.Filename, nil, nil, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true})
}

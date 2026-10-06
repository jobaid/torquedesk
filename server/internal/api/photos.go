package api

// Session D: photo attachments per inspection item.
//
// Files live on disk — one file per photo id. The DB only stores metadata.
// All reads/writes are tenant-scoped through the parent inspection; the
// public share endpoint re-validates the share token before serving.

import (
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	maxPhotoBytes = 15 * 1024 * 1024 // 15 MB per photo
	maxTotalBytes = 25 * 1024 * 1024 // multipart upper bound
)

var allowedPhotoTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/jpg":  ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/gif":  ".gif",
}

func photoBaseDir() string {
	if v := strings.TrimSpace(os.Getenv("UPLOAD_DIR")); v != "" {
		return v
	}
	return "./uploads"
}

func photoDiskPath(companyID, inspectionID, itemID, photoID, ext string) (string, error) {
	// Guard against any directory traversal. uuid strings only.
	for _, p := range []string{companyID, inspectionID, itemID, photoID} {
		if strings.ContainsAny(p, "/\\.:") || p == "" {
			return "", fmt.Errorf("invalid id in path")
		}
	}
	if strings.ContainsAny(ext, "/\\.:") || ext == "" {
		ext = ".bin"
	}
	dir := filepath.Join(photoBaseDir(), companyID, inspectionID, itemID)
	return filepath.Join(dir, photoID+ext), nil
}

func (s *Server) photoRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/inspections/{id}/items/{itemId}/photos", s.auth("documents.edit", s.uploadInspectionPhoto))
	mux.HandleFunc("DELETE /api/inspections/{id}/items/{itemId}/photos/{photoId}", s.auth("documents.edit", s.deleteInspectionPhoto))
	mux.HandleFunc("GET /api/inspections/{id}/photos/{photoId}", s.auth("", s.serveInspectionPhotoAuthed))
	// Public: served via the document share token.
	mux.HandleFunc("GET /api/public/share/{token}/photos/{photoId}", s.serveInspectionPhotoPublic)
}

// ----------------------------------------------------------- upload / delete

type photoDTO struct {
	ID          string `json:"id"`
	ContentType string `json:"contentType"`
	ByteSize    int64  `json:"byteSize"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	Position    int    `json:"position"`
	URL         string `json:"url"`
	CreatedAt   int64  `json:"createdAt"`
}

func (s *Server) uploadInspectionPhoto(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	u := userFrom(r.Context())
	inspID := r.PathValue("id")
	itemID := r.PathValue("itemId")

	// Scope: item must belong to this tenant's inspection.
	var belongs bool
	if err := s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM inspection_items it
		JOIN inspections i ON i.id = it.inspection_id
		WHERE it.id::text = $1 AND i.id::text = $2 AND i.company_id::text = $3)`,
		itemID, inspID, cid).Scan(&belongs); err != nil || !belongs {
		writeErr(w, 404, "Inspection item not found.")
		return
	}

	if err := r.ParseMultipartForm(maxTotalBytes); err != nil {
		writeErr(w, 400, "Could not parse upload.")
		return
	}
	file, header, err := r.FormFile("photo")
	if err != nil {
		writeErr(w, 400, "Attach a file named 'photo'.")
		return
	}
	defer file.Close()
	if header.Size > maxPhotoBytes {
		writeErr(w, 413, fmt.Sprintf("Photo is too large. Max %d MB.", maxPhotoBytes/1024/1024))
		return
	}
	contentType := header.Header.Get("Content-Type")
	ext, ok := allowedPhotoTypes[contentType]
	if !ok {
		writeErr(w, 400, "Only JPEG, PNG, WebP or GIF images are allowed.")
		return
	}

	// Read into memory (bounded by maxPhotoBytes) so we can decode dimensions
	// and write to disk atomically.
	buf, err := io.ReadAll(io.LimitReader(file, maxPhotoBytes+1))
	if err != nil {
		writeErr(w, 500, "Could not read file.")
		return
	}
	if int64(len(buf)) > maxPhotoBytes {
		writeErr(w, 413, "Photo exceeded the size limit.")
		return
	}

	width, height := 0, 0
	if cfg, _, err := image.DecodeConfig(bytesReader(buf)); err == nil {
		width, height = cfg.Width, cfg.Height
	}

	// Determine the next position.
	var nextPos int
	_ = s.db.QueryRow(r.Context(), `SELECT coalesce(max(position),-1)+1 FROM inspection_item_photos WHERE item_id::text = $1`, itemID).Scan(&nextPos)

	var photoID string
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		if err := tx.QueryRow(r.Context(), `INSERT INTO inspection_item_photos
			(item_id, inspection_id, content_type, byte_size, width, height, position, uploaded_by, extension)
			VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9) RETURNING id::text`,
			itemID, inspID, contentType, int64(len(buf)), width, height, nextPos, u.Name, ext).Scan(&photoID); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		handleErr(w, err)
		return
	}

	// Write the file. Clean up the DB row if the disk write fails to avoid
	// an orphaned record.
	path, err := photoDiskPath(cid, inspID, itemID, photoID, ext)
	if err != nil {
		_, _ = s.db.Exec(r.Context(), `DELETE FROM inspection_item_photos WHERE id::text = $1`, photoID)
		writeErr(w, 500, "Could not determine upload path.")
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		_, _ = s.db.Exec(r.Context(), `DELETE FROM inspection_item_photos WHERE id::text = $1`, photoID)
		writeErr(w, 500, "Could not create upload directory.")
		return
	}
	if err := os.WriteFile(path, buf, 0o644); err != nil {
		_, _ = s.db.Exec(r.Context(), `DELETE FROM inspection_item_photos WHERE id::text = $1`, photoID)
		writeErr(w, 500, "Could not save file.")
		return
	}

	writeJSON(w, 201, photoDTO{
		ID: photoID, ContentType: contentType, ByteSize: int64(len(buf)),
		Width: width, Height: height, Position: nextPos,
		URL:       "/api/inspections/" + inspID + "/photos/" + photoID,
		CreatedAt: time.Now().UnixMilli(),
	})
}

func (s *Server) deleteInspectionPhoto(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	inspID := r.PathValue("id")
	itemID := r.PathValue("itemId")
	photoID := r.PathValue("photoId")

	// Tenant scope through parent inspection.
	var ext string
	err := s.db.QueryRow(r.Context(), `SELECT p.extension FROM inspection_item_photos p
		JOIN inspections i ON i.id = p.inspection_id
		WHERE p.id::text = $1 AND p.item_id::text = $2 AND p.inspection_id::text = $3 AND i.company_id::text = $4`,
		photoID, itemID, inspID, cid).Scan(&ext)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, 404, "Photo not found.")
		return
	}
	if err != nil {
		handleErr(w, err)
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM inspection_item_photos WHERE id::text = $1`, photoID); err != nil {
		handleErr(w, err)
		return
	}
	if path, err := photoDiskPath(cid, inspID, itemID, photoID, ext); err == nil {
		_ = os.Remove(path)
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ----------------------------------------------------------- serve (authed)

func (s *Server) serveInspectionPhotoAuthed(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	inspID := r.PathValue("id")
	photoID := r.PathValue("photoId")
	s.servePhotoScoped(w, r, cid, inspID, photoID)
}

// ----------------------------------------------------------- serve (public)

func (s *Server) serveInspectionPhotoPublic(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	photoID := r.PathValue("photoId")

	// Resolve token → document → company.
	var docID, cid string
	err := s.db.QueryRow(r.Context(), `SELECT document_id::text, company_id::text
		FROM document_share_tokens WHERE token = $1 AND revoked_at IS NULL`, tok).Scan(&docID, &cid)
	if err != nil {
		writeErr(w, 404, "Not found.")
		return
	}
	// The photo must belong to the inspection paired with this document (same
	// pairing rule as the public share view). Explicitly linked wins; else
	// customer+vehicle match.
	var inspID string
	err = s.db.QueryRow(r.Context(), `WITH d AS (
			SELECT coalesce(customer_id::text,'') AS cust, vehicle_id FROM documents WHERE id::text = $1 AND company_id::text = $2
		)
		SELECT i.id::text FROM inspections i, d
		WHERE i.company_id::text = $2 AND i.status = 'completed'
		  AND (i.document_id::text = $1
		       OR (d.cust <> '' AND i.customer_id::text = d.cust AND i.vehicle_id = d.vehicle_id))
		ORDER BY (CASE WHEN i.document_id::text = $1 THEN 0 ELSE 1 END), i.updated_at DESC
		LIMIT 1`, docID, cid).Scan(&inspID)
	if err != nil {
		writeErr(w, 404, "Not found.")
		return
	}
	// Confirm the photo belongs to that inspection.
	s.servePhotoScoped(w, r, cid, inspID, photoID)
}

func (s *Server) servePhotoScoped(w http.ResponseWriter, r *http.Request, cid, inspID, photoID string) {
	var itemID, contentType, ext string
	var byteSize int64
	err := s.db.QueryRow(r.Context(), `SELECT p.item_id::text, p.content_type, p.extension, p.byte_size
		FROM inspection_item_photos p
		JOIN inspections i ON i.id = p.inspection_id
		WHERE p.id::text = $1 AND i.id::text = $2 AND i.company_id::text = $3`,
		photoID, inspID, cid).Scan(&itemID, &contentType, &ext, &byteSize)
	if err != nil {
		writeErr(w, 404, "Not found.")
		return
	}
	path, err := photoDiskPath(cid, inspID, itemID, photoID, ext)
	if err != nil {
		writeErr(w, 404, "Not found.")
		return
	}
	f, err := os.Open(path)
	if err != nil {
		writeErr(w, 404, "Not found.")
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		writeErr(w, 500, "Could not read file.")
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", fmt.Sprint(st.Size()))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, filepath.Base(path), st.ModTime(), f)
}

// bytesReader avoids pulling in bytes just for a NewReader wrapper.
type sliceReader struct {
	b []byte
	i int
}

func bytesReader(b []byte) *sliceReader { return &sliceReader{b: b} }
func (r *sliceReader) Read(p []byte) (int, error) {
	if r.i >= len(r.b) {
		return 0, io.EOF
	}
	n := copy(p, r.b[r.i:])
	r.i += n
	return n, nil
}

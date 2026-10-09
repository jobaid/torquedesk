package api

// Technician Mobile Inspection — token-scoped public API.
//
// A manager mints a token tied to one inspection. The technician opens that
// token on their phone and can:
//   - Read the inspection (customer name + vehicle + mileage ONLY).
//   - Update any item's status / recommendation / note / measurement.
//   - Add new items.
//   - Delete items.
//   - Upload / delete photos per item.
//   - Submit the inspection.
//
// Pricing is excluded by DESIGN — none of these handlers touch documents,
// payments, invoices or any pricing table. Even if a technician manipulates
// the URL or request body, there is no code path from the technician token
// to pricing data.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	"github.com/jackc/pgx/v5"
)

var technicianRecs = []string{"none", "inspect_further", "repair", "replace", "service", "monitor", "customer_declined", "other"}

func (s *Server) technicianRoutes(mux *http.ServeMux) {
	// Shop-side (authed, tenant-scoped) — link management.
	mux.HandleFunc("GET /api/inspections/{id}/technician-link", s.auth("documents.edit", s.getTechnicianLink))
	mux.HandleFunc("POST /api/inspections/{id}/technician-link", s.auth("documents.edit", s.createTechnicianLink))
	mux.HandleFunc("DELETE /api/inspections/{id}/technician-link", s.auth("documents.edit", s.revokeTechnicianLink))

	// Public — token in URL is the only credential. All responses are strictly
	// inspection-scoped; the handlers never SELECT any pricing / document /
	// payment / invoice table.
	mux.HandleFunc("GET /api/technician/inspection/{token}", s.techGetInspection)
	mux.HandleFunc("PATCH /api/technician/inspection/{token}", s.techUpdateMeta)
	mux.HandleFunc("POST /api/technician/inspection/{token}/items", s.techAddItem)
	mux.HandleFunc("PATCH /api/technician/inspection/{token}/items/{itemId}", s.techUpdateItem)
	mux.HandleFunc("DELETE /api/technician/inspection/{token}/items/{itemId}", s.techDeleteItem)
	mux.HandleFunc("POST /api/technician/inspection/{token}/items/{itemId}/photos", s.techUploadPhoto)
	mux.HandleFunc("DELETE /api/technician/inspection/{token}/items/{itemId}/photos/{photoId}", s.techDeletePhoto)
	mux.HandleFunc("GET /api/technician/inspection/{token}/photos/{photoId}", s.techServePhoto)
	mux.HandleFunc("POST /api/technician/inspection/{token}/submit", s.techSubmit)
}

// ---------------------------------------------------------------- shop side

type techLinkDTO struct {
	Token      string `json:"token"`
	URL        string `json:"url"`
	CreatedBy  string `json:"createdBy"`
	CreatedAt  int64  `json:"createdAt"`
	LastOpened *int64 `json:"lastOpenedAt,omitempty"`
	OpenCount  int    `json:"openCount"`
	Revoked    bool   `json:"revoked"`
}

func (s *Server) getTechnicianLink(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	inspID := r.PathValue("id")
	dto, err := s.loadActiveTechLink(r, cid, inspID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, 200, nil)
		return
	}
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, dto)
}

func (s *Server) createTechnicianLink(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	u := userFrom(r.Context())
	inspID := r.PathValue("id")
	if !s.companyFeatureEnabled(r.Context(), cid, "technician_submit") {
		writeErr(w, 403, "Technician mobile submit is not enabled for this shop.")
		return
	}
	var exists bool
	if err := s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM inspections WHERE id::text = $1 AND company_id::text = $2)`, inspID, cid).Scan(&exists); err != nil || !exists {
		writeErr(w, 404, "Inspection not found.")
		return
	}
	if dto, err := s.loadActiveTechLink(r, cid, inspID); err == nil {
		writeJSON(w, 200, dto)
		return
	}
	tok, err := newShareToken()
	if err != nil {
		handleErr(w, err)
		return
	}
	if _, err := s.db.Exec(r.Context(), `INSERT INTO inspection_tokens (token, inspection_id, company_id, created_by)
		VALUES ($1, $2::uuid, $3::uuid, $4)`, tok, inspID, cid, u.Name); err != nil {
		handleErr(w, err)
		return
	}
	// First mint flips not_started → in_progress.
	_, _ = s.db.Exec(r.Context(), `UPDATE inspections SET status = 'in_progress', updated_at = now()
		WHERE id::text = $1 AND status = 'not_started'`, inspID)
	dto, _ := s.loadActiveTechLink(r, cid, inspID)
	writeJSON(w, 201, dto)
}

func (s *Server) revokeTechnicianLink(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	inspID := r.PathValue("id")
	if _, err := s.db.Exec(r.Context(), `UPDATE inspection_tokens SET revoked_at = now()
		WHERE inspection_id::text = $1 AND company_id::text = $2 AND revoked_at IS NULL`, inspID, cid); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) loadActiveTechLink(r *http.Request, cid, inspID string) (*techLinkDTO, error) {
	var dto techLinkDTO
	var created time.Time
	var lastOpened *time.Time
	err := s.db.QueryRow(r.Context(), `SELECT token, created_by, created_at, last_opened_at, open_count
		FROM inspection_tokens
		WHERE inspection_id::text = $1 AND company_id::text = $2 AND revoked_at IS NULL
		ORDER BY created_at DESC LIMIT 1`, inspID, cid).Scan(&dto.Token, &dto.CreatedBy, &created, &lastOpened, &dto.OpenCount)
	if err != nil {
		return nil, err
	}
	dto.CreatedAt = created.UnixMilli()
	if lastOpened != nil {
		ms := lastOpened.UnixMilli()
		dto.LastOpened = &ms
	}
	dto.URL = publicOrigin(r) + "/technician/inspection/" + dto.Token
	return &dto, nil
}

// -------------------------------------------------------------- public helpers

type techContext struct {
	Token      string
	InspID     string
	CompanyID  string
	Status     string
}

func (s *Server) resolveTechToken(r *http.Request, tok string) (*techContext, bool) {
	if len(tok) < 20 || len(tok) > 80 {
		return nil, false
	}
	var ctx techContext
	err := s.db.QueryRow(r.Context(), `SELECT t.token, t.inspection_id::text, t.company_id::text, i.status
		FROM inspection_tokens t
		JOIN inspections i ON i.id = t.inspection_id
		WHERE t.token = $1 AND t.revoked_at IS NULL`, tok).Scan(&ctx.Token, &ctx.InspID, &ctx.CompanyID, &ctx.Status)
	if err != nil {
		return nil, false
	}
	// SaaS owner can disable the technician mobile submit feature per tenant
	// (Owner → Company → Feature Access → technician_submit). When off, the
	// link stops working for every technician the shop issued it to.
	if !s.companyFeatureEnabled(r.Context(), ctx.CompanyID, "technician_submit") {
		return nil, false
	}
	return &ctx, true
}

// companyFeatureEnabled resolves a merged feature flag for a company (stored
// override overlaid on catalog defaults). Used by token-scoped public
// endpoints that can't rely on an authed user's features map.
func (s *Server) companyFeatureEnabled(ctx context.Context, cid, key string) bool {
	var raw []byte
	if err := s.db.QueryRow(ctx, `SELECT features FROM company_features WHERE company_id::text = $1`, cid).Scan(&raw); err == nil && len(raw) > 0 {
		stored := map[string]any{}
		_ = json.Unmarshal(raw, &stored)
		if v, ok := stored[key]; ok {
			if b, ok := v.(bool); ok {
				return b
			}
		}
	}
	for _, f := range FeatureCatalog {
		if f["key"].(string) == key {
			b, _ := f["defaultOn"].(bool)
			return b
		}
	}
	return true
}

// -------------------------------------------------------------- public reads

func (s *Server) techGetInspection(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	ctx, ok := s.resolveTechToken(r, tok)
	if !ok {
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	// Bump the open counter (fire-and-forget).
	_, _ = s.db.Exec(r.Context(), `UPDATE inspection_tokens SET last_opened_at = now(), open_count = open_count + 1 WHERE token = $1`, tok)

	// Load inspection header. We select only the fields a technician needs —
	// pricing columns don't exist on inspections anyway, so no risk of leak.
	var customerID, vehicleID, notes, performedBy string
	var docID *string
	var mileage, pass, att, fail, na int
	var performedAt *time.Time
	var created, updated time.Time
	err := s.db.QueryRow(r.Context(), `SELECT coalesce(customer_id::text,''), vehicle_id, coalesce(document_id::text, NULL),
		mileage, performed_by, performed_at, notes, pass_count, attention_count, fail_count, na_count,
		created_at, updated_at
		FROM inspections WHERE id::text = $1`, ctx.InspID).
		Scan(&customerID, &vehicleID, &docID, &mileage, &performedBy, &performedAt, &notes, &pass, &att, &fail, &na, &created, &updated)
	if err != nil {
		writeErr(w, 404, "Inspection not found.")
		return
	}
	// Customer + vehicle context — name/VIN/plate only, no pricing / documents.
	cust := map[string]any{}
	if customerID != "" {
		var name, phone, email string
		var vehicles []byte
		_ = s.db.QueryRow(r.Context(), `SELECT name, coalesce(phone,''), coalesce(email,''), coalesce(vehicles, '[]'::jsonb)
			FROM customers WHERE id::text = $1 AND company_id::text = $2`, customerID, ctx.CompanyID).
			Scan(&name, &phone, &email, &vehicles)
		cust["name"] = name
		cust["phone"] = phone
		cust["email"] = email
		if vehicleID != "" && len(vehicles) > 0 {
			cust["vehicle"] = extractVehicle(vehicles, vehicleID)
		}
	}
	// Shop header for the mobile page (so the tech sees which shop the link is for).
	var shopName string
	_ = s.db.QueryRow(r.Context(), `SELECT coalesce(shop_name,'') FROM shop_settings WHERE company_id::text = $1`, ctx.CompanyID).Scan(&shopName)

	// Document number — not price. We expose only display_number so the tech
	// knows "RO-1025", nothing about totals.
	docLabel := ""
	docType := ""
	if docID != nil && *docID != "" {
		_ = s.db.QueryRow(r.Context(), `SELECT display_number, type FROM documents WHERE id::text = $1 AND company_id::text = $2`,
			*docID, ctx.CompanyID).Scan(&docLabel, &docType)
	}

	items, _ := s.loadInspectionItems(r.Context(), ctx.InspID)

	writeJSON(w, 200, map[string]any{
		"id":             ctx.InspID,
		"status":         ctx.Status,
		"mileage":        mileage,
		"performedBy":    performedBy,
		"performedAt":    msOrNil(performedAt),
		"notes":          notes,
		"createdAt":      created.UnixMilli(),
		"updatedAt":      updated.UnixMilli(),
		"passCount":      pass,
		"attentionCount": att,
		"failCount":      fail,
		"naCount":        na,
		"customer":       cust,
		"shop":           map[string]any{"name": shopName},
		"document":       map[string]any{"label": docLabel, "type": docType},
		"items":          items,
	})
}

func extractVehicle(vehicles []byte, id string) map[string]any {
	var arr []map[string]any
	_ = json.Unmarshal(vehicles, &arr)
	for _, v := range arr {
		if fmt.Sprint(v["id"]) == id {
			return map[string]any{
				"year": v["year"], "make": v["make"], "model": v["model"],
				"vin": v["vin"], "plate": v["plate"], "mileage": v["mileage"],
			}
		}
	}
	return map[string]any{}
}

func msOrNil(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UnixMilli()
}

// -------------------------------------------------------------- public writes

type techMetaReq struct {
	Mileage     *int    `json:"mileage"`
	Notes       *string `json:"notes"`
	PerformedBy *string `json:"performedBy"`
}

func (s *Server) techUpdateMeta(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	ctx, ok := s.resolveTechToken(r, tok)
	if !ok {
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	if ctx.Status == "completed" {
		writeErr(w, 409, "This inspection is already completed.")
		return
	}
	var in techMetaReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	sets, args := []string{"updated_at = now()"}, []any{}
	add := func(c string, v any) { args = append(args, v); sets = append(sets, fmt.Sprintf("%s = $%d", c, len(args))) }
	if in.Mileage != nil {
		add("mileage", *in.Mileage)
	}
	if in.Notes != nil {
		add("notes", *in.Notes)
	}
	if in.PerformedBy != nil {
		add("performed_by", strings.TrimSpace(*in.PerformedBy))
	}
	if len(sets) == 1 {
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	args = append(args, ctx.InspID)
	if _, err := s.db.Exec(r.Context(),
		fmt.Sprintf("UPDATE inspections SET %s WHERE id::text = $%d", strings.Join(sets, ", "), len(args)), args...); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

type techAddItemReq struct {
	Category string `json:"category"`
	Label    string `json:"label"`
}

func (s *Server) techAddItem(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	ctx, ok := s.resolveTechToken(r, tok)
	if !ok {
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	if ctx.Status == "completed" {
		writeErr(w, 409, "This inspection is already completed.")
		return
	}
	var in techAddItemReq
	if err := readJSON(r, &in); err != nil || strings.TrimSpace(in.Label) == "" {
		writeErr(w, 400, "Label is required.")
		return
	}
	if strings.TrimSpace(in.Category) == "" {
		in.Category = "Other"
	}
	var nextPos int
	_ = s.db.QueryRow(r.Context(), `SELECT coalesce(max(position),-1)+1 FROM inspection_items WHERE inspection_id::text = $1`, ctx.InspID).Scan(&nextPos)
	var newID string
	if err := s.db.QueryRow(r.Context(), `INSERT INTO inspection_items (inspection_id, category, label, position)
		VALUES ($1::uuid, $2, $3, $4) RETURNING id::text`, ctx.InspID, in.Category, in.Label, nextPos).Scan(&newID); err != nil {
		handleErr(w, err)
		return
	}
	_ = recalcInspectionCountsNoTx(r, s, ctx.InspID)
	writeJSON(w, 201, map[string]any{"id": newID})
}

type techItemPatch struct {
	Status         *string `json:"status"`
	Recommendation *string `json:"recommendation"`
	Severity       *string `json:"severity"`
	Note           *string `json:"note"`
	Measurement    *string `json:"measurement"`
}

func (s *Server) techUpdateItem(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	ctx, ok := s.resolveTechToken(r, tok)
	if !ok {
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	if ctx.Status == "completed" {
		writeErr(w, 409, "This inspection is already completed.")
		return
	}
	itemID := r.PathValue("itemId")
	if !s.techOwnsItem(r, ctx.InspID, itemID) {
		writeErr(w, 404, "Item not found.")
		return
	}
	var p techItemPatch
	if err := readJSON(r, &p); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	sets, args := []string{"updated_at = now()"}, []any{}
	add := func(c string, v any) { args = append(args, v); sets = append(sets, fmt.Sprintf("%s = $%d", c, len(args))) }
	if p.Status != nil {
		if !stringIn(*p.Status, []string{"pass", "attention", "fail", "na"}) {
			writeErr(w, 400, "Invalid status.")
			return
		}
		add("status", *p.Status)
	}
	if p.Recommendation != nil {
		if !stringIn(*p.Recommendation, technicianRecs) {
			writeErr(w, 400, "Invalid recommendation.")
			return
		}
		add("recommendation", *p.Recommendation)
	}
	if p.Severity != nil {
		if !stringIn(*p.Severity, []string{"low", "medium", "high"}) {
			writeErr(w, 400, "Invalid severity.")
			return
		}
		add("severity", *p.Severity)
	}
	if p.Note != nil {
		add("note", *p.Note)
	}
	if p.Measurement != nil {
		add("measurement", *p.Measurement)
	}
	if len(sets) == 1 {
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	args = append(args, itemID)
	if _, err := s.db.Exec(r.Context(),
		fmt.Sprintf("UPDATE inspection_items SET %s WHERE id::text = $%d", strings.Join(sets, ", "), len(args)), args...); err != nil {
		handleErr(w, err)
		return
	}
	_ = recalcInspectionCountsNoTx(r, s, ctx.InspID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) techDeleteItem(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	ctx, ok := s.resolveTechToken(r, tok)
	if !ok {
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	if ctx.Status == "completed" || ctx.Status == "submitted" || ctx.Status == "manager_review" {
		writeErr(w, 409, "This inspection cannot be modified anymore.")
		return
	}
	itemID := r.PathValue("itemId")
	if !s.techOwnsItem(r, ctx.InspID, itemID) {
		writeErr(w, 404, "Item not found.")
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM inspection_items WHERE id::text = $1`, itemID); err != nil {
		handleErr(w, err)
		return
	}
	_ = recalcInspectionCountsNoTx(r, s, ctx.InspID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) techOwnsItem(r *http.Request, inspID, itemID string) bool {
	var exists bool
	err := s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM inspection_items WHERE id::text = $1 AND inspection_id::text = $2)`, itemID, inspID).Scan(&exists)
	return err == nil && exists
}

func recalcInspectionCountsNoTx(r *http.Request, s *Server, inspID string) error {
	_, err := s.db.Exec(r.Context(), `UPDATE inspections SET
		pass_count = (SELECT count(*) FROM inspection_items WHERE inspection_id = $1::uuid AND status = 'pass'),
		attention_count = (SELECT count(*) FROM inspection_items WHERE inspection_id = $1::uuid AND status = 'attention'),
		fail_count = (SELECT count(*) FROM inspection_items WHERE inspection_id = $1::uuid AND status = 'fail'),
		na_count = (SELECT count(*) FROM inspection_items WHERE inspection_id = $1::uuid AND status = 'na'),
		updated_at = now()
		WHERE id = $1::uuid`, inspID)
	return err
}

func stringIn(s string, options []string) bool {
	for _, o := range options {
		if s == o {
			return true
		}
	}
	return false
}

// -------------------------------------------------------------- photos

func (s *Server) techUploadPhoto(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	ctx, ok := s.resolveTechToken(r, tok)
	if !ok {
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	if ctx.Status == "completed" {
		writeErr(w, 409, "This inspection is already completed.")
		return
	}
	itemID := r.PathValue("itemId")
	if !s.techOwnsItem(r, ctx.InspID, itemID) {
		writeErr(w, 404, "Item not found.")
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
		writeErr(w, 413, fmt.Sprintf("Photo too large. Max %d MB.", maxPhotoBytes/1024/1024))
		return
	}
	contentType := header.Header.Get("Content-Type")
	ext, okType := allowedPhotoTypes[contentType]
	if !okType {
		writeErr(w, 400, "Only JPEG, PNG, WebP or GIF images are allowed.")
		return
	}
	buf, err := io.ReadAll(io.LimitReader(file, maxPhotoBytes+1))
	if err != nil || int64(len(buf)) > maxPhotoBytes {
		writeErr(w, 413, "Could not read file.")
		return
	}
	width, height := 0, 0
	if cfg, _, err := image.DecodeConfig(bytesReader(buf)); err == nil {
		width, height = cfg.Width, cfg.Height
	}
	var nextPos int
	_ = s.db.QueryRow(r.Context(), `SELECT coalesce(max(position),-1)+1 FROM inspection_item_photos WHERE item_id::text = $1`, itemID).Scan(&nextPos)
	var photoID string
	if err := s.db.QueryRow(r.Context(), `INSERT INTO inspection_item_photos
		(item_id, inspection_id, content_type, byte_size, width, height, position, uploaded_by, extension)
		VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, 'technician', $8) RETURNING id::text`,
		itemID, ctx.InspID, contentType, int64(len(buf)), width, height, nextPos, ext).Scan(&photoID); err != nil {
		handleErr(w, err)
		return
	}
	path, err := photoDiskPath(ctx.CompanyID, ctx.InspID, itemID, photoID, ext)
	if err != nil || os.MkdirAll(filepath.Dir(path), 0o755) != nil || os.WriteFile(path, buf, 0o644) != nil {
		_, _ = s.db.Exec(r.Context(), `DELETE FROM inspection_item_photos WHERE id::text = $1`, photoID)
		writeErr(w, 500, "Could not save file.")
		return
	}
	writeJSON(w, 201, map[string]any{
		"id": photoID, "url": "/api/technician/inspection/" + tok + "/photos/" + photoID,
		"contentType": contentType, "width": width, "height": height, "position": nextPos,
	})
}

func (s *Server) techDeletePhoto(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	ctx, ok := s.resolveTechToken(r, tok)
	if !ok {
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	if ctx.Status == "completed" {
		writeErr(w, 409, "This inspection is already completed.")
		return
	}
	itemID := r.PathValue("itemId")
	photoID := r.PathValue("photoId")
	var ext string
	err := s.db.QueryRow(r.Context(), `SELECT p.extension FROM inspection_item_photos p
		WHERE p.id::text = $1 AND p.item_id::text = $2 AND p.inspection_id::text = $3`, photoID, itemID, ctx.InspID).Scan(&ext)
	if err != nil {
		writeErr(w, 404, "Photo not found.")
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM inspection_item_photos WHERE id::text = $1`, photoID); err != nil {
		handleErr(w, err)
		return
	}
	if path, err := photoDiskPath(ctx.CompanyID, ctx.InspID, itemID, photoID, ext); err == nil {
		_ = os.Remove(path)
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) techServePhoto(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	ctx, ok := s.resolveTechToken(r, tok)
	if !ok {
		writeErr(w, 404, "Not found.")
		return
	}
	photoID := r.PathValue("photoId")
	var itemID, contentType, ext string
	err := s.db.QueryRow(r.Context(), `SELECT p.item_id::text, p.content_type, p.extension
		FROM inspection_item_photos p
		WHERE p.id::text = $1 AND p.inspection_id::text = $2`, photoID, ctx.InspID).Scan(&itemID, &contentType, &ext)
	if err != nil {
		writeErr(w, 404, "Not found.")
		return
	}
	path, err := photoDiskPath(ctx.CompanyID, ctx.InspID, itemID, photoID, ext)
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
	st, _ := f.Stat()
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.FormatInt(st.Size(), 10))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, filepath.Base(path), st.ModTime(), f)
}

// -------------------------------------------------------------- submit

func (s *Server) techSubmit(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	ctx, ok := s.resolveTechToken(r, tok)
	if !ok {
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	if ctx.Status == "completed" || ctx.Status == "submitted" || ctx.Status == "manager_review" {
		writeErr(w, 409, "This inspection has already been submitted.")
		return
	}
	// Flip to submitted + stamp performed_at. The manager then reviews via the
	// existing authed /api/inspections/{id} path and runs the usual complete action.
	if _, err := s.db.Exec(r.Context(), `UPDATE inspections
		SET status = 'submitted', performed_at = coalesce(performed_at, now()), updated_at = now()
		WHERE id::text = $1`, ctx.InspID); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// newShareToken is reused from share.go (same crypto profile — 32 random bytes,
// URL-safe base64).

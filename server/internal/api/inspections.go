package api

// Session A of Vehicle Inspection: tenant-scoped CRUD for DVI-style
// multi-point inspections. Starting an inspection seeds a default DVI
// template (categories + items) so the technician gets a working checklist
// immediately. Later sessions add photo upload (D), public share-link
// visibility (B) and combined PDF output (C).
//
// Permissions: documents.edit for all writes; any authenticated user may read
// (same model as the payments module — a technician needs to see the
// inspection to work from it).

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var inspectionStatuses = []string{"in_progress", "completed", "cancelled"}
var itemStatuses = []string{"pass", "attention", "fail", "na"}
var itemSeverities = []string{"low", "medium", "high"}

func (s *Server) inspectionRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/inspections", s.auth("", s.listInspections))
	mux.HandleFunc("POST /api/inspections", s.auth("documents.edit", s.createInspection))
	mux.HandleFunc("GET /api/inspections/{id}", s.auth("", s.getInspection))
	mux.HandleFunc("PATCH /api/inspections/{id}", s.auth("documents.edit", s.updateInspection))
	mux.HandleFunc("DELETE /api/inspections/{id}", s.auth("documents.delete", s.deleteInspection))
	mux.HandleFunc("PATCH /api/inspections/{id}/items/{itemId}", s.auth("documents.edit", s.updateInspectionItem))
	mux.HandleFunc("POST /api/inspections/{id}/complete", s.auth("documents.edit", s.completeInspection))
}

// -----------------------------------------------------------------------
// Default DVI template — 8 categories × ~4-6 items. Non-OEM, generic
// multi-point inspection common to the aftermarket shop industry. Session A
// seeds this on every new inspection; later sessions will let shops edit
// their own template.
// -----------------------------------------------------------------------

type templateItem struct {
	Category string
	Label    string
}

var defaultDVITemplate = []templateItem{
	// Under hood
	{"Under Hood", "Engine oil level and condition"},
	{"Under Hood", "Coolant level and condition"},
	{"Under Hood", "Brake fluid level"},
	{"Under Hood", "Power steering fluid"},
	{"Under Hood", "Washer fluid"},
	{"Under Hood", "Air filter"},
	{"Under Hood", "Drive belts and hoses"},
	{"Under Hood", "Battery condition and terminals"},
	// Lights & wipers
	{"Lights & Wipers", "Headlights (low beam)"},
	{"Lights & Wipers", "Headlights (high beam)"},
	{"Lights & Wipers", "Turn signals (front and rear)"},
	{"Lights & Wipers", "Brake lights"},
	{"Lights & Wipers", "License plate light"},
	{"Lights & Wipers", "Wiper blades (front and rear)"},
	// Tires
	{"Tires", "Front left tread depth"},
	{"Tires", "Front right tread depth"},
	{"Tires", "Rear left tread depth"},
	{"Tires", "Rear right tread depth"},
	{"Tires", "Tire pressure (all four)"},
	{"Tires", "Spare tire condition"},
	// Brakes
	{"Brakes", "Front brake pad thickness"},
	{"Brakes", "Rear brake pad thickness"},
	{"Brakes", "Front rotor condition"},
	{"Brakes", "Rear rotor / drum condition"},
	{"Brakes", "Brake hoses and lines"},
	{"Brakes", "Parking brake operation"},
	// Suspension & steering
	{"Suspension & Steering", "Front shocks / struts"},
	{"Suspension & Steering", "Rear shocks / struts"},
	{"Suspension & Steering", "Ball joints and tie rods"},
	{"Suspension & Steering", "CV axles and boots"},
	{"Suspension & Steering", "Steering rack / linkage"},
	// Exhaust & drivetrain
	{"Exhaust & Drivetrain", "Exhaust system (leaks, mounts)"},
	{"Exhaust & Drivetrain", "Transmission fluid level and condition"},
	{"Exhaust & Drivetrain", "Differential / transfer case (if applicable)"},
	{"Exhaust & Drivetrain", "Engine and transmission mounts"},
	// Interior
	{"Interior", "Horn operation"},
	{"Interior", "Dash warning lights"},
	{"Interior", "Air conditioning operation"},
	{"Interior", "Heater and defrost operation"},
	{"Interior", "Seat belts"},
	// Body & safety
	{"Body & Safety", "Windshield (cracks, chips)"},
	{"Body & Safety", "Mirrors (interior and exterior)"},
	{"Body & Safety", "Vehicle registration lights"},
	{"Body & Safety", "Bumpers / body damage noted"},
}

// -----------------------------------------------------------------------
// scanning / DTOs
// -----------------------------------------------------------------------

const inspectionCols = `id::text, coalesce(customer_id::text, ''), vehicle_id,
	coalesce(document_id::text, ''), status, mileage,
	performed_by, performed_at, notes,
	pass_count, attention_count, fail_count, na_count,
	created_at, updated_at`

type inspectionDTO struct {
	ID             string           `json:"id"`
	CustomerID     string           `json:"customerId"`
	VehicleID      string           `json:"vehicleId"`
	DocumentID     string           `json:"documentId"`
	Status         string           `json:"status"`
	Mileage        int              `json:"mileage"`
	PerformedBy    string           `json:"performedBy"`
	PerformedAt    *int64           `json:"performedAt"`
	Notes          string           `json:"notes"`
	PassCount      int              `json:"passCount"`
	AttentionCount int              `json:"attentionCount"`
	FailCount      int              `json:"failCount"`
	NACount        int              `json:"naCount"`
	CreatedAt      int64            `json:"createdAt"`
	UpdatedAt      int64            `json:"updatedAt"`
	Items          []inspectionItem `json:"items,omitempty"`
}

type inspectionItem struct {
	ID          string `json:"id"`
	Category    string `json:"category"`
	Label       string `json:"label"`
	Status      string `json:"status"`
	Severity    string `json:"severity"`
	Note        string `json:"note"`
	Measurement string `json:"measurement"`
	Position    int    `json:"position"`
}

func scanInspection(row pgx.Row) (inspectionDTO, error) {
	var dto inspectionDTO
	var performedAt *time.Time
	var created, updated time.Time
	err := row.Scan(&dto.ID, &dto.CustomerID, &dto.VehicleID, &dto.DocumentID,
		&dto.Status, &dto.Mileage, &dto.PerformedBy, &performedAt, &dto.Notes,
		&dto.PassCount, &dto.AttentionCount, &dto.FailCount, &dto.NACount,
		&created, &updated)
	if err != nil {
		return dto, err
	}
	if performedAt != nil {
		ms := performedAt.UnixMilli()
		dto.PerformedAt = &ms
	}
	dto.CreatedAt = created.UnixMilli()
	dto.UpdatedAt = updated.UnixMilli()
	return dto, nil
}

func scanInspectionItem(row pgx.Row) (inspectionItem, error) {
	var it inspectionItem
	var created, updated time.Time
	err := row.Scan(&it.ID, &it.Category, &it.Label, &it.Status, &it.Severity, &it.Note, &it.Measurement, &it.Position, &created, &updated)
	return it, err
}

// -----------------------------------------------------------------------
// list / get
// -----------------------------------------------------------------------

func (s *Server) listInspections(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	q := r.URL.Query()
	where := []string{"company_id::text = $1"}
	args := []any{cid}
	add := func(sql string, v any) { args = append(args, v); where = append(where, fmt.Sprintf(sql, len(args))) }
	if v := q.Get("customerId"); v != "" {
		add("customer_id::text = $%d", v)
	}
	if v := q.Get("vehicleId"); v != "" {
		add("vehicle_id = $%d", v)
	}
	if v := q.Get("documentId"); v != "" {
		add("document_id::text = $%d", v)
	}
	if v := q.Get("status"); v != "" {
		add("status = $%d", v)
	}
	limit := 100
	if n, err := strconv.Atoi(q.Get("limit")); err == nil && n > 0 && n <= 500 {
		limit = n
	}
	args = append(args, limit)
	rows, err := s.db.Query(r.Context(), `SELECT `+inspectionCols+` FROM inspections
		WHERE `+strings.Join(where, " AND ")+` ORDER BY updated_at DESC LIMIT $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []inspectionDTO{}
	for rows.Next() {
		dto, err := scanInspection(rows)
		if err != nil {
			handleErr(w, err)
			return
		}
		out = append(out, dto)
	}
	writeJSON(w, 200, out)
}

func (s *Server) getInspection(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	id := r.PathValue("id")
	dto, err := scanInspection(s.db.QueryRow(r.Context(), `SELECT `+inspectionCols+` FROM inspections
		WHERE id::text = $1 AND company_id::text = $2`, id, cid))
	if err != nil {
		handleErr(w, err)
		return
	}
	items, err := s.loadInspectionItems(r.Context(), id)
	if err != nil {
		handleErr(w, err)
		return
	}
	dto.Items = items
	writeJSON(w, 200, dto)
}

func (s *Server) loadInspectionItems(ctx context.Context, inspectionID string) ([]inspectionItem, error) {
	rows, err := s.db.Query(ctx, `SELECT id::text, category, label, status, severity, note, measurement, position, created_at, updated_at
		FROM inspection_items WHERE inspection_id::text = $1 ORDER BY position, created_at`, inspectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []inspectionItem{}
	for rows.Next() {
		it, err := scanInspectionItem(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, nil
}

// -----------------------------------------------------------------------
// create: seeds the default DVI template so the tech has a working checklist
// -----------------------------------------------------------------------

type inspectionCreateReq struct {
	CustomerID  string `json:"customerId"`
	VehicleID   string `json:"vehicleId"`
	DocumentID  string `json:"documentId"`
	Mileage     int    `json:"mileage"`
	PerformedBy string `json:"performedBy"`
	Notes       string `json:"notes"`
}

func (s *Server) createInspection(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	u := userFrom(r.Context())
	var in inspectionCreateReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	// If a document was passed, verify it belongs to this tenant to prevent
	// cross-tenant document association.
	if in.DocumentID != "" {
		var exists bool
		if err := s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM documents WHERE id::text = $1 AND company_id::text = $2)`, in.DocumentID, cid).Scan(&exists); err != nil || !exists {
			writeErr(w, 404, "Document not found.")
			return
		}
	}
	// Same for customer.
	if in.CustomerID != "" {
		var exists bool
		if err := s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM customers WHERE id::text = $1 AND company_id::text = $2)`, in.CustomerID, cid).Scan(&exists); err != nil || !exists {
			writeErr(w, 404, "Customer not found.")
			return
		}
	}
	if in.PerformedBy == "" {
		in.PerformedBy = u.Name
	}

	var newID string
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		var custArg, docArg any
		if in.CustomerID != "" {
			custArg = in.CustomerID
		}
		if in.DocumentID != "" {
			docArg = in.DocumentID
		}
		if err := tx.QueryRow(r.Context(), `INSERT INTO inspections
			(company_id, customer_id, vehicle_id, document_id, mileage, performed_by, notes, na_count)
			VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8) RETURNING id::text`,
			cid, custArg, in.VehicleID, docArg, in.Mileage, in.PerformedBy, in.Notes, len(defaultDVITemplate)).Scan(&newID); err != nil {
			return err
		}
		// Seed template items in position order.
		for i, t := range defaultDVITemplate {
			if _, err := tx.Exec(r.Context(), `INSERT INTO inspection_items (inspection_id, category, label, position)
				VALUES ($1::uuid, $2, $3, $4)`, newID, t.Category, t.Label, i); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	// Return fully populated row.
	dto, err := scanInspection(s.db.QueryRow(r.Context(), `SELECT `+inspectionCols+` FROM inspections WHERE id::text = $1`, newID))
	if err != nil {
		handleErr(w, err)
		return
	}
	items, _ := s.loadInspectionItems(r.Context(), newID)
	dto.Items = items
	writeJSON(w, 201, dto)
}

// -----------------------------------------------------------------------
// update / delete inspection
// -----------------------------------------------------------------------

type inspectionPatch struct {
	Mileage     *int    `json:"mileage"`
	PerformedBy *string `json:"performedBy"`
	Notes       *string `json:"notes"`
	DocumentID  *string `json:"documentId"`
	Status      *string `json:"status"`
}

func (s *Server) updateInspection(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	id := r.PathValue("id")
	var p inspectionPatch
	if err := readJSON(r, &p); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	sets, args := []string{"updated_at = now()"}, []any{}
	add := func(col string, v any) { args = append(args, v); sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args))) }
	if p.Mileage != nil {
		add("mileage", *p.Mileage)
	}
	if p.PerformedBy != nil {
		add("performed_by", strings.TrimSpace(*p.PerformedBy))
	}
	if p.Notes != nil {
		add("notes", *p.Notes)
	}
	if p.DocumentID != nil {
		if *p.DocumentID == "" {
			add("document_id", nil)
		} else {
			var exists bool
			if err := s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM documents WHERE id::text = $1 AND company_id::text = $2)`, *p.DocumentID, cid).Scan(&exists); err != nil || !exists {
				writeErr(w, 404, "Document not found.")
				return
			}
			add("document_id", *p.DocumentID)
		}
	}
	if p.Status != nil {
		found := false
		for _, s := range inspectionStatuses {
			if s == *p.Status {
				found = true
				break
			}
		}
		if !found {
			writeErr(w, 400, "Invalid status.")
			return
		}
		add("status", *p.Status)
	}
	if len(sets) == 1 {
		writeErr(w, 400, "Nothing to update.")
		return
	}
	args = append(args, id, cid)
	ct, err := s.db.Exec(r.Context(),
		fmt.Sprintf("UPDATE inspections SET %s WHERE id::text = $%d AND company_id::text = $%d", strings.Join(sets, ", "), len(args)-1, len(args)),
		args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	if ct.RowsAffected() == 0 {
		writeErr(w, 404, "Inspection not found.")
		return
	}
	s.getInspection(w, r)
}

func (s *Server) deleteInspection(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	id := r.PathValue("id")
	ct, err := s.db.Exec(r.Context(), `DELETE FROM inspections WHERE id::text = $1 AND company_id::text = $2`, id, cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	if ct.RowsAffected() == 0 {
		writeErr(w, 404, "Inspection not found.")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// -----------------------------------------------------------------------
// per-item update + rollup recalc
// -----------------------------------------------------------------------

type inspectionItemPatch struct {
	Status      *string `json:"status"`
	Severity    *string `json:"severity"`
	Note        *string `json:"note"`
	Measurement *string `json:"measurement"`
}

func (s *Server) updateInspectionItem(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	inspID := r.PathValue("id")
	itemID := r.PathValue("itemId")
	var p inspectionItemPatch
	if err := readJSON(r, &p); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	sets, args := []string{"updated_at = now()"}, []any{}
	add := func(col string, v any) { args = append(args, v); sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args))) }
	if p.Status != nil {
		found := false
		for _, s := range itemStatuses {
			if s == *p.Status {
				found = true
				break
			}
		}
		if !found {
			writeErr(w, 400, "Invalid status.")
			return
		}
		add("status", *p.Status)
	}
	if p.Severity != nil {
		found := false
		for _, s := range itemSeverities {
			if s == *p.Severity {
				found = true
				break
			}
		}
		if !found {
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
		writeErr(w, 400, "Nothing to update.")
		return
	}
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		// Scope the item to this tenant via the parent inspection, so one
		// tenant cannot modify another tenant's item id even if guessed.
		var belongs bool
		if err := tx.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM inspection_items it
			JOIN inspections i ON i.id = it.inspection_id
			WHERE it.id::text = $1 AND i.id::text = $2 AND i.company_id::text = $3)`,
			itemID, inspID, cid).Scan(&belongs); err != nil {
			return err
		}
		if !belongs {
			return errStatus(404, "Inspection item not found.")
		}
		argsFinal := append(args, itemID)
		if _, err := tx.Exec(r.Context(),
			fmt.Sprintf("UPDATE inspection_items SET %s WHERE id::text = $%d", strings.Join(sets, ", "), len(argsFinal)),
			argsFinal...); err != nil {
			return err
		}
		return recalcInspectionCounts(r.Context(), tx, inspID)
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	s.getInspection(w, r)
}

func recalcInspectionCounts(ctx context.Context, tx pgx.Tx, inspID string) error {
	_, err := tx.Exec(ctx, `UPDATE inspections SET
		pass_count = (SELECT count(*) FROM inspection_items WHERE inspection_id = $1::uuid AND status = 'pass'),
		attention_count = (SELECT count(*) FROM inspection_items WHERE inspection_id = $1::uuid AND status = 'attention'),
		fail_count = (SELECT count(*) FROM inspection_items WHERE inspection_id = $1::uuid AND status = 'fail'),
		na_count = (SELECT count(*) FROM inspection_items WHERE inspection_id = $1::uuid AND status = 'na'),
		updated_at = now()
		WHERE id = $1::uuid`, inspID)
	return err
}

// -----------------------------------------------------------------------
// complete: freezes the inspection with timestamp + performed_by
// -----------------------------------------------------------------------

func (s *Server) completeInspection(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	u := userFrom(r.Context())
	id := r.PathValue("id")
	ct, err := s.db.Exec(r.Context(), `UPDATE inspections
		SET status = 'completed', performed_at = now(), performed_by = CASE WHEN performed_by = '' THEN $3 ELSE performed_by END, updated_at = now()
		WHERE id::text = $1 AND company_id::text = $2 AND status <> 'cancelled'`, id, cid, u.Name)
	if err != nil {
		handleErr(w, err)
		return
	}
	if ct.RowsAffected() == 0 {
		writeErr(w, 404, "Inspection not found.")
		return
	}
	s.getInspection(w, r)
}

// errorsIs lets us gate pgx.ErrNoRows without importing errors in every spot.
var _ = errors.Is

// Compile-time hint that json is used (will be used by follow-up sessions for photos).
var _ = json.Unmarshal

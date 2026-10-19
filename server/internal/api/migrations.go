package api

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ----------------------------------------------------------------------------
// Data Migration Tool (SaaS owner only)
//
// Lets the owner import a CSV export from another shop-management app
// (Shop-Ware, Tekmetric, Mitchell 1, RO Writer, Shopmonkey, or a custom CSV)
// into a target company's customers table (with vehicles embedded as JSONB).
//
// Flow: upload (POST) -> headers come back -> owner picks/edits column
// mapping (PATCH) -> dry-run (POST /dry-run) -> commit (POST /commit).
// ----------------------------------------------------------------------------

const migrationMaxBytes = 20 << 20 // 20 MB CSV cap

// Our canonical field names for the "customers" entity. Mapping is
// {ourField: sourceHeader}.
var customerFields = []string{
	"name", "phone", "email", "address", "notes",
	"vehicle_year", "vehicle_make", "vehicle_model", "vehicle_vin",
	"vehicle_license_plate", "vehicle_mileage", "vehicle_trim",
}

// Preset per-vendor header guesses, keyed by our field.
// Values are source-header candidates (lowercased). First hit wins.
var vendorPresets = map[string]map[string][]string{
	"shopware": {
		"name":                  {"customer name", "name", "first name"},
		"phone":                 {"phone", "primary phone", "mobile"},
		"email":                 {"email"},
		"address":               {"address", "street"},
		"notes":                 {"notes", "memo"},
		"vehicle_year":          {"year", "vehicle year"},
		"vehicle_make":          {"make", "vehicle make"},
		"vehicle_model":         {"model", "vehicle model"},
		"vehicle_vin":           {"vin"},
		"vehicle_license_plate": {"license", "plate", "license plate"},
		"vehicle_mileage":       {"mileage", "odometer"},
		"vehicle_trim":          {"trim"},
	},
	"tekmetric": {
		"name":                  {"customer name", "name"},
		"phone":                 {"phone", "cell phone"},
		"email":                 {"email"},
		"address":               {"address"},
		"notes":                 {"notes"},
		"vehicle_year":          {"vehicle year", "year"},
		"vehicle_make":          {"vehicle make", "make"},
		"vehicle_model":         {"vehicle model", "model"},
		"vehicle_vin":           {"vin"},
		"vehicle_license_plate": {"license plate", "plate"},
		"vehicle_mileage":       {"vehicle mileage", "mileage"},
	},
	"mitchell1": {
		"name":                  {"full name", "name"},
		"phone":                 {"primary phone", "phone"},
		"email":                 {"email", "e-mail"},
		"address":               {"street", "address"},
		"notes":                 {"comments", "notes"},
		"vehicle_year":          {"year"},
		"vehicle_make":          {"make"},
		"vehicle_model":         {"model"},
		"vehicle_vin":           {"vin"},
		"vehicle_license_plate": {"plate", "tag"},
		"vehicle_mileage":       {"mileage"},
	},
	"rowriter": {
		"name":                  {"customer", "name"},
		"phone":                 {"phone"},
		"email":                 {"email"},
		"address":               {"address"},
		"vehicle_year":          {"year"},
		"vehicle_make":          {"make"},
		"vehicle_model":         {"model"},
		"vehicle_vin":           {"vin"},
		"vehicle_license_plate": {"license"},
	},
	"shopmonkey": {
		"name":                  {"customer name", "name"},
		"phone":                 {"phone"},
		"email":                 {"email"},
		"address":               {"address"},
		"vehicle_year":          {"year"},
		"vehicle_make":          {"make"},
		"vehicle_model":         {"model"},
		"vehicle_vin":           {"vin"},
		"vehicle_license_plate": {"plate"},
		"vehicle_mileage":       {"mileage"},
	},
}

func (s *Server) migrationRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/owner/migrations/presets", s.ownerAuth(s.migrationPresets))
	mux.HandleFunc("GET /api/owner/migrations", s.ownerAuth(s.migrationList))
	mux.HandleFunc("POST /api/owner/migrations", s.ownerAuth(s.migrationCreate))
	mux.HandleFunc("GET /api/owner/migrations/{id}", s.ownerAuth(s.migrationGet))
	mux.HandleFunc("PATCH /api/owner/migrations/{id}", s.ownerAuth(s.migrationUpdateMapping))
	mux.HandleFunc("POST /api/owner/migrations/{id}/dry-run", s.ownerAuth(s.migrationDryRun))
	mux.HandleFunc("POST /api/owner/migrations/{id}/commit", s.ownerAuth(s.migrationCommit))
	mux.HandleFunc("DELETE /api/owner/migrations/{id}", s.ownerAuth(s.migrationDelete))
}

// ---- Presets listing (vendors + target fields) ----------------------------

func (s *Server) migrationPresets(w http.ResponseWriter, r *http.Request) {
	vendors := []map[string]any{}
	for key, prs := range vendorPresets {
		vendors = append(vendors, map[string]any{"key": key, "label": vendorLabel(key), "preset": prs})
	}
	vendors = append(vendors, map[string]any{"key": "custom", "label": "Custom CSV", "preset": map[string][]string{}})
	writeJSON(w, 200, map[string]any{
		"entities": []string{"customers"},
		"fields":   customerFields,
		"vendors":  vendors,
	})
}

func vendorLabel(k string) string {
	switch k {
	case "shopware":
		return "Shop-Ware"
	case "tekmetric":
		return "Tekmetric"
	case "mitchell1":
		return "Mitchell 1"
	case "rowriter":
		return "R.O. Writer"
	case "shopmonkey":
		return "Shopmonkey"
	}
	return k
}

// ---- List jobs -----------------------------------------------------------

func (s *Server) migrationList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `
		SELECT j.id, j.company_id, c.name AS company_name, j.entity, j.source_vendor, j.status,
		       j.file_name, j.row_count, j.imported_count, j.skipped_count,
		       j.error_message, j.created_at, j.updated_at
		  FROM data_migration_jobs j
		  JOIN companies c ON c.id = j.company_id
		 ORDER BY j.created_at DESC
		 LIMIT 100`)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, companyID, companyName, entity, vendor, status, fileName, errMsg string
		var rowCount, imported, skipped int
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &companyID, &companyName, &entity, &vendor, &status,
			&fileName, &rowCount, &imported, &skipped, &errMsg, &createdAt, &updatedAt); err != nil {
			handleErr(w, err)
			return
		}
		out = append(out, map[string]any{
			"id": id, "company_id": companyID, "company_name": companyName,
			"entity": entity, "source_vendor": vendor, "status": status,
			"file_name": fileName, "row_count": rowCount,
			"imported_count": imported, "skipped_count": skipped,
			"error": errMsg, "created_at": createdAt, "updated_at": updatedAt,
		})
	}
	writeJSON(w, 200, out)
}

// ---- Create job (multipart upload) --------------------------------------

func (s *Server) migrationCreate(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, migrationMaxBytes+1<<20)
	if err := r.ParseMultipartForm(migrationMaxBytes + 1<<20); err != nil {
		writeErr(w, 400, "Upload too large or malformed.")
		return
	}
	companyID := strings.TrimSpace(r.FormValue("company_id"))
	entity := strings.TrimSpace(r.FormValue("entity"))
	vendor := strings.TrimSpace(r.FormValue("source_vendor"))
	if companyID == "" || entity == "" {
		writeErr(w, 400, "company_id and entity are required.")
		return
	}
	if entity != "customers" {
		writeErr(w, 400, "Only the 'customers' entity is supported in Phase 1.")
		return
	}
	if vendor == "" {
		vendor = "custom"
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		writeErr(w, 400, "CSV file is required.")
		return
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, migrationMaxBytes))
	if err != nil {
		writeErr(w, 400, "Failed to read CSV.")
		return
	}
	headers, rowCount, err := peekCSV(raw)
	if err != nil {
		writeErr(w, 400, "CSV parse error: "+err.Error())
		return
	}
	// Auto-map using preset if we have one for this vendor.
	mapping := map[string]string{}
	if preset, ok := vendorPresets[vendor]; ok {
		mapping = applyPreset(preset, headers)
	}
	mappingJSON, _ := json.Marshal(mapping)
	headersPG := "{" + strings.Join(quoteAll(headers), ",") + "}"

	var id string
	err = s.db.QueryRow(r.Context(), `
		INSERT INTO data_migration_jobs
		  (company_id, entity, source_vendor, status, file_name, csv_bytes, csv_headers, row_count, mapping)
		VALUES ($1,$2,$3,'draft',$4,$5,$6::text[],$7,$8::jsonb)
		RETURNING id`,
		companyID, entity, vendor, hdr.Filename, raw, headersPG, rowCount, mappingJSON).Scan(&id)
	if err != nil {
		handleErr(w, err)
		return
	}
	s.migrationGetByID(w, r, id)
}

// ---- Get job -------------------------------------------------------------

func (s *Server) migrationGet(w http.ResponseWriter, r *http.Request) {
	s.migrationGetByID(w, r, r.PathValue("id"))
}

func (s *Server) migrationGetByID(w http.ResponseWriter, r *http.Request, id string) {
	var companyID, companyName, entity, vendor, status, fileName, errMsg string
	var rowCount, imported, skipped int
	var createdAt, updatedAt time.Time
	var headers []string
	var mappingJSON, dryJSON, commitJSON []byte
	err := s.db.QueryRow(r.Context(), `
		SELECT j.company_id, c.name, j.entity, j.source_vendor, j.status, j.file_name,
		       j.csv_headers, j.row_count, j.mapping, j.dry_run_report, j.commit_report,
		       j.imported_count, j.skipped_count, j.error_message, j.created_at, j.updated_at
		  FROM data_migration_jobs j JOIN companies c ON c.id=j.company_id
		 WHERE j.id=$1`, id).Scan(
		&companyID, &companyName, &entity, &vendor, &status, &fileName,
		&headers, &rowCount, &mappingJSON, &dryJSON, &commitJSON,
		&imported, &skipped, &errMsg, &createdAt, &updatedAt)
	if err != nil {
		handleErr(w, err)
		return
	}
	var mapping, dry, commit any
	_ = json.Unmarshal(mappingJSON, &mapping)
	_ = json.Unmarshal(dryJSON, &dry)
	_ = json.Unmarshal(commitJSON, &commit)
	preview, _ := previewCSV(r.Context(), s, id, 10)
	writeJSON(w, 200, map[string]any{
		"id": id, "company_id": companyID, "company_name": companyName,
		"entity": entity, "source_vendor": vendor, "status": status,
		"file_name": fileName, "csv_headers": headers, "row_count": rowCount,
		"mapping": mapping, "dry_run_report": dry, "commit_report": commit,
		"imported_count": imported, "skipped_count": skipped,
		"error": errMsg, "created_at": createdAt, "updated_at": updatedAt,
		"preview": preview,
	})
}

// ---- Update mapping -------------------------------------------------------

func (s *Server) migrationUpdateMapping(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		Mapping map[string]string `json:"mapping"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, 400, "Invalid JSON.")
		return
	}
	mappingJSON, _ := json.Marshal(body.Mapping)
	_, err := s.db.Exec(r.Context(),
		`UPDATE data_migration_jobs SET mapping=$2::jsonb, status='mapped', updated_at=now() WHERE id=$1`,
		id, mappingJSON)
	if err != nil {
		handleErr(w, err)
		return
	}
	s.migrationGetByID(w, r, id)
}

// ---- Dry run ------------------------------------------------------------

func (s *Server) migrationDryRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	raw, mapping, err := loadJobCSV(r.Context(), s, id)
	if err != nil {
		handleErr(w, err)
		return
	}
	report := validateCustomerRows(raw, mapping)
	status := "dry_run_ok"
	if report["invalid"].(int) > 0 && report["valid"].(int) == 0 {
		status = "dry_run_failed"
	}
	reportJSON, _ := json.Marshal(report)
	_, err = s.db.Exec(r.Context(),
		`UPDATE data_migration_jobs SET dry_run_report=$2::jsonb, status=$3, updated_at=now() WHERE id=$1`,
		id, reportJSON, status)
	if err != nil {
		handleErr(w, err)
		return
	}
	s.migrationGetByID(w, r, id)
}

// ---- Commit -------------------------------------------------------------

func (s *Server) migrationCommit(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var companyID string
	raw, mapping, err := loadJobCSVWithCompany(r.Context(), s, id, &companyID)
	if err != nil {
		handleErr(w, err)
		return
	}
	imported, skipped, errs := importCustomerRows(r.Context(), s, companyID, raw, mapping)
	report := map[string]any{"imported": imported, "skipped": skipped, "errors": errs}
	reportJSON, _ := json.Marshal(report)
	status := "completed"
	if len(errs) > 0 && imported == 0 {
		status = "failed"
	}
	_, err = s.db.Exec(r.Context(), `
		UPDATE data_migration_jobs
		   SET commit_report=$2::jsonb, status=$3, imported_count=$4, skipped_count=$5,
		       csv_bytes=NULL, updated_at=now()
		 WHERE id=$1`,
		id, reportJSON, status, imported, skipped)
	if err != nil {
		handleErr(w, err)
		return
	}
	s.migrationGetByID(w, r, id)
}

// ---- Delete -------------------------------------------------------------

func (s *Server) migrationDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.db.Exec(r.Context(), `DELETE FROM data_migration_jobs WHERE id=$1`, id); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// ============================================================================
// CSV helpers
// ============================================================================

func peekCSV(raw []byte) ([]string, int, error) {
	r := csv.NewReader(strings.NewReader(string(raw)))
	r.FieldsPerRecord = -1
	headers, err := r.Read()
	if err != nil {
		return nil, 0, err
	}
	for i := range headers {
		headers[i] = strings.TrimSpace(headers[i])
	}
	count := 0
	for {
		if _, err := r.Read(); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return headers, count, nil
		}
		count++
	}
	return headers, count, nil
}

func previewCSV(ctx context.Context, s *Server, id string, n int) ([]map[string]string, error) {
	var raw []byte
	var headers []string
	if err := s.db.QueryRow(ctx,
		`SELECT csv_bytes, csv_headers FROM data_migration_jobs WHERE id=$1`,
		id).Scan(&raw, &headers); err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return nil, nil
	}
	r := csv.NewReader(strings.NewReader(string(raw)))
	r.FieldsPerRecord = -1
	if _, err := r.Read(); err != nil {
		return nil, err
	}
	out := []map[string]string{}
	for i := 0; i < n; i++ {
		row, err := r.Read()
		if err != nil {
			break
		}
		m := map[string]string{}
		for j, h := range headers {
			if j < len(row) {
				m[h] = row[j]
			}
		}
		out = append(out, m)
	}
	return out, nil
}

func loadJobCSV(ctx context.Context, s *Server, id string) ([]byte, map[string]string, error) {
	var raw []byte
	var mappingJSON []byte
	err := s.db.QueryRow(ctx,
		`SELECT csv_bytes, mapping FROM data_migration_jobs WHERE id=$1`, id).Scan(&raw, &mappingJSON)
	if err != nil {
		return nil, nil, err
	}
	if raw == nil || len(raw) == 0 {
		return nil, nil, errors.New("CSV already purged for this job")
	}
	mapping := map[string]string{}
	_ = json.Unmarshal(mappingJSON, &mapping)
	return raw, mapping, nil
}

func loadJobCSVWithCompany(ctx context.Context, s *Server, id string, companyID *string) ([]byte, map[string]string, error) {
	var raw []byte
	var mappingJSON []byte
	err := s.db.QueryRow(ctx,
		`SELECT csv_bytes, mapping, company_id FROM data_migration_jobs WHERE id=$1`, id).Scan(&raw, &mappingJSON, companyID)
	if err != nil {
		return nil, nil, err
	}
	if raw == nil || len(raw) == 0 {
		return nil, nil, errors.New("CSV already purged for this job")
	}
	mapping := map[string]string{}
	_ = json.Unmarshal(mappingJSON, &mapping)
	return raw, mapping, nil
}

func applyPreset(preset map[string][]string, headers []string) map[string]string {
	out := map[string]string{}
	lower := map[string]string{}
	for _, h := range headers {
		lower[strings.ToLower(strings.TrimSpace(h))] = h
	}
	for field, candidates := range preset {
		for _, c := range candidates {
			if orig, ok := lower[strings.ToLower(c)]; ok {
				out[field] = orig
				break
			}
		}
	}
	return out
}

func quoteAll(ss []string) []string {
	out := make([]string, len(ss))
	for i, s := range ss {
		out[i] = `"` + strings.ReplaceAll(s, `"`, `\"`) + `"`
	}
	return out
}

// ============================================================================
// Customer importer
// ============================================================================

type customerRow struct {
	line int
	name string
	data map[string]string
}

func parseCustomerRows(raw []byte, mapping map[string]string) []customerRow {
	r := csv.NewReader(strings.NewReader(string(raw)))
	r.FieldsPerRecord = -1
	headers, _ := r.Read()
	idx := map[string]int{}
	for i, h := range headers {
		idx[h] = i
	}
	rows := []customerRow{}
	line := 1
	for {
		rec, err := r.Read()
		if err != nil {
			break
		}
		line++
		get := func(field string) string {
			col, ok := mapping[field]
			if !ok {
				return ""
			}
			i, ok := idx[col]
			if !ok || i >= len(rec) {
				return ""
			}
			return strings.TrimSpace(rec[i])
		}
		data := map[string]string{}
		for _, f := range customerFields {
			data[f] = get(f)
		}
		rows = append(rows, customerRow{line: line, name: data["name"], data: data})
	}
	return rows
}

func validateCustomerRows(raw []byte, mapping map[string]string) map[string]any {
	rows := parseCustomerRows(raw, mapping)
	valid, invalid := 0, 0
	sample := []map[string]any{}
	issues := []map[string]any{}
	for _, row := range rows {
		if row.name == "" {
			invalid++
			if len(issues) < 20 {
				issues = append(issues, map[string]any{"line": row.line, "reason": "missing name"})
			}
			continue
		}
		valid++
		if len(sample) < 5 {
			sample = append(sample, map[string]any{"line": row.line, "data": row.data})
		}
	}
	return map[string]any{
		"total":   len(rows),
		"valid":   valid,
		"invalid": invalid,
		"issues":  issues,
		"sample":  sample,
	}
}

func importCustomerRows(ctx context.Context, s *Server, companyID string, raw []byte, mapping map[string]string) (int, int, []string) {
	rows := parseCustomerRows(raw, mapping)
	imported, skipped := 0, 0
	errs := []string{}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, 0, []string{err.Error()}
	}
	defer tx.Rollback(ctx)

	for _, row := range rows {
		if row.name == "" {
			skipped++
			continue
		}
		vehicles := []map[string]any{}
		if row.data["vehicle_year"] != "" || row.data["vehicle_make"] != "" || row.data["vehicle_vin"] != "" {
			y, _ := strconv.Atoi(row.data["vehicle_year"])
			mi, _ := strconv.Atoi(row.data["vehicle_mileage"])
			v := map[string]any{
				"id":           fmt.Sprintf("mig-%d-%d", time.Now().UnixNano(), row.line),
				"year":         y,
				"make":         row.data["vehicle_make"],
				"model":        row.data["vehicle_model"],
				"trim":         row.data["vehicle_trim"],
				"vin":          row.data["vehicle_vin"],
				"licensePlate": row.data["vehicle_license_plate"],
				"mileage":      mi,
			}
			vehicles = append(vehicles, v)
		}
		vehJSON, _ := json.Marshal(vehicles)
		_, err := tx.Exec(ctx, `
			INSERT INTO customers (company_id, name, phone, email, address, notes, vehicles)
			VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
			companyID, row.name, row.data["phone"], row.data["email"],
			row.data["address"], row.data["notes"], vehJSON)
		if err != nil {
			skipped++
			if len(errs) < 20 {
				errs = append(errs, fmt.Sprintf("line %d (%s): %s", row.line, row.name, err.Error()))
			}
			continue
		}
		imported++
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, 0, []string{err.Error()}
	}
	return imported, skipped, errs
}

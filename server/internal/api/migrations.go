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
// Phase 1: customers (with embedded first vehicle)
// Phase 2: vehicles (append to existing customers), invoices (historical)
// ----------------------------------------------------------------------------

const migrationMaxBytes = 20 << 20

// Canonical field lists per entity. The order drives UI display.
var entityFields = map[string][]string{
	"customers": {
		"name", "phone", "email", "address", "notes",
		"vehicle_year", "vehicle_make", "vehicle_model", "vehicle_vin",
		"vehicle_license_plate", "vehicle_mileage", "vehicle_trim",
	},
	"vehicles": {
		"customer_phone", "customer_name",
		"year", "make", "model", "trim", "vin", "license_plate", "mileage", "color",
	},
	"invoices": {
		"customer_phone", "customer_name", "vehicle_vin", "vehicle_license_plate",
		"invoice_number", "invoice_date", "status", "total",
		"description", "mileage",
	},
	"backup_bundle": {}, // bundle has no column mapping; see migration_bundle.go
}

// Preset per-vendor header guesses, keyed by {entity, our_field}.
// First match wins. Keep lower-cased.
var vendorPresets = map[string]map[string]map[string][]string{
	"shopware": {
		"customers": {
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
		"vehicles": {
			"customer_phone": {"phone", "customer phone"},
			"customer_name":  {"customer name", "name"},
			"year":           {"year"},
			"make":           {"make"},
			"model":          {"model"},
			"trim":           {"trim"},
			"vin":            {"vin"},
			"license_plate":  {"license", "plate", "license plate"},
			"mileage":        {"mileage", "odometer"},
			"color":          {"color"},
		},
		"invoices": {
			"customer_phone":        {"customer phone", "phone"},
			"customer_name":         {"customer", "customer name"},
			"vehicle_vin":           {"vin"},
			"vehicle_license_plate": {"plate", "license"},
			"invoice_number":        {"invoice number", "ro number", "ro#", "invoice #"},
			"invoice_date":          {"invoice date", "date", "closed date"},
			"status":                {"status", "state"},
			"total":                 {"total", "grand total", "amount"},
			"description":           {"description", "notes", "concern"},
			"mileage":               {"mileage", "odometer"},
		},
	},
	"tekmetric": {
		"customers": {
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
		"vehicles": {
			"customer_phone": {"customer phone", "phone"},
			"customer_name":  {"customer name", "name"},
			"year":           {"year"},
			"make":           {"make"},
			"model":          {"model"},
			"vin":            {"vin"},
			"license_plate":  {"license plate", "plate"},
			"mileage":        {"mileage"},
		},
		"invoices": {
			"customer_phone": {"customer phone", "phone"},
			"customer_name":  {"customer name", "name"},
			"vehicle_vin":    {"vin"},
			"invoice_number": {"ro number", "invoice number", "repair order"},
			"invoice_date":   {"posted date", "date", "invoice date"},
			"status":         {"status"},
			"total":          {"total sales", "total", "grand total"},
			"description":    {"concerns", "notes"},
			"mileage":        {"mileage"},
		},
	},
	"mitchell1": {
		"customers": {
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
		"vehicles": {
			"customer_phone": {"phone", "primary phone"},
			"customer_name":  {"full name", "name"},
			"year":           {"year"},
			"make":           {"make"},
			"model":          {"model"},
			"vin":            {"vin"},
			"license_plate":  {"plate", "tag"},
			"mileage":        {"mileage"},
		},
		"invoices": {
			"customer_phone": {"primary phone", "phone"},
			"customer_name":  {"full name"},
			"vehicle_vin":    {"vin"},
			"invoice_number": {"invoice", "ro", "work order"},
			"invoice_date":   {"invoice date", "date"},
			"status":         {"status"},
			"total":          {"total", "grand total"},
			"description":    {"complaint", "notes"},
		},
	},
	"rowriter": {
		"customers": {
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
		"vehicles": {
			"customer_phone": {"phone"},
			"customer_name":  {"customer"},
			"year":           {"year"},
			"make":           {"make"},
			"model":          {"model"},
			"vin":            {"vin"},
			"license_plate":  {"license"},
		},
		"invoices": {
			"customer_phone": {"phone"},
			"customer_name":  {"customer"},
			"vehicle_vin":    {"vin"},
			"invoice_number": {"invoice", "ro"},
			"invoice_date":   {"date", "invoice date"},
			"status":         {"status"},
			"total":          {"total"},
			"description":    {"description", "notes"},
		},
	},
	"shopmonkey": {
		"customers": {
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
		"vehicles": {
			"customer_phone": {"customer phone", "phone"},
			"customer_name":  {"customer name"},
			"year":           {"year"},
			"make":           {"make"},
			"model":          {"model"},
			"vin":            {"vin"},
			"license_plate":  {"plate"},
			"mileage":        {"mileage"},
		},
		"invoices": {
			"customer_phone": {"customer phone", "phone"},
			"customer_name":  {"customer name"},
			"vehicle_vin":    {"vin"},
			"invoice_number": {"order number", "invoice number"},
			"invoice_date":   {"completed date", "date", "invoice date"},
			"status":         {"status"},
			"total":          {"total", "grand total"},
			"description":    {"concern", "notes"},
			"mileage":        {"mileage"},
		},
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

// ---- Presets listing -----------------------------------------------------

func (s *Server) migrationPresets(w http.ResponseWriter, r *http.Request) {
	vendors := []map[string]any{}
	for key, prs := range vendorPresets {
		vendors = append(vendors, map[string]any{"key": key, "label": vendorLabel(key), "preset": prs})
	}
	vendors = append(vendors, map[string]any{"key": "custom", "label": "Custom CSV", "preset": map[string]map[string][]string{}})
	entities := []map[string]any{}
	for _, name := range []string{"backup_bundle", "customers", "vehicles", "invoices"} {
		entities = append(entities, map[string]any{"key": name, "label": entityLabel(name), "fields": entityFields[name]})
	}
	writeJSON(w, 200, map[string]any{
		"entities": entities,
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

func entityLabel(k string) string {
	switch k {
	case "backup_bundle":
		return "Full Backup Bundle (.zip — everything)"
	case "customers":
		return "Customers (+ 1st vehicle)"
	case "vehicles":
		return "Vehicles (append to existing customers)"
	case "invoices":
		return "Invoices (historical records)"
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

// ---- Create job ----------------------------------------------------------

func (s *Server) migrationCreate(w http.ResponseWriter, r *http.Request) {
	// Allow bundle-sized uploads at the transport layer; the per-entity
	// cap in io.LimitReader below enforces the real limit based on entity.
	r.Body = http.MaxBytesReader(w, r.Body, bundleMaxBytes+1<<20)
	if err := r.ParseMultipartForm(bundleMaxBytes + 1<<20); err != nil {
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
	if _, ok := entityFields[entity]; !ok {
		writeErr(w, 400, "Unknown entity: "+entity)
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
	maxBytes := int64(migrationMaxBytes)
	if entity == "backup_bundle" {
		maxBytes = bundleMaxBytes
	}
	raw, err := io.ReadAll(io.LimitReader(file, maxBytes))
	if err != nil {
		writeErr(w, 400, "Failed to read file.")
		return
	}
	var headers []string
	rowCount := 0
	mapping := map[string]string{}
	if entity == "backup_bundle" {
		headers = []string{} // bundle has no columns to map
	} else {
		headers, rowCount, err = peekCSV(raw)
		if err != nil {
			writeErr(w, 400, "CSV parse error: "+err.Error())
			return
		}
		if preset, ok := vendorPresets[vendor]; ok {
			if ep, ok := preset[entity]; ok {
				mapping = applyPreset(ep, headers)
			}
		}
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
		"fields":  entityFields[entity],
	})
}

// ---- Update mapping ------------------------------------------------------

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

// ---- Dry run -------------------------------------------------------------

func (s *Server) migrationDryRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	raw, mapping, entity, companyID, err := loadJob(r.Context(), s, id)
	if err != nil {
		handleErr(w, err)
		return
	}
	var report map[string]any
	switch entity {
	case "customers":
		report = validateCustomerRows(raw, mapping)
	case "vehicles":
		report = validateLookupRows(r.Context(), s, companyID, raw, mapping, "vehicles")
	case "invoices":
		report = validateLookupRows(r.Context(), s, companyID, raw, mapping, "invoices")
	case "backup_bundle":
		report = validateBundle(raw)
	default:
		writeErr(w, 400, "Unknown entity.")
		return
	}
	status := "dry_run_ok"
	if v, _ := report["invalid"].(int); v > 0 {
		if vv, _ := report["valid"].(int); vv == 0 {
			status = "dry_run_failed"
		}
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

// ---- Commit --------------------------------------------------------------

func (s *Server) migrationCommit(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	raw, mapping, entity, companyID, err := loadJob(r.Context(), s, id)
	if err != nil {
		handleErr(w, err)
		return
	}
	var imported, skipped int
	var errs []string
	switch entity {
	case "customers":
		imported, skipped, errs = importCustomerRows(r.Context(), s, companyID, raw, mapping)
	case "vehicles":
		imported, skipped, errs = importVehicleRows(r.Context(), s, companyID, raw, mapping)
	case "invoices":
		imported, skipped, errs = importInvoiceRows(r.Context(), s, companyID, raw, mapping)
	case "backup_bundle":
		imported, skipped, errs = importBundle(r.Context(), s, companyID, raw)
	default:
		writeErr(w, 400, "Unknown entity.")
		return
	}
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

func (s *Server) migrationDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.db.Exec(r.Context(), `DELETE FROM data_migration_jobs WHERE id=$1`, id); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// ============================================================================
// CSV helpers (shared)
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

// loadJob returns raw CSV, mapping, entity, and company_id.
func loadJob(ctx context.Context, s *Server, id string) ([]byte, map[string]string, string, string, error) {
	var raw []byte
	var mappingJSON []byte
	var entity, companyID string
	err := s.db.QueryRow(ctx,
		`SELECT csv_bytes, mapping, entity, company_id FROM data_migration_jobs WHERE id=$1`, id).
		Scan(&raw, &mappingJSON, &entity, &companyID)
	if err != nil {
		return nil, nil, "", "", err
	}
	if len(raw) == 0 {
		return nil, nil, "", "", errors.New("CSV already purged for this job")
	}
	mapping := map[string]string{}
	_ = json.Unmarshal(mappingJSON, &mapping)
	return raw, mapping, entity, companyID, nil
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

// genericParse pulls each row as {field: trimmed cell value} using mapping.
func genericParse(raw []byte, mapping map[string]string) []map[string]string {
	r := csv.NewReader(strings.NewReader(string(raw)))
	r.FieldsPerRecord = -1
	headers, _ := r.Read()
	idx := map[string]int{}
	for i, h := range headers {
		idx[h] = i
	}
	out := []map[string]string{}
	for {
		rec, err := r.Read()
		if err != nil {
			break
		}
		row := map[string]string{}
		for field, col := range mapping {
			if i, ok := idx[col]; ok && i < len(rec) {
				row[field] = strings.TrimSpace(rec[i])
			}
		}
		out = append(out, row)
	}
	return out
}

// normalizePhone strips to digits so lookups match "(555) 123-4567" to "5551234567".
func normalizePhone(p string) string {
	var b strings.Builder
	for _, r := range p {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// ============================================================================
// Customers importer
// ============================================================================

func validateCustomerRows(raw []byte, mapping map[string]string) map[string]any {
	rows := genericParse(raw, mapping)
	valid, invalid := 0, 0
	sample := []map[string]any{}
	issues := []map[string]any{}
	for i, row := range rows {
		line := i + 2
		if strings.TrimSpace(row["name"]) == "" {
			invalid++
			if len(issues) < 20 {
				issues = append(issues, map[string]any{"line": line, "reason": "missing name"})
			}
			continue
		}
		valid++
		if len(sample) < 5 {
			sample = append(sample, map[string]any{"line": line, "data": row})
		}
	}
	return map[string]any{"total": len(rows), "valid": valid, "invalid": invalid, "issues": issues, "sample": sample}
}

func importCustomerRows(ctx context.Context, s *Server, companyID string, raw []byte, mapping map[string]string) (int, int, []string) {
	rows := genericParse(raw, mapping)
	imported, skipped := 0, 0
	errs := []string{}
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, 0, []string{err.Error()}
	}
	defer tx.Rollback(ctx)
	for i, row := range rows {
		line := i + 2
		if row["name"] == "" {
			skipped++
			continue
		}
		vehicles := []map[string]any{}
		if row["vehicle_year"] != "" || row["vehicle_make"] != "" || row["vehicle_vin"] != "" {
			y, _ := strconv.Atoi(row["vehicle_year"])
			mi, _ := strconv.Atoi(row["vehicle_mileage"])
			vehicles = append(vehicles, map[string]any{
				"id":           fmt.Sprintf("mig-%d-%d", time.Now().UnixNano(), line),
				"year":         y,
				"make":         row["vehicle_make"],
				"model":        row["vehicle_model"],
				"trim":         row["vehicle_trim"],
				"vin":          row["vehicle_vin"],
				"licensePlate": row["vehicle_license_plate"],
				"mileage":      mi,
			})
		}
		vehJSON, _ := json.Marshal(vehicles)
		_, err := tx.Exec(ctx, `
			INSERT INTO customers (company_id, name, phone, email, address, notes, vehicles)
			VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
			companyID, row["name"], row["phone"], row["email"], row["address"], row["notes"], vehJSON)
		if err != nil {
			skipped++
			if len(errs) < 20 {
				errs = append(errs, fmt.Sprintf("line %d (%s): %s", line, row["name"], err.Error()))
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

// ============================================================================
// Vehicles importer (appends to existing customers)
// Invoices importer (historical records)
// ============================================================================

// findCustomer looks up a customer by phone (digits only) first, then by
// exact name. Returns (id, "") when found; ("", reason) when not.
func findCustomer(ctx context.Context, s *Server, companyID, phone, name string) (string, string) {
	phoneDigits := normalizePhone(phone)
	if phoneDigits != "" {
		var id string
		err := s.db.QueryRow(ctx, `
			SELECT id::text FROM customers
			 WHERE company_id=$1
			   AND regexp_replace(phone, '\D', '', 'g') = $2
			 ORDER BY created_at LIMIT 1`, companyID, phoneDigits).Scan(&id)
		if err == nil {
			return id, ""
		}
	}
	if name != "" {
		var id string
		err := s.db.QueryRow(ctx, `
			SELECT id::text FROM customers
			 WHERE company_id=$1 AND lower(name)=lower($2)
			 ORDER BY created_at LIMIT 1`, companyID, name).Scan(&id)
		if err == nil {
			return id, ""
		}
	}
	return "", "no matching customer (looked up by phone then name)"
}

func validateLookupRows(ctx context.Context, s *Server, companyID string, raw []byte, mapping map[string]string, entity string) map[string]any {
	rows := genericParse(raw, mapping)
	valid, invalid := 0, 0
	issues := []map[string]any{}
	sample := []map[string]any{}
	for i, row := range rows {
		line := i + 2
		custID, reason := findCustomer(ctx, s, companyID, row["customer_phone"], row["customer_name"])
		if custID == "" {
			invalid++
			if len(issues) < 20 {
				issues = append(issues, map[string]any{"line": line, "reason": reason})
			}
			continue
		}
		if entity == "invoices" {
			if row["invoice_number"] == "" || row["total"] == "" {
				invalid++
				if len(issues) < 20 {
					issues = append(issues, map[string]any{"line": line, "reason": "missing invoice_number or total"})
				}
				continue
			}
		}
		if entity == "vehicles" {
			if row["make"] == "" && row["model"] == "" && row["vin"] == "" {
				invalid++
				if len(issues) < 20 {
					issues = append(issues, map[string]any{"line": line, "reason": "no vehicle data (make/model/vin all blank)"})
				}
				continue
			}
		}
		valid++
		if len(sample) < 5 {
			sample = append(sample, map[string]any{"line": line, "data": row})
		}
	}
	return map[string]any{"total": len(rows), "valid": valid, "invalid": invalid, "issues": issues, "sample": sample}
}

// importVehicleRows: appends a vehicle object to customers.vehicles JSONB.
func importVehicleRows(ctx context.Context, s *Server, companyID string, raw []byte, mapping map[string]string) (int, int, []string) {
	rows := genericParse(raw, mapping)
	imported, skipped := 0, 0
	errs := []string{}
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, 0, []string{err.Error()}
	}
	defer tx.Rollback(ctx)
	for i, row := range rows {
		line := i + 2
		custID, reason := findCustomer(ctx, s, companyID, row["customer_phone"], row["customer_name"])
		if custID == "" {
			skipped++
			if len(errs) < 20 {
				errs = append(errs, fmt.Sprintf("line %d: %s", line, reason))
			}
			continue
		}
		y, _ := strconv.Atoi(row["year"])
		mi, _ := strconv.Atoi(row["mileage"])
		vehicle := map[string]any{
			"id":           fmt.Sprintf("mig-%d-%d", time.Now().UnixNano(), line),
			"year":         y,
			"make":         row["make"],
			"model":        row["model"],
			"trim":         row["trim"],
			"vin":          row["vin"],
			"licensePlate": row["license_plate"],
			"mileage":      mi,
			"color":        row["color"],
		}
		vehJSON, _ := json.Marshal(vehicle)
		_, err := tx.Exec(ctx, `
			UPDATE customers
			   SET vehicles = COALESCE(vehicles, '[]'::jsonb) || $2::jsonb,
			       updated_at = now()
			 WHERE id=$1 AND company_id=$3`,
			custID, vehJSON, companyID)
		if err != nil {
			skipped++
			if len(errs) < 20 {
				errs = append(errs, fmt.Sprintf("line %d: %s", line, err.Error()))
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

// importInvoiceRows: creates historical invoice documents with status=paid.
// Minimal-schema import: single summary line item, no tax/parts breakdown.
func importInvoiceRows(ctx context.Context, s *Server, companyID string, raw []byte, mapping map[string]string) (int, int, []string) {
	rows := genericParse(raw, mapping)
	imported, skipped := 0, 0
	errs := []string{}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, 0, []string{err.Error()}
	}
	defer tx.Rollback(ctx)

	// Ensure document_number_settings has 'invoice' for this company.
	_, _ = tx.Exec(ctx, `
		INSERT INTO document_number_settings (company_id, doc_type, prefix, next_number, pad_width)
		VALUES ($1,'invoice','HIST-',1,0)
		ON CONFLICT DO NOTHING`, companyID)

	// Reserve a starting number for this import to avoid colliding with new real invoices.
	var startNum int64
	_ = tx.QueryRow(ctx, `
		SELECT COALESCE(MAX(number)+1, 1000000) FROM documents
		 WHERE company_id=$1 AND number_type='invoice'`, companyID).Scan(&startNum)

	for i, row := range rows {
		line := i + 2
		custID, reason := findCustomer(ctx, s, companyID, row["customer_phone"], row["customer_name"])
		if custID == "" {
			skipped++
			if len(errs) < 20 {
				errs = append(errs, fmt.Sprintf("line %d: %s", line, reason))
			}
			continue
		}
		if row["invoice_number"] == "" || row["total"] == "" {
			skipped++
			if len(errs) < 20 {
				errs = append(errs, fmt.Sprintf("line %d: missing invoice_number or total", line))
			}
			continue
		}
		total, err := strconv.ParseFloat(strings.ReplaceAll(row["total"], ",", ""), 64)
		if err != nil {
			skipped++
			if len(errs) < 20 {
				errs = append(errs, fmt.Sprintf("line %d: invalid total %q", line, row["total"]))
			}
			continue
		}

		// Vehicle snapshot built from imported fields (we don't try to re-link to a vehicles[] entry).
		vehSnap := map[string]any{
			"vin":          row["vehicle_vin"],
			"licensePlate": row["vehicle_license_plate"],
		}
		vehSnapJSON, _ := json.Marshal(vehSnap)

		custSnap := map[string]any{"name": row["customer_name"], "phone": row["customer_phone"]}
		custSnapJSON, _ := json.Marshal(custSnap)

		// Items: single summary line equal to the invoice total.
		items := []map[string]any{{
			"id":          fmt.Sprintf("mig-%d-%d", time.Now().UnixNano(), line),
			"type":        "service",
			"description": firstNonEmpty(row["description"], "Imported historical invoice ("+row["invoice_number"]+")"),
			"qty":         1,
			"price":       total,
			"amount":      total,
		}}
		itemsJSON, _ := json.Marshal(items)

		// Payments: one full-payment entry so totals/status reconcile.
		payments := []map[string]any{{
			"id":     fmt.Sprintf("mig-pay-%d-%d", time.Now().UnixNano(), line),
			"method": "other",
			"amount": total,
			"notes":  "Imported historical payment",
		}}
		paymentsJSON, _ := json.Marshal(payments)

		display := "HIST-" + row["invoice_number"]
		docNumber := startNum + int64(i)

		mileageIn := row["mileage"]
		status := strings.ToLower(firstNonEmpty(row["status"], "paid"))

		// Parse invoice_date, default to today if unparseable.
		invDate := time.Now()
		for _, layout := range []string{"2006-01-02", "01/02/2006", "1/2/2006", "2006/01/02", time.RFC3339} {
			if t, err := time.Parse(layout, row["invoice_date"]); err == nil {
				invDate = t
				break
			}
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO documents (
			  company_id, number_type, number, display_number, type, status,
			  customer_id, customer_snapshot, vehicle_id, vehicle_snapshot,
			  mileage_in, odometer_unit, items, payments, settings_snapshot,
			  created_at, updated_at, created_by, updated_by
			) VALUES (
			  $1,'invoice',$2,$3,'invoice',$4,
			  $5,$6::jsonb,'',$7::jsonb,
			  $8,'mi',$9::jsonb,$10::jsonb,'{}'::jsonb,
			  $11,$11,'migration','migration'
			)`,
			companyID, docNumber, display, status,
			custID, custSnapJSON, vehSnapJSON,
			mileageIn, itemsJSON, paymentsJSON,
			invDate)
		if err != nil {
			skipped++
			if len(errs) < 20 {
				errs = append(errs, fmt.Sprintf("line %d (%s): %s", line, display, err.Error()))
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

func firstNonEmpty(ss ...string) string {
	for _, s := range ss {
		if s != "" {
			return s
		}
	}
	return ""
}

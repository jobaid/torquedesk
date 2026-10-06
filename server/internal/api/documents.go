package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var (
	docTypeEnum   = []string{"estimate", "repair_order", "invoice", "statement"}
	docStatusEnum = []string{"open", "in_progress", "waiting", "ready", "paid", "declined", "void"}
	itemKinds     = []string{"labor", "part", "fee", "note", "discount"}
	intendedPay   = []string{"cash", "check", "credit_card", "debit_card", "financing", "other"}
)

func (s *Server) documentRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/documents", s.auth("", s.listDocuments))
	mux.HandleFunc("GET /api/documents/{id}", s.auth("", s.getDocument))
	mux.HandleFunc("POST /api/documents", s.auth("documents.edit", s.createDocument))
	mux.HandleFunc("PUT /api/documents/{id}", s.auth("documents.edit", s.updateDocument))
	mux.HandleFunc("DELETE /api/documents/{id}", s.auth("documents.delete", s.deleteDocument))
	mux.HandleFunc("POST /api/documents/{id}/apply-current-settings", s.auth("documents.edit", s.applyCurrentSettings))
}

// ---------------------------------------------------------------- snapshot

// buildSnapshot freezes the settings a new document is priced and displayed
// with. Uses the given company's settings bundle so each tenant gets its own
// labor rate, taxes, fees, etc.
func (s *Server) buildSnapshot(ctx context.Context, tx pgx.Tx, cid string) (map[string]any, error) {
	b, err := s.loadBundle(ctx, tx, cid)
	if err != nil {
		return nil, err
	}
	lr, _ := b["laborRate"].(map[string]any)
	if lr == nil {
		return nil, errStatus(409, "Set an active labor rate in Settings before creating documents.")
	}
	active := func(key string, keep ...string) []map[string]any {
		out := []map[string]any{}
		for _, row := range b[key].([]map[string]any) {
			if row["active"] != true {
				continue
			}
			m := map[string]any{"id": row["id"]}
			for _, k := range keep {
				m[k] = row[k]
			}
			out = append(out, m)
		}
		return out
	}
	display := b["display"].(map[string]any)
	opts := b["document-options"].(map[string]any)
	return map[string]any{
		"capturedAt": time.Now().UTC().Format(time.RFC3339),
		"laborRate":  lr["rate"],
		"currency":   lr["currency"],
		"taxes":      active("tax-rates", "name", "rate", "isDefault", "appliesParts", "appliesLabor", "appliesFees"),
		"fees":       active("shop-fees", "name", "calcBy", "amount", "percentage", "minimum", "maximum", "appliesTo", "taxable"),
		"markups":    active("markups", "name", "appliesTo", "calcType", "percentage", "amount"),
		"display": map[string]any{
			"partDetails":   display["displayPartDetails"],
			"markupDetails": display["displayMarkupDetails"],
		},
		"options": map[string]any{
			"showPartNumbers":    opts["showPartNumbers"],
			"showLaborRates":     opts["showLaborRates"],
			"showTechnician":     opts["showTechnician"],
			"showPromisedDate":   opts["showPromisedDate"],
			"showPaymentMethods": opts["showPaymentMethods"],
			"paymentMethods":     opts["paymentMethods"],
		},
		"odometerUnit": b["document-preferences"].(map[string]any)["defaultOdometerUnit"],
		"validityDays": b["estimate"].(map[string]any)["validityDays"],
		"savePartsDefault": opts["savePartsDefault"],
	}, nil
}

func defaultTaxIDs(snap map[string]any) []int64 {
	ids := []int64{}
	for _, t := range snap["taxes"].([]map[string]any) {
		if t["isDefault"] == true {
			ids = append(ids, t["id"].(int64))
		}
	}
	return ids
}

// ---------------------------------------------------------------- read

const docCols = `id::text, display_number, number, number_type, type, status, customer_id, customer_snapshot, vehicle_id, vehicle_snapshot,
	writer_id, writer_name, technician_id, technician_name, promised_at, mileage_in, mileage_out, odometer_unit, tag, shop_note,
	save_parts, include_inspection, payment_methods, to_char(estimate_date, 'YYYY-MM-DD'), to_char(expires_at, 'YYYY-MM-DD'), authorization_info,
	items, tax_ids, fees_off, settings_snapshot, created_at, updated_at, created_by, updated_by, invoiced_at,
	labor_total::text, parts_total::text, other_total::text, shop_fees_total::text, discount_total::text, subtotal::text,
	tax_total::text, total::text, paid_total::text, balance::text, payment_status`

func scanDoc(row pgx.Row) (map[string]any, error) {
	var (
		id, display, numType, typ, status, custID, vehID, writerName, techName, promised, mi, mo, unit, tag, note string
		number                                                                                              int64
		custSnap, vehSnap, auth, items, snap                                                                 []byte
		writerID, techID                                                                                    *int64
		saveParts                                                                                           bool
		includeInsp                                                                                         *bool
		payMeth                                                                                             []string
		estDate, expires                                                                                    *string
		taxIDs, feesOff                                                                                     []int64
		created, updated                                                                                    time.Time
		invoiced                                                                                            *time.Time
		createdBy, updatedBy                                                                                string
		tl, tp, to, tf, td, ts, tt, tot, tpaid, tbal, pstatus                                               string
	)
	err := row.Scan(&id, &display, &number, &numType, &typ, &status, &custID, &custSnap, &vehID, &vehSnap,
		&writerID, &writerName, &techID, &techName, &promised, &mi, &mo, &unit, &tag, &note,
		&saveParts, &includeInsp, &payMeth, &estDate, &expires, &auth, &items, &taxIDs, &feesOff, &snap,
		&created, &updated, &createdBy, &updatedBy, &invoiced,
		&tl, &tp, &to, &tf, &td, &ts, &tt, &tot, &tpaid, &tbal, &pstatus)
	if err != nil {
		return nil, err
	}
	raw := func(b []byte) json.RawMessage {
		if len(b) == 0 {
			return json.RawMessage("null")
		}
		return b
	}
	if payMeth == nil {
		payMeth = []string{}
	}
	if taxIDs == nil {
		taxIDs = []int64{}
	}
	if feesOff == nil {
		feesOff = []int64{}
	}
	var invoicedAt any
	if invoiced != nil {
		invoicedAt = invoiced.UnixMilli()
	}
	return map[string]any{
		"id": id, "number": display, "seq": number, "numberType": numType, "type": typ, "status": status,
		"customerId": custID, "customerSnapshot": raw(custSnap), "vehicleId": vehID, "vehicleSnapshot": raw(vehSnap),
		"writerId": writerID, "writer": writerName, "technicianId": techID, "technician": techName,
		"promised": promised, "mileageIn": mi, "mileageOut": mo, "odometerUnit": unit, "tag": tag, "shopNote": note,
		"saveParts": saveParts, "includeInspection": includeInsp, "paymentMethods": payMeth, "estimateDate": estDate, "expiresAt": expires,
		"authorization": raw(auth), "items": raw(items), "payments": []map[string]any{}, "taxIds": taxIDs, "feesOff": feesOff,
		"snapshot": raw(snap), "createdAt": created.UnixMilli(), "updatedAt": updated.UnixMilli(), "invoicedAt": invoicedAt,
		"createdBy": createdBy, "updatedBy": updatedBy,
		// Authoritative totals computed and stored by the server (totals.go).
		"totals": map[string]any{
			"labor": dec(tl), "parts": dec(tp), "other": dec(to), "shopFees": dec(tf), "discount": dec(td), "subtotal": dec(ts),
			"tax": dec(tt), "total": dec(tot), "paid": dec(tpaid), "balance": dec(tbal), "paymentStatus": pstatus,
		},
	}, nil
}

type queryer interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

// attachPayments loads payments for many documents in ONE query (no N+1).
func attachPayments(ctx context.Context, q queryer, docs []map[string]any) error {
	if len(docs) == 0 {
		return nil
	}
	ids := make([]string, len(docs))
	byID := map[string]map[string]any{}
	for i, d := range docs {
		ids[i] = d["id"].(string)
		byID[ids[i]] = d
	}
	rows, err := q.Query(ctx, `SELECT `+paymentCols+` FROM payments p WHERE p.document_id::text = ANY($1) ORDER BY p.paid_at, p.payment_number`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		docID, p, err := scanPayment(rows)
		if err != nil {
			return err
		}
		d := byID[docID]
		d["payments"] = append(d["payments"].([]map[string]any), p)
	}
	return rows.Err()
}

func (s *Server) listDocuments(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	rows, err := s.db.Query(r.Context(), `SELECT `+docCols+` FROM documents WHERE company_id::text = $1 ORDER BY updated_at DESC LIMIT 2000`, cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	out := []map[string]any{}
	for rows.Next() {
		d, err := scanDoc(rows)
		if err != nil {
			rows.Close()
			handleErr(w, err)
			return
		}
		out = append(out, d)
	}
	rows.Close()
	if err := attachPayments(r.Context(), s.db, out); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}

// docByID is tenant-scoped: a document from another company returns ErrNoRows
// (surfaced as a 404 by handleErr), so cross-tenant id guessing can't leak.
// Uses the caller's authenticated company from the context.
func (s *Server) docByID(ctx context.Context, q queryer, id string) (map[string]any, error) {
	return s.docByIDTenant(ctx, q, id, companyFrom(ctx))
}

// docByIDTenant looks up a document in a specific company. Used by internal
// code (seed, insertDocument) that holds the cid directly and isn't carrying
// an authenticated-user context.
func (s *Server) docByIDTenant(ctx context.Context, q queryer, id, cid string) (map[string]any, error) {
	d, err := scanDoc(q.QueryRow(ctx, `SELECT `+docCols+` FROM documents WHERE id::text = $1 AND company_id::text = $2`, id, cid))
	if err != nil {
		return nil, err
	}
	return d, attachPayments(ctx, q, []map[string]any{d})
}

func (s *Server) getDocument(w http.ResponseWriter, r *http.Request) {
	d, err := s.docByID(r.Context(), s.db, r.PathValue("id"))
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, d)
}

// ---------------------------------------------------------------- create

// allocateNumber takes the next number for docType under a row lock, skipping any
// number whose display string already exists (e.g. after prefix changes).
func allocateNumber(ctx context.Context, tx pgx.Tx, cid, docType string) (int64, string, error) {
	for range 100 {
		var n int64
		var prefix string
		if err := tx.QueryRow(ctx, `UPDATE document_number_settings SET next_number = next_number + 1
			WHERE company_id::text = $1 AND doc_type = $2 RETURNING next_number - 1, prefix`, cid, docType).Scan(&n, &prefix); err != nil {
			return 0, "", err
		}
		display := prefix + fmt.Sprint(n)
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (
				SELECT 1 FROM documents
				WHERE company_id::text = $1 AND (display_number = $2 OR (number_type = $3 AND number = $4)))`,
			cid, display, docType, n).Scan(&exists); err != nil {
			return 0, "", err
		}
		if !exists {
			return n, display, nil
		}
	}
	return 0, "", errStatus(409, "Could not allocate a unique document number. Check Settings → Document Numbering.")
}

type docInput struct {
	Type             string          `json:"type"`
	Status           string          `json:"status"`
	CustomerID       string          `json:"customerId"`
	CustomerSnapshot json.RawMessage `json:"customerSnapshot"`
	VehicleID        string          `json:"vehicleId"`
	VehicleSnapshot  json.RawMessage `json:"vehicleSnapshot"`
	WriterID         *int64          `json:"writerId"`
	Items            json.RawMessage `json:"items"`
	ShopNote         string          `json:"shopNote"`
}

func (s *Server) createDocument(w http.ResponseWriter, r *http.Request) {
	var in docInput
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid JSON body.")
		return
	}
	d, err := s.insertDocument(r.Context(), userFrom(r.Context()), in, nil)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 201, d)
}

// fixedNumber is used only by the demo seed to keep familiar numbers.
func (s *Server) insertDocument(ctx context.Context, u User, in docInput, fixedNumber *int64) (map[string]any, error) {
	ve := ValidationError{}
	if !slices.Contains(docTypeEnum, in.Type) {
		ve["type"] = "Choose a document type."
	}
	if in.Status == "" {
		in.Status = "open"
	}
	if !slices.Contains(docStatusEnum, in.Status) {
		ve["status"] = "Invalid status."
	}
	items, err := cleanItems(in.Items)
	if err != nil {
		ve["items"] = err.Error()
	}
	if err := checkSnapshotJSON(in.CustomerSnapshot); err != nil {
		ve["customerSnapshot"] = err.Error()
	}
	if err := checkSnapshotJSON(in.VehicleSnapshot); err != nil {
		ve["vehicleSnapshot"] = err.Error()
	}
	if len(in.ShopNote) > 2000 || len(in.CustomerID) > 64 || len(in.VehicleID) > 64 {
		ve["shopNote"] = "Text is too long."
	}
	if len(ve) > 0 {
		return nil, ve
	}
	cid := u.CompanyID
	if cid == "" {
		return nil, errStatus(401, "Missing company context.")
	}
	var out map[string]any
	err = s.tx(ctx, func(tx pgx.Tx) error {
		snap, err := s.buildSnapshot(ctx, tx, cid)
		if err != nil {
			return err
		}
		var num int64
		var display string
		if fixedNumber != nil {
			num, display = *fixedNumber, fmt.Sprint(*fixedNumber)
		} else if num, display, err = allocateNumber(ctx, tx, cid, in.Type); err != nil {
			return err
		}
		numberType := in.Type
		if fixedNumber != nil {
			numberType = "estimate"
		}
		writerName := ""
		if in.WriterID != nil {
			if writerName, err = staffName(ctx, tx, "shop_service_writers", *in.WriterID, nil, cid); err != nil {
				return err
			}
		}
		snapJSON, _ := json.Marshal(snap)
		itemsJSON, _ := json.Marshal(items)
		var id string
		err = tx.QueryRow(ctx, `INSERT INTO documents (company_id, number_type, number, display_number, type, status, customer_id, customer_snapshot,
			vehicle_id, vehicle_snapshot, writer_id, writer_name, odometer_unit, shop_note, save_parts, estimate_date, expires_at,
			items, tax_ids, settings_snapshot, created_by, updated_by)
			VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
			CASE WHEN $5 = 'estimate' THEN current_date END,
			CASE WHEN $5 = 'estimate' THEN current_date + $16::int END,
			$17, $18, $19, $20, $20) RETURNING id::text`,
			cid, numberType, num, display, in.Type, in.Status, in.CustomerID, nullJSON(in.CustomerSnapshot), in.VehicleID, nullJSON(in.VehicleSnapshot),
			in.WriterID, writerName, snap["odometerUnit"], strings.TrimSpace(in.ShopNote), snap["savePartsDefault"] == true,
			snap["validityDays"], itemsJSON, defaultTaxIDs(snap), snapJSON, u.Name).Scan(&id)
		if err != nil {
			return err
		}
		if in.Type == "invoice" {
			if _, err := tx.Exec(ctx, `UPDATE documents SET invoiced_at = now() WHERE id::text = $1`, id); err != nil {
				return err
			}
		}
		if err := recalcDocument(ctx, tx, id); err != nil {
			return err
		}
		out, err = s.docByIDTenant(ctx, tx, id, cid)
		return err
	})
	return out, err
}

func nullJSON(b json.RawMessage) any {
	if len(b) == 0 || string(b) == "null" {
		return nil
	}
	return []byte(b)
}

func checkSnapshotJSON(b json.RawMessage) error {
	if len(b) == 0 || string(b) == "null" {
		return nil
	}
	if len(b) > 16<<10 {
		return errors.New("Snapshot is too large.")
	}
	var m map[string]any
	if json.Unmarshal(b, &m) != nil {
		return errors.New("Must be an object.")
	}
	return nil
}

// staffName returns the display name for an active staff member. Inactive staff
// can only stay on a document they are already assigned to (current == id).
// Scoped to the given company so one tenant can't reference another's staff.
func staffName(ctx context.Context, tx pgx.Tx, table string, id int64, current *int64, cid string) (string, error) {
	var name string
	var active bool
	if err := tx.QueryRow(ctx, `SELECT display_name, active FROM `+table+` WHERE id = $1 AND company_id::text = $2`, id, cid).Scan(&name, &active); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ValidationError{"staff": "That staff member no longer exists."}
		}
		return "", err
	}
	if !active && (current == nil || *current != id) {
		return "", ValidationError{"staff": name + " is inactive and can't be assigned to documents."}
	}
	return name, nil
}

// cleanItems validates and normalizes line items.
func cleanItems(raw json.RawMessage) ([]map[string]any, error) {
	out := []map[string]any{}
	if len(raw) == 0 || string(raw) == "null" {
		return out, nil
	}
	var in []map[string]any
	if err := json.Unmarshal(raw, &in); err != nil {
		return nil, errors.New("Line items must be a list.")
	}
	if len(in) > 300 {
		return nil, errors.New("A document can have at most 300 line items.")
	}
	str := func(m map[string]any, k string, max int) (string, error) {
		v, _ := m[k].(string)
		if len(v) > max {
			return "", fmt.Errorf("%s is too long.", k)
		}
		return v, nil
	}
	numf := func(m map[string]any, k string, lo, hi float64) (float64, error) {
		x, ok := toFloat(m[k])
		if m[k] == nil || m[k] == "" {
			x, ok = 0, true
		}
		if !ok || math.IsNaN(x) || x < lo || x > hi {
			return 0, fmt.Errorf("Line item %s is out of range.", k)
		}
		return math.Round(x*1000) / 1000, nil
	}
	for _, it := range in {
		kind, _ := it["kind"].(string)
		if !slices.Contains(itemKinds, kind) {
			return nil, errors.New("Unknown line item type.")
		}
		c := map[string]any{"kind": kind}
		var err error
		if c["id"], err = str(it, "id", 64); err != nil {
			return nil, err
		}
		if c["description"], err = str(it, "description", 1000); err != nil {
			return nil, err
		}
		switch kind {
		case "discount":
			mode, _ := it["mode"].(string)
			applies, _ := it["appliesTo"].(string)
			if !slices.Contains([]string{"percent", "amount"}, mode) || !slices.Contains([]string{"labor", "parts", "all"}, applies) {
				return nil, errors.New("Invalid discount settings.")
			}
			c["mode"], c["appliesTo"] = mode, applies
			max := 1e6
			if mode == "percent" {
				max = 100
			}
			if c["value"], err = numf(it, "value", 0, max); err != nil {
				return nil, err
			}
		case "note":
			c["qty"], c["price"] = 0, 0
		default:
			if c["qty"], err = numf(it, "qty", 0, 10000); err != nil {
				return nil, err
			}
			if c["price"], err = numf(it, "price", 0, 1e6); err != nil {
				return nil, err
			}
			c["taxable"], _ = it["taxable"].(bool)
			if kind == "part" {
				if c["partNumber"], err = str(it, "partNumber", 100); err != nil {
					return nil, err
				}
				if c["vendor"], err = str(it, "vendor", 100); err != nil {
					return nil, err
				}
				if c["cost"], err = numf(it, "cost", 0, 1e6); err != nil {
					return nil, err
				}
				c["autoPrice"], _ = it["autoPrice"].(bool)
			}
			if kind == "labor" {
				if c["procedure"], err = str(it, "procedure", 100); err != nil {
					return nil, err
				}
			}
		}
		out = append(out, c)
	}
	return out, nil
}

// ---------------------------------------------------------------- update

func (s *Server) updateDocument(w http.ResponseWriter, r *http.Request) {
	var body map[string]json.RawMessage
	if err := readJSON(r, &body); err != nil {
		writeErr(w, 400, "Invalid JSON body.")
		return
	}
	u := userFrom(r.Context())
	id := r.PathValue("id")
	cid := u.CompanyID
	var out map[string]any
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		cur, err := scanDoc(tx.QueryRow(r.Context(), `SELECT `+docCols+` FROM documents WHERE id::text = $1 AND company_id::text = $2 FOR UPDATE`, id, cid))
		if err != nil {
			return err
		}
		var snap map[string]any
		json.Unmarshal(cur["snapshot"].(json.RawMessage), &snap)
		sets, args := []string{"updated_at = now()", "updated_by = $1"}, []any{u.Name}
		set := func(col string, v any) { args = append(args, v); sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args))) }
		ve := ValidationError{}
		str := func(k string, max int, col string, digits bool) {
			raw, ok := body[k]
			if !ok {
				return
			}
			var v string
			if json.Unmarshal(raw, &v) != nil || len(v) > max || (digits && strings.Trim(v, "0123456789") != "") {
				ve[k] = "Invalid value."
				return
			}
			set(col, strings.TrimSpace(v))
		}
		enum := func(k string, list []string, col string) {
			raw, ok := body[k]
			if !ok {
				return
			}
			var v string
			if json.Unmarshal(raw, &v) != nil || !slices.Contains(list, v) {
				ve[k] = "Invalid value."
				return
			}
			set(col, v)
		}
		enum("type", docTypeEnum, "type")
		enum("status", docStatusEnum, "status")
		str("customerId", 64, "customer_id", false)
		str("vehicleId", 64, "vehicle_id", false)
		str("promised", 30, "promised_at", false)
		str("mileageIn", 9, "mileage_in", true)
		str("mileageOut", 9, "mileage_out", true)
		str("tag", 40, "tag", false)
		str("shopNote", 2000, "shop_note", false)
		for _, k := range []string{"customerSnapshot", "vehicleSnapshot", "authorization"} {
			raw, ok := body[k]
			if !ok {
				continue
			}
			if err := checkSnapshotJSON(raw); err != nil {
				ve[k] = err.Error()
				continue
			}
			col := map[string]string{"customerSnapshot": "customer_snapshot", "vehicleSnapshot": "vehicle_snapshot", "authorization": "authorization_info"}[k]
			set(col, nullJSON(raw))
		}
		if raw, ok := body["saveParts"]; ok {
			var b bool
			if json.Unmarshal(raw, &b) != nil {
				ve["saveParts"] = "Invalid value."
			} else {
				set("save_parts", b)
			}
		}
		// Per-document "Include Inspection Report" override. Three-valued:
		// null = inherit the shop default, true/false = explicit override.
		if raw, ok := body["includeInspection"]; ok {
			if string(raw) == "null" {
				set("include_inspection", nil)
			} else {
				var b bool
				if json.Unmarshal(raw, &b) != nil {
					ve["includeInspection"] = "Invalid value."
				} else {
					set("include_inspection", b)
				}
			}
		}
		if raw, ok := body["paymentMethods"]; ok {
			var xs []string
			if json.Unmarshal(raw, &xs) != nil || slices.ContainsFunc(xs, func(x string) bool { return !slices.Contains(intendedPay, x) }) {
				ve["paymentMethods"] = "Invalid payment method."
			} else {
				set("payment_methods", xs)
			}
		}
		if raw, ok := body["items"]; ok {
			items, err := cleanItems(raw)
			if err != nil {
				ve["items"] = err.Error()
			} else {
				b, _ := json.Marshal(items)
				set("items", b)
			}
		}
		idsWithin := func(k, col, listKey string) {
			raw, ok := body[k]
			if !ok {
				return
			}
			var ids []int64
			if json.Unmarshal(raw, &ids) != nil {
				ve[k] = "Invalid value."
				return
			}
			allowed := []int64{}
			if list, ok := snap[listKey].([]any); ok {
				for _, x := range list {
					if m, ok := x.(map[string]any); ok {
						if f, ok := m["id"].(float64); ok {
							allowed = append(allowed, int64(f))
						}
					}
				}
			}
			for _, id := range ids {
				if !slices.Contains(allowed, id) {
					ve[k] = "Only the tax rates and fees captured on this document can be used."
					return
				}
			}
			set(col, ids)
		}
		idsWithin("taxIds", "tax_ids", "taxes")
		idsWithin("feesOff", "fees_off", "fees")
		for _, st := range []struct{ key, idCol, nameCol, table string }{
			{"writerId", "writer_id", "writer_name", "shop_service_writers"},
			{"technicianId", "technician_id", "technician_name", "shop_technicians"},
		} {
			raw, ok := body[st.key]
			if !ok {
				continue
			}
			var nid *int64
			if json.Unmarshal(raw, &nid) != nil {
				ve[st.key] = "Invalid value."
				continue
			}
			curID, _ := cur[st.key].(*int64)
			if nid == nil {
				set(st.idCol, nil)
				set(st.nameCol, "")
				continue
			}
			name, err := staffName(r.Context(), tx, st.table, *nid, curID, cid)
			if err != nil {
				var v ValidationError
				if errors.As(err, &v) {
					ve[st.key] = v["staff"]
					continue
				}
				return err
			}
			set(st.idCol, *nid)
			set(st.nameCol, name)
		}
		if len(ve) > 0 {
			return ve
		}
		// Invoice date: set when a document becomes an invoice; cleared if it is changed back.
		if raw, ok := body["type"]; ok {
			var t string
			json.Unmarshal(raw, &t)
			if t == "invoice" && cur["invoicedAt"] == nil {
				sets = append(sets, "invoiced_at = now()")
			} else if t != "invoice" {
				sets = append(sets, "invoiced_at = NULL")
			}
		}
		args = append(args, id, cid)
		if _, err := tx.Exec(r.Context(), fmt.Sprintf("UPDATE documents SET %s WHERE id::text = $%d AND company_id::text = $%d", strings.Join(sets, ", "), len(args)-1, len(args)), args...); err != nil {
			return err
		}
		if err := recalcDocument(r.Context(), tx, id); err != nil {
			return err
		}
		out, err = s.docByID(r.Context(), tx, id)
		return err
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) deleteDocument(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	tag, err := s.db.Exec(r.Context(), `DELETE FROM documents WHERE id::text = $1 AND company_id::text = $2`, r.PathValue("id"), cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeErr(w, 404, "Not found.")
		return
	}
	w.WriteHeader(204)
}

// applyCurrentSettings is the explicit "recalculate" action: it replaces the
// document's frozen snapshot with today's settings and reprices labor lines that
// used the old labor rate and auto-priced parts.
func (s *Server) applyCurrentSettings(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	u := userFrom(r.Context())
	cid := u.CompanyID
	var out map[string]any
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		cur, err := scanDoc(tx.QueryRow(r.Context(), `SELECT `+docCols+` FROM documents WHERE id::text = $1 AND company_id::text = $2 FOR UPDATE`, id, cid))
		if err != nil {
			return err
		}
		var oldSnap map[string]any
		json.Unmarshal(cur["snapshot"].(json.RawMessage), &oldSnap)
		snap, err := s.buildSnapshot(r.Context(), tx, cid)
		if err != nil {
			return err
		}
		var items []map[string]any
		json.Unmarshal(cur["items"].(json.RawMessage), &items)
		var oldMarkups []map[string]any
		mb, _ := json.Marshal(oldSnap["markups"])
		json.Unmarshal(mb, &oldMarkups)
		newMarkups := snap["markups"].([]map[string]any)
		oldRate, _ := oldSnap["laborRate"].(float64)
		oldLabor := markupPrice(oldRate, oldMarkups, "labor")
		newLabor := markupPrice(snap["laborRate"].(float64), newMarkups, "labor")
		for _, it := range items {
			switch it["kind"] {
			case "labor":
				if p, _ := it["price"].(float64); math.Abs(p-oldLabor) < 0.005 || math.Abs(p-oldRate) < 0.005 {
					it["price"] = newLabor
				}
			case "part":
				if it["autoPrice"] == true {
					if c, _ := it["cost"].(float64); c > 0 {
						it["price"] = markupPrice(c, newMarkups, "parts")
					}
				}
			}
		}
		snapJSON, _ := json.Marshal(snap)
		itemsJSON, _ := json.Marshal(items)
		if _, err := tx.Exec(r.Context(), `UPDATE documents SET settings_snapshot = $1, items = $2, tax_ids = $3, fees_off = '{}',
			updated_at = now(), updated_by = $4 WHERE id::text = $5 AND company_id::text = $6`, snapJSON, itemsJSON, defaultTaxIDs(snap), u.Name, id, cid); err != nil {
			return err
		}
		if err := recalcDocument(r.Context(), tx, id); err != nil {
			return err
		}
		out, err = s.docByID(r.Context(), tx, id)
		return err
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}

// markupPrice applies the active markup for a category ("parts", "labor") to a base amount.
func markupPrice(cost float64, markups []map[string]any, appliesTo string) float64 {
	for _, m := range markups {
		if m["appliesTo"] != appliesTo {
			continue
		}
		if m["calcType"] == "percent" {
			pct, _ := m["percentage"].(float64)
			return math.Round(cost*(1+pct/100)*100) / 100
		}
		amt, _ := m["amount"].(float64)
		return math.Round((cost+amt)*100) / 100
	}
	return math.Round(cost*100) / 100
}

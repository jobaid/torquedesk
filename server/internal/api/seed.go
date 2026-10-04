package api

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// SeedDemoDocuments inserts the sample documents once, on first run.
func (s *Server) SeedDemoDocuments(ctx context.Context) error {
	var done bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM app_secrets WHERE name = 'demo_seeded')`).Scan(&done); err != nil || done {
		return err
	}
	u := User{Name: "system", Role: "admin"}
	writerID := func(name string) *int64 {
		var id int64
		if err := s.db.QueryRow(ctx, `SELECT id FROM shop_service_writers WHERE display_name = $1`, name).Scan(&id); err != nil {
			return nil
		}
		return &id
	}
	raw := func(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
	cust := func(id, name, phone, email string) json.RawMessage {
		return raw(map[string]string{"id": id, "name": name, "phone": phone, "email": email})
	}
	docs := []struct {
		num  int64
		in   docInput
		then map[string]any
	}{
		{301328, docInput{Type: "estimate", CustomerID: "c3", CustomerSnapshot: cust("c3", "Dana Whitfield", "(301) 555-0119", "dwhitfield@example.com"),
			VehicleID: "cv3", VehicleSnapshot: raw(map[string]any{"year": 2021, "make": "Ram", "model": "1500 Classic", "engineLabel": "5.7L V8", "vin": "1C6RR7TT3MS518357"}),
			WriterID: writerID("TEE"), Items: raw([]map[string]any{
				{"id": "s1", "kind": "labor", "description": "Engine oil & filter change", "qty": 0.5, "price": 150, "procedure": "oil-change"},
				{"id": "s2", "kind": "part", "description": "Full synthetic 0W-20, 1 qt", "qty": 7, "price": 8.99, "cost": 5.5, "partNumber": "OIL-0W20", "taxable": true},
				{"id": "s3", "kind": "part", "description": "Oil filter", "qty": 1, "price": 9.99, "cost": 4.2, "partNumber": "OF-04152", "taxable": true},
				{"id": "s4", "kind": "labor", "description": "Tire rotation & TPMS relearn", "qty": 0.5, "price": 150, "procedure": "tire-rotation"},
			})}, map[string]any{"type": "invoice", "status": "ready", "mileageIn": "61405", "mileageOut": "61412", "tag": "T-14"}},
		{301329, docInput{Type: "estimate", CustomerID: "c1", CustomerSnapshot: cust("c1", "Marcus Reyes", "(202) 555-0187", "marcus.reyes@example.com"),
			VehicleID: "cv1", VehicleSnapshot: raw(map[string]any{"year": 2021, "make": "GMC", "model": "Yukon XL 1500", "engineLabel": "5.3L V8", "vin": "1GKS2GKC5MR123456"}),
			WriterID: writerID("TEE"), Items: raw([]map[string]any{
				{"id": "s5", "kind": "labor", "description": "Installation labor — right front window regulator assembly", "qty": 1.2, "price": 150, "procedure": "window-regulator-front"},
				{"id": "s6", "kind": "note", "description": "Customer provided part (used). No warranty on customer-supplied parts."},
				{"id": "s7", "kind": "discount", "description": "Loyalty discount", "mode": "percent", "value": 5, "appliesTo": "labor"},
			})}, map[string]any{"type": "repair_order", "status": "in_progress", "mileageIn": "48210"}},
		{301330, docInput{Type: "estimate", CustomerID: "c2", CustomerSnapshot: cust("c2", "Priya Natarajan", "(410) 555-0133", "priya.n@example.com"),
			VehicleID: "cv2", VehicleSnapshot: raw(map[string]any{"year": 2013, "make": "Jeep", "model": "Wrangler", "engineLabel": "3.6L V6", "vin": "1C4HJWEG6DL657026"}),
			WriterID: writerID("MARIA"), ShopNote: "Customer reports clicking when starting.", Items: raw([]map[string]any{
				{"id": "s8", "kind": "labor", "description": "Diagnose no-crank condition", "qty": 1, "price": 150},
				{"id": "s9", "kind": "labor", "description": "Starter motor replacement", "qty": 1.3, "price": 150, "procedure": "starter-rr"},
				{"id": "s10", "kind": "part", "description": "Starter motor", "qty": 1, "price": 189, "cost": 135, "partNumber": "STR-6650", "taxable": true},
			})}, nil},
	}
	for _, d := range docs {
		n := d.num
		doc, err := s.insertDocument(ctx, u, d.in, &n)
		if err != nil {
			return err
		}
		if d.then != nil {
			sets := []string{}
			args := []any{}
			for k, v := range d.then {
				col := map[string]string{"type": "type", "status": "status", "mileageIn": "mileage_in", "mileageOut": "mileage_out", "tag": "tag"}[k]
				args = append(args, v)
				sets = append(sets, col+" = $"+itoa(len(args)))
			}
			args = append(args, doc["id"])
			if _, err := s.db.Exec(ctx, "UPDATE documents SET "+join(sets)+" WHERE id::text = $"+itoa(len(args)), args...); err != nil {
				return err
			}
		}
	}
	// The repair order gets its authorization and technician.
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE documents SET authorization_info = $1, technician_id = t.id, technician_name = t.display_name
			FROM shop_technicians t WHERE t.display_name = 'DOUGLAZ' AND documents.display_number = '301329'`,
			raw(map[string]any{"approved": true, "by": "Marcus Reyes", "method": "Phone", "at": time.Now().Add(-4 * time.Hour).UnixMilli()})); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO app_secrets (name, value) VALUES ('demo_seeded', '\x01')`)
		return err
	})
	if err != nil {
		return errors.Join(errors.New("finish seed"), err)
	}
	return nil
}

func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	return itoa(n/10) + string(rune('0'+n%10))
}

func join(xs []string) string {
	out := ""
	for i, x := range xs {
		if i > 0 {
			out += ", "
		}
		out += x
	}
	return out
}

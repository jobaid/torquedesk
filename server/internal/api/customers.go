package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Customers CRUD, tenant-scoped. Permissions: `customers.edit` for writes,
// any authenticated user with a tenant may read (used in document editing).
//
// Vehicle shape stays identical to what the frontend already uses, so switching
// the Customers page from localStorage to this API is a drop-in change.

func (s *Server) customerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/customers", s.auth("", s.listCustomers))
	mux.HandleFunc("POST /api/customers", s.auth("customers.edit", s.createCustomer))
	mux.HandleFunc("GET /api/customers/{id}", s.auth("", s.getCustomer))
	mux.HandleFunc("PUT /api/customers/{id}", s.auth("customers.edit", s.updateCustomer))
	mux.HandleFunc("DELETE /api/customers/{id}", s.auth("customers.edit", s.deleteCustomer))
	mux.HandleFunc("POST /api/customers/import", s.auth("customers.edit", s.importCustomers))
}

type customerIn struct {
	Name     string          `json:"name"`
	Phone    string          `json:"phone"`
	Email    string          `json:"email"`
	Address  string          `json:"address"`
	Notes    string          `json:"notes"`
	Vehicles json.RawMessage `json:"vehicles"`
}

func scanCustomer(row pgx.Row) (map[string]any, error) {
	var id, name, phone, email, address, notes string
	var vehicles []byte
	var createdAt, updatedAt time.Time
	if err := row.Scan(&id, &name, &phone, &email, &address, &notes, &vehicles, &createdAt, &updatedAt); err != nil {
		return nil, err
	}
	var vs any = []any{}
	if len(vehicles) > 0 {
		_ = json.Unmarshal(vehicles, &vs)
	}
	return map[string]any{
		"id": id, "name": name, "phone": phone, "email": email, "address": address, "notes": notes,
		"vehicles": vs, "createdAt": createdAt.UnixMilli(), "updatedAt": updatedAt.UnixMilli(),
	}, nil
}

const customerCols = `id::text, name, phone, email, address, notes, vehicles, created_at, updated_at`

func (s *Server) listCustomers(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	rows, err := s.db.Query(r.Context(), `SELECT `+customerCols+` FROM customers WHERE company_id::text = $1 ORDER BY created_at DESC`, cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		c, err := scanCustomer(rows)
		if err != nil {
			handleErr(w, err)
			return
		}
		out = append(out, c)
	}
	writeJSON(w, 200, out)
}

func (s *Server) getCustomer(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	id := r.PathValue("id")
	c, err := scanCustomer(s.db.QueryRow(r.Context(), `SELECT `+customerCols+` FROM customers WHERE id::text = $1 AND company_id::text = $2`, id, cid))
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, c)
}

func (s *Server) createCustomer(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	var in customerIn
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		writeErr(w, 400, "Customer name is required.")
		return
	}
	vehicles := in.Vehicles
	if len(vehicles) == 0 {
		vehicles = []byte(`[]`)
	}
	var id string
	err := s.db.QueryRow(r.Context(), `INSERT INTO customers (company_id, name, phone, email, address, notes, vehicles)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb) RETURNING id::text`,
		cid, in.Name, in.Phone, in.Email, in.Address, in.Notes, string(vehicles)).Scan(&id)
	if err != nil {
		handleErr(w, err)
		return
	}
	c, _ := scanCustomer(s.db.QueryRow(r.Context(), `SELECT `+customerCols+` FROM customers WHERE id::text = $1`, id))
	writeJSON(w, 201, c)
}

func (s *Server) updateCustomer(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	id := r.PathValue("id")
	var in customerIn
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	vehicles := in.Vehicles
	if len(vehicles) == 0 {
		vehicles = []byte(`[]`)
	}
	ct, err := s.db.Exec(r.Context(), `UPDATE customers
		SET name = $1, phone = $2, email = $3, address = $4, notes = $5, vehicles = $6::jsonb, updated_at = now()
		WHERE id::text = $7 AND company_id::text = $8`,
		strings.TrimSpace(in.Name), in.Phone, in.Email, in.Address, in.Notes, string(vehicles), id, cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	if ct.RowsAffected() == 0 {
		writeErr(w, 404, "Customer not found.")
		return
	}
	c, _ := scanCustomer(s.db.QueryRow(r.Context(), `SELECT `+customerCols+` FROM customers WHERE id::text = $1`, id))
	writeJSON(w, 200, c)
}

func (s *Server) deleteCustomer(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	id := r.PathValue("id")
	if _, err := s.db.Exec(r.Context(), `DELETE FROM customers WHERE id::text = $1 AND company_id::text = $2`, id, cid); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// importCustomers takes an array of customer objects (same shape as list output)
// and inserts rows that don't already exist by name+phone. Used to migrate the
// existing per-browser localStorage customers into the tenant's Postgres table.
func (s *Server) importCustomers(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	var in []customerIn
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	imported := 0
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		for _, c := range in {
			name := strings.TrimSpace(c.Name)
			if name == "" {
				continue
			}
			var exists bool
			if err := tx.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM customers
				WHERE company_id::text = $1 AND lower(name) = lower($2) AND coalesce(phone,'') = coalesce($3,''))`,
				cid, name, c.Phone).Scan(&exists); err != nil {
				return err
			}
			if exists {
				continue
			}
			vehicles := c.Vehicles
			if len(vehicles) == 0 {
				vehicles = []byte(`[]`)
			}
			if _, err := tx.Exec(r.Context(), `INSERT INTO customers (company_id, name, phone, email, address, notes, vehicles)
				VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb)`,
				cid, name, c.Phone, c.Email, c.Address, c.Notes, string(vehicles)); err != nil {
				return err
			}
			imported++
		}
		return nil
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"imported": imported})
}

// customersForBackup returns the raw customer rows + per-row JSON for round-trip
// restore (same pattern as documents in backup.go).
func (s *Server) customersForBackup(ctx context.Context, cid string) ([]map[string]any, error) {
	rows, err := s.db.Query(ctx, `SELECT `+customerCols+`, to_jsonb(c) AS _row FROM customers c WHERE company_id::text = $1 ORDER BY created_at`, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, phone, email, address, notes string
		var vehicles []byte
		var createdAt, updatedAt time.Time
		var raw any
		if err := rows.Scan(&id, &name, &phone, &email, &address, &notes, &vehicles, &createdAt, &updatedAt, &raw); err != nil {
			return nil, err
		}
		var vs any = []any{}
		if len(vehicles) > 0 {
			_ = json.Unmarshal(vehicles, &vs)
		}
		out = append(out, map[string]any{
			"id": id, "name": name, "phone": phone, "email": email, "address": address, "notes": notes,
			"vehicles": vs, "createdAt": createdAt.UnixMilli(), "updatedAt": updatedAt.UnixMilli(),
			"_row": raw,
		})
	}
	return out, nil
}

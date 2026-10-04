package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var paymentMethods = []string{"cash", "check", "credit_card", "debit_card", "financing", "other"}
var paymentStatuses = []string{"completed", "partially_refunded", "refunded", "voided"}

const paymentCols = `p.document_id::text, p.id::text, p.payment_number, p.paid_at, p.method,
	p.amount::text, p.refunded_amount::text, p.check_number, p.reference, p.notes,
	p.status, p.refunded_at, p.refund_reason, p.voided_at,
	p.recorded_by, p.updated_by, p.created_at, p.updated_at`

func scanPayment(row pgx.Row) (string, map[string]any, error) {
	var (
		docID, id, method, check, ref, notes, status, recBy, updBy string
		amount, refunded                                           string
		number                                                     int64
		paidAt, created, updated                                   time.Time
		refundedAt, voidedAt                                       *time.Time
		refundReason                                               string
	)
	if err := row.Scan(&docID, &id, &number, &paidAt, &method,
		&amount, &refunded, &check, &ref, &notes,
		&status, &refundedAt, &refundReason, &voidedAt,
		&recBy, &updBy, &created, &updated); err != nil {
		return "", nil, err
	}
	var refundedAtMS, voidedAtMS any
	if refundedAt != nil {
		refundedAtMS = refundedAt.UnixMilli()
	}
	if voidedAt != nil {
		voidedAtMS = voidedAt.UnixMilli()
	}
	net := dec(amount).Sub(dec(refunded))
	return docID, map[string]any{
		"id":             id,
		"paymentNumber":  number,
		"paidAt":         paidAt.UnixMilli(),
		"method":         method,
		"amount":         dec(amount),
		"refundedAmount": dec(refunded),
		"netAmount":      net,
		"checkNumber":    check,
		"reference":      ref,
		"notes":          notes,
		"status":         status,
		"refundedAt":     refundedAtMS,
		"refundReason":   refundReason,
		"voidedAt":       voidedAtMS,
		"recordedBy":     recBy,
		"updatedBy":      updBy,
		"createdAt":      created.UnixMilli(),
		"updatedAt":      updated.UnixMilli(),
	}, nil
}

func (s *Server) paymentRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/documents/{id}/payments", s.auth("", s.listDocumentPayments))
	mux.HandleFunc("POST /api/documents/{id}/payments", s.auth("documents.edit", s.createPayment))
	mux.HandleFunc("PATCH /api/payments/{id}", s.auth("documents.edit", s.updatePayment))
	mux.HandleFunc("DELETE /api/payments/{id}", s.auth("documents.delete", s.voidPayment))
}

func (s *Server) listDocumentPayments(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	rows, err := s.db.Query(r.Context(), `SELECT `+paymentCols+` FROM payments p WHERE p.document_id::text = $1 AND p.company_id::text = $2 ORDER BY p.paid_at, p.payment_number`, r.PathValue("id"), cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		_, p, err := scanPayment(rows)
		if err != nil {
			handleErr(w, err)
			return
		}
		out = append(out, p)
	}
	writeJSON(w, 200, out)
}

type paymentInput struct {
	Method      string      `json:"method"`
	Amount      json.Number `json:"amount"`
	PaidAt      *int64      `json:"paidAt"`
	CheckNumber string      `json:"checkNumber"`
	Reference   string      `json:"reference"`
	Notes       string      `json:"notes"`
}

func (s *Server) createPayment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	u := userFrom(r.Context())
	var in paymentInput
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid JSON body.")
		return
	}
	ve := ValidationError{}
	if !slices.Contains(paymentMethods, in.Method) {
		ve["method"] = "Choose a payment method."
	}
	amt := dec(in.Amount.String())
	if amt.Sign() <= 0 {
		ve["amount"] = "Amount must be greater than zero."
	}
	if len(in.CheckNumber) > 100 || len(in.Reference) > 200 || len(in.Notes) > 2000 {
		ve["notes"] = "Text is too long."
	}
	if len(ve) > 0 {
		handleErr(w, ve)
		return
	}
	paidAt := time.Now().UTC()
	if in.PaidAt != nil {
		paidAt = time.UnixMilli(*in.PaidAt).UTC()
	}
	cid := u.CompanyID
	var out map[string]any
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		var exists bool
		if err := tx.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM documents WHERE id::text = $1 AND company_id::text = $2)`, id, cid).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return errStatus(404, "Document not found.")
		}
		var payID string
		if err := tx.QueryRow(r.Context(), `INSERT INTO payments (company_id, document_id, paid_at, method, amount, check_number, reference, notes, recorded_by, updated_by)
			VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING id::text`,
			cid, id, paidAt, in.Method, amt.StringFixed(2),
			strings.TrimSpace(in.CheckNumber), strings.TrimSpace(in.Reference), strings.TrimSpace(in.Notes), u.Name,
		).Scan(&payID); err != nil {
			return err
		}
		if err := recalcDocument(r.Context(), tx, id); err != nil {
			return err
		}
		_, p, err := scanPayment(tx.QueryRow(r.Context(), `SELECT `+paymentCols+` FROM payments p WHERE p.id::text = $1`, payID))
		if err != nil {
			return err
		}
		out = p
		return audit(r.Context(), tx, u, "payment", payID, "create", "amount", "", amt.StringFixed(2), u.CompanyID)
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 201, out)
}

type paymentPatch struct {
	RefundedAmount *json.Number `json:"refundedAmount"`
	RefundReason   *string      `json:"refundReason"`
	Status         *string      `json:"status"`
	Notes          *string      `json:"notes"`
	CheckNumber    *string      `json:"checkNumber"`
	Reference      *string      `json:"reference"`
}

func (s *Server) updatePayment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	u := userFrom(r.Context())
	var in paymentPatch
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid JSON body.")
		return
	}
	var out map[string]any
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		var docID, status, amount string
		if err := tx.QueryRow(r.Context(), `SELECT document_id::text, status, amount::text FROM payments WHERE id::text = $1 AND company_id::text = $2 FOR UPDATE`, id, u.CompanyID).
			Scan(&docID, &status, &amount); err != nil {
			return err
		}
		sets, args := []string{"updated_at = now()", "updated_by = $1"}, []any{u.Name}
		set := func(col string, v any) { args = append(args, v); sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args))) }
		ve := ValidationError{}
		if in.RefundedAmount != nil {
			ref := dec(in.RefundedAmount.String())
			amt := dec(amount)
			if ref.Sign() < 0 || ref.GreaterThan(amt) {
				ve["refundedAmount"] = "Refund cannot be negative or exceed the payment amount."
			} else {
				set("refunded_amount", ref.StringFixed(2))
				if ref.IsZero() {
					set("status", "completed")
					set("refunded_at", nil)
				} else if ref.Equal(amt) {
					set("status", "refunded")
					set("refunded_at", time.Now().UTC())
				} else {
					set("status", "partially_refunded")
					set("refunded_at", time.Now().UTC())
				}
			}
		}
		if in.RefundReason != nil {
			if len(*in.RefundReason) > 500 {
				ve["refundReason"] = "Too long."
			} else {
				set("refund_reason", strings.TrimSpace(*in.RefundReason))
			}
		}
		if in.Status != nil && *in.Status == "voided" && status != "voided" {
			set("status", "voided")
			set("voided_at", time.Now().UTC())
		}
		if in.Notes != nil {
			if len(*in.Notes) > 2000 {
				ve["notes"] = "Too long."
			} else {
				set("notes", strings.TrimSpace(*in.Notes))
			}
		}
		if in.CheckNumber != nil {
			if len(*in.CheckNumber) > 100 {
				ve["checkNumber"] = "Too long."
			} else {
				set("check_number", strings.TrimSpace(*in.CheckNumber))
			}
		}
		if in.Reference != nil {
			if len(*in.Reference) > 200 {
				ve["reference"] = "Too long."
			} else {
				set("reference", strings.TrimSpace(*in.Reference))
			}
		}
		if len(ve) > 0 {
			return ve
		}
		if len(sets) == 2 {
			return errStatus(400, "Nothing to update.")
		}
		args = append(args, id)
		if _, err := tx.Exec(r.Context(), fmt.Sprintf("UPDATE payments SET %s WHERE id::text = $%d", strings.Join(sets, ", "), len(args)), args...); err != nil {
			return err
		}
		if err := recalcDocument(r.Context(), tx, docID); err != nil {
			return err
		}
		_, p, err := scanPayment(tx.QueryRow(r.Context(), `SELECT `+paymentCols+` FROM payments p WHERE p.id::text = $1`, id))
		if err != nil {
			return err
		}
		out = p
		return audit(r.Context(), tx, u, "payment", id, "update", "", "", "", u.CompanyID)
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) voidPayment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	u := userFrom(r.Context())
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		var docID string
		if err := tx.QueryRow(r.Context(), `SELECT document_id::text FROM payments WHERE id::text = $1 AND company_id::text = $2 FOR UPDATE`, id, u.CompanyID).Scan(&docID); err != nil {
			return err
		}
		if _, err := tx.Exec(r.Context(), `UPDATE payments SET status = 'voided', voided_at = now(), updated_at = now(), updated_by = $2 WHERE id::text = $1 AND company_id::text = $3`, id, u.Name, u.CompanyID); err != nil {
			return err
		}
		if err := recalcDocument(r.Context(), tx, docID); err != nil {
			return err
		}
		return audit(r.Context(), tx, u, "payment", id, "delete", "status", "", "voided", u.CompanyID)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, 404, "Not found.")
			return
		}
		handleErr(w, err)
		return
	}
	w.WriteHeader(204)
}

func validPaymentStatus(s string) bool { return slices.Contains(paymentStatuses, s) }

package api

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
)

// Document totals computed with exact decimals from the document's own frozen
// settings snapshot. This is the authoritative calculation: results are stored on
// the document (and in document_lines / document_taxes / document_fees) and every
// report aggregates those stored values. The editor's live preview
// (src/lib/totals.js) follows the same rules; TestTotalsParity keeps them aligned.

const totalsVersion = 1

var (
	d0   = decimal.Zero
	d100 = decimal.NewFromInt(100)
)

func init() { decimal.MarshalJSONWithoutQuotes = true }

func dec(v any) decimal.Decimal {
	switch x := v.(type) {
	case nil:
		return d0
	case float64:
		return decimal.NewFromFloat(x)
	case int64:
		return decimal.NewFromInt(x)
	case int:
		return decimal.NewFromInt(int64(x))
	case json.Number:
		d, _ := decimal.NewFromString(x.String())
		return d
	case string:
		d, err := decimal.NewFromString(strings.TrimSpace(x))
		if err != nil {
			return d0
		}
		return d
	case decimal.Decimal:
		return x
	}
	return d0
}

func r2(d decimal.Decimal) decimal.Decimal { return d.Round(2) }
func isSet(v any) bool                     { return v != nil && v != "" }

type lineResult struct {
	Kind, Description, PartNumber, Vendor, Procedure string
	Qty, UnitPrice, UnitCost, Total, Cost             decimal.Decimal
}

type taxResult struct {
	ID          int64
	Name        string
	Rate        decimal.Decimal
	Base, Amount decimal.Decimal
}

type feeResult struct {
	ID     int64
	Name   string
	Amount decimal.Decimal
}

type DocTotals struct {
	Labor, Parts, Other, ShopFees, Discount, Subtotal, Tax, Total, PartsCost decimal.Decimal
	Lines                                                                   []lineResult
	Taxes                                                                   []taxResult
	Fees                                                                    []feeResult
}

func toID(v any) int64 { return dec(v).IntPart() }

// ComputeTotals implements the document math. Inputs are decoded JSON values.
func ComputeTotals(items []map[string]any, snap map[string]any, taxIDs, feesOff []int64) DocTotals {
	var t DocTotals
	base := map[string]decimal.Decimal{"labor": d0, "parts": d0, "fees": d0}
	taxable := map[string]decimal.Decimal{"labor": d0, "parts": d0, "fees": d0}
	cat := map[string]string{"labor": "labor", "part": "parts", "fee": "fees"}

	for _, it := range items {
		kind, _ := it["kind"].(string)
		l := lineResult{Kind: kind}
		l.Description, _ = it["description"].(string)
		l.PartNumber, _ = it["partNumber"].(string)
		l.Vendor, _ = it["vendor"].(string)
		l.Procedure, _ = it["procedure"].(string)
		if c, ok := cat[kind]; ok {
			l.Qty, l.UnitPrice, l.UnitCost = dec(it["qty"]), dec(it["price"]), dec(it["cost"])
			l.Total = r2(l.Qty.Mul(l.UnitPrice))
			if kind == "part" {
				l.Cost = r2(l.Qty.Mul(l.UnitCost))
				t.PartsCost = t.PartsCost.Add(l.Cost)
			}
			base[c] = base[c].Add(l.Total)
			if it["taxable"] == true {
				taxable[c] = taxable[c].Add(l.Total)
			}
		}
		t.Lines = append(t.Lines, l)
	}
	t.Labor, t.Parts, t.Other = base["labor"], base["parts"], base["fees"]

	// Discounts and their share per category (unrounded, used for tax bases)
	disc := map[string]decimal.Decimal{"labor": d0, "parts": d0, "fees": d0}
	for _, it := range items {
		if it["kind"] != "discount" {
			continue
		}
		v := dec(it["value"])
		target := base["labor"].Add(base["parts"]).Add(base["fees"])
		switch it["appliesTo"] {
		case "labor":
			target = base["labor"]
		case "parts":
			target = base["parts"]
		}
		amt := v
		if it["mode"] == "percent" {
			amt = target.Mul(v).Div(d100)
		}
		amt = r2(decimal.Min(amt, target))
		switch it["appliesTo"] {
		case "labor":
			disc["labor"] = disc["labor"].Add(amt)
		case "parts":
			disc["parts"] = disc["parts"].Add(amt)
		default:
			all := base["labor"].Add(base["parts"]).Add(base["fees"])
			if all.IsZero() {
				all = decimal.NewFromInt(1)
			}
			for _, c := range []string{"labor", "parts", "fees"} {
				disc[c] = disc[c].Add(amt.Mul(base[c]).DivRound(all, 16))
			}
		}
		t.Discount = t.Discount.Add(amt)
	}
	t.Discount = r2(t.Discount)

	// Shop fees from the snapshot
	hasWork := base["labor"].Add(base["parts"]).GreaterThan(d0)
	taxableFees := d0
	fees, _ := snap["fees"].([]any)
	for _, x := range fees {
		f, _ := x.(map[string]any)
		id := toID(f["id"])
		name, _ := f["name"].(string)
		amt := d0
		if hasWork && !slices.Contains(feesOff, id) {
			amt = CalcFee(f, base["labor"], base["parts"])
		}
		t.Fees = append(t.Fees, feeResult{ID: id, Name: name, Amount: amt})
		t.ShopFees = t.ShopFees.Add(amt)
		if f["taxable"] == true {
			taxableFees = taxableFees.Add(amt)
		}
	}

	// Taxes: each selected snapshot rate on the categories it applies to
	after := func(c string) decimal.Decimal {
		if base[c].IsZero() {
			return d0
		}
		return taxable[c].Mul(decimal.NewFromInt(1).Sub(disc[c].DivRound(base[c], 16)))
	}
	tl, tp, tf := after("labor"), after("parts"), after("fees").Add(taxableFees)
	taxes, _ := snap["taxes"].([]any)
	for _, x := range taxes {
		tx, _ := x.(map[string]any)
		id := toID(tx["id"])
		if !slices.Contains(taxIDs, id) {
			continue
		}
		b := d0
		if tx["appliesLabor"] == true {
			b = b.Add(tl)
		}
		if tx["appliesParts"] == true {
			b = b.Add(tp)
		}
		if tx["appliesFees"] == true {
			b = b.Add(tf)
		}
		b = decimal.Max(d0, r2(b))
		rate := dec(tx["rate"])
		name, _ := tx["name"].(string)
		amt := r2(b.Mul(rate).Div(d100))
		t.Taxes = append(t.Taxes, taxResult{ID: id, Name: name, Rate: rate, Base: b, Amount: amt})
		t.Tax = t.Tax.Add(amt)
	}

	t.Subtotal = r2(t.Labor.Add(t.Parts).Add(t.Other).Add(t.ShopFees).Sub(t.Discount))
	t.Total = r2(t.Subtotal.Add(t.Tax))
	return t
}

// CalcFee: amount fees use the amount; percentage fees are clamped to min/max.
func CalcFee(f map[string]any, labor, parts decimal.Decimal) decimal.Decimal {
	if f["calcBy"] == "amount" {
		return r2(dec(f["amount"]))
	}
	base := labor.Add(parts)
	switch f["appliesTo"] {
	case "labor":
		base = labor
	case "parts":
		base = parts
	}
	v := base.Mul(dec(f["percentage"])).Div(d100)
	if isSet(f["minimum"]) && v.LessThan(dec(f["minimum"])) {
		v = dec(f["minimum"])
	}
	if isSet(f["maximum"]) && v.GreaterThan(dec(f["maximum"])) {
		v = dec(f["maximum"])
	}
	return r2(v)
}

func paymentStatus(total, paid decimal.Decimal) string {
	switch {
	case paid.GreaterThan(total):
		return "overpaid"
	case paid.Equal(total):
		return "paid"
	case paid.GreaterThan(d0):
		return "partial"
	}
	return "unpaid"
}

// recalcDocument recomputes and stores totals, lines, taxes and fees for one document.
// Call inside the transaction that changed the document or its payments.
func recalcDocument(ctx context.Context, tx pgx.Tx, id string) error {
	var itemsRaw, snapRaw []byte
	var taxIDs, feesOff []int64
	if err := tx.QueryRow(ctx, `SELECT items, settings_snapshot, tax_ids, fees_off FROM documents WHERE id::text = $1 FOR UPDATE`, id).
		Scan(&itemsRaw, &snapRaw, &taxIDs, &feesOff); err != nil {
		return err
	}
	var items []map[string]any
	var snap map[string]any
	json.Unmarshal(itemsRaw, &items)
	json.Unmarshal(snapRaw, &snap)
	t := ComputeTotals(items, snap, taxIDs, feesOff)

	var paidText string
	if err := tx.QueryRow(ctx, `SELECT coalesce(sum(amount - refunded_amount), 0)::text FROM payments WHERE document_id::text = $1 AND status <> 'voided'`, id).Scan(&paidText); err != nil {
		return err
	}
	paid := dec(paidText)

	for _, q := range []string{"document_lines", "document_taxes", "document_fees"} {
		if _, err := tx.Exec(ctx, "DELETE FROM "+q+" WHERE document_id::text = $1", id); err != nil {
			return err
		}
	}
	if len(t.Lines) > 0 {
		var no []int
		var kind, desc, pn, vendor, proc, qty, price, cost, total, ctotal []string
		for i, l := range t.Lines {
			no = append(no, i+1)
			kind, desc, pn, vendor, proc = append(kind, l.Kind), append(desc, l.Description), append(pn, l.PartNumber), append(vendor, l.Vendor), append(proc, l.Procedure)
			qty, price, cost = append(qty, l.Qty.StringFixed(3)), append(price, r2(l.UnitPrice).StringFixed(2)), append(cost, r2(l.UnitCost).StringFixed(2))
			total, ctotal = append(total, l.Total.StringFixed(2)), append(ctotal, l.Cost.StringFixed(2))
		}
		if _, err := tx.Exec(ctx, `INSERT INTO document_lines (document_id, line_no, kind, description, part_number, vendor, procedure, quantity, unit_price, unit_cost, line_total, cost_total)
			SELECT $1::uuid, * FROM unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::numeric[], $9::numeric[], $10::numeric[], $11::numeric[], $12::numeric[])`,
			id, no, kind, desc, pn, vendor, proc, qty, price, cost, total, ctotal); err != nil {
			return fmt.Errorf("lines: %w", err)
		}
	}
	if len(t.Taxes) > 0 {
		var ids []int64
		var names, rates, bases, amts []string
		for _, x := range t.Taxes {
			ids, names, rates = append(ids, x.ID), append(names, x.Name), append(rates, x.Rate.StringFixed(4))
			bases, amts = append(bases, x.Base.StringFixed(2)), append(amts, x.Amount.StringFixed(2))
		}
		if _, err := tx.Exec(ctx, `INSERT INTO document_taxes (document_id, tax_id, name, rate, taxable_amount, tax_amount)
			SELECT $1::uuid, * FROM unnest($2::bigint[], $3::text[], $4::numeric[], $5::numeric[], $6::numeric[])`, id, ids, names, rates, bases, amts); err != nil {
			return fmt.Errorf("taxes: %w", err)
		}
	}
	if len(t.Fees) > 0 {
		var ids []int64
		var names, amts []string
		for _, f := range t.Fees {
			ids, names, amts = append(ids, f.ID), append(names, f.Name), append(amts, f.Amount.StringFixed(2))
		}
		if _, err := tx.Exec(ctx, `INSERT INTO document_fees (document_id, fee_id, name, amount)
			SELECT $1::uuid, * FROM unnest($2::bigint[], $3::text[], $4::numeric[])`, id, ids, names, amts); err != nil {
			return fmt.Errorf("fees: %w", err)
		}
	}
	_, err := tx.Exec(ctx, `UPDATE documents SET labor_total = $2, parts_total = $3, other_total = $4, shop_fees_total = $5,
		discount_total = $6, subtotal = $7, tax_total = $8, total = $9, paid_total = $10, balance = $11, parts_cost_total = $12,
		payment_status = $13, totals_version = $14 WHERE id::text = $1`,
		id, t.Labor.StringFixed(2), t.Parts.StringFixed(2), t.Other.StringFixed(2), t.ShopFees.StringFixed(2), t.Discount.StringFixed(2),
		t.Subtotal.StringFixed(2), t.Tax.StringFixed(2), t.Total.StringFixed(2), paid.StringFixed(2), t.Total.Sub(paid).StringFixed(2),
		r2(t.PartsCost).StringFixed(2), paymentStatus(t.Total, paid), totalsVersion)
	return err
}

// RecalcAll brings every document's stored totals up to the current calculation version.
func (s *Server) RecalcAll(ctx context.Context) error {
	rows, err := s.db.Query(ctx, `SELECT id::text FROM documents WHERE totals_version < $1`, totalsVersion)
	if err != nil {
		return err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	for _, id := range ids {
		if err := s.tx(ctx, func(tx pgx.Tx) error { return recalcDocument(ctx, tx, id) }); err != nil {
			return fmt.Errorf("recalc %s: %w", id, err)
		}
	}
	return nil
}

package api

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Reports read from the authoritative, stored per-document totals (totals.go),
// so every report reconciles with the invoices and payments it is derived from.
// Historical totals are not recomputed when settings change.

func (s *Server) reportRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/reports/sales/dashboard", s.auth("sales_reports.view", s.reportDashboard))
	mux.HandleFunc("GET /api/reports/sales/summary", s.auth("sales_reports.view", s.reportSalesSummary))
	mux.HandleFunc("GET /api/reports/sales/parts-profit", s.auth("sales_reports.view", s.reportPartsProfit))
	mux.HandleFunc("GET /api/reports/payments", s.auth("financial_reports.view", s.reportPayments))
	mux.HandleFunc("GET /api/reports/tax", s.auth("financial_reports.view", s.reportTax))
	mux.HandleFunc("GET /api/reports/customers", s.auth("sales_reports.view", s.reportCustomers))
	mux.HandleFunc("GET /api/reports/technicians", s.auth("sales_reports.view", s.reportTechnicians))
	mux.HandleFunc("GET /api/reports/service-writers", s.auth("sales_reports.view", s.reportWriters))
	mux.HandleFunc("GET /api/reports/payment-methods", s.auth("financial_reports.view", s.reportPaymentMethods))
	mux.HandleFunc("GET /api/reports/sales/invoices", s.auth("sales_reports.view", s.reportInvoices))
	mux.HandleFunc("POST /api/reports/export-log", s.auth("sales_reports.view", s.logReportExport))
}

// ---------------------------------------------------------------- filters

type reportFilter struct {
	From, To                       time.Time
	HasFrom, HasTo                 bool
	Customer, Technician, Writer   string
	PaymentMethod, InvoiceStatus   string
	TaxType, PartNumber            string
	Page, Limit                    int
	Sort                           string
}

func parseFilter(r *http.Request) reportFilter {
	q := r.URL.Query()
	f := reportFilter{
		Customer: q.Get("customer_id"), Technician: q.Get("technician_id"),
		Writer: q.Get("service_writer_id"), PaymentMethod: q.Get("payment_method"),
		InvoiceStatus: q.Get("invoice_status"), TaxType: q.Get("tax_type"),
		PartNumber: q.Get("part_number"), Sort: q.Get("sort"),
	}
	if s := q.Get("from"); s != "" {
		if t, err := parseDate(s); err == nil {
			f.From, f.HasFrom = t, true
		}
	}
	if s := q.Get("to"); s != "" {
		if t, err := parseDate(s); err == nil {
			f.To, f.HasTo = t.Add(24*time.Hour), true // inclusive end-of-day
		}
	}
	f.Page, _ = strconv.Atoi(q.Get("page"))
	f.Limit, _ = strconv.Atoi(q.Get("limit"))
	if f.Limit <= 0 || f.Limit > 1000 {
		f.Limit = 100
	}
	if f.Page < 1 {
		f.Page = 1
	}
	return f
}

func parseDate(s string) (time.Time, error) {
	for _, layout := range []string{"2006-01-02", time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid date %q", s)
}

// salesDateExpr is the "sale date" used by reports: invoice date when invoiced,
// otherwise the document's last update (so a paid estimate/RO shows up too).
const salesDateExpr = "coalesce(d.invoiced_at, d.updated_at)"

// salesWhere builds the common sales WHERE clause and args.
// Base: any non-voided document that is either an invoice OR has received payments.
// This lets paid repair orders / estimates show up in Sales & Revenue alongside invoices.
func salesWhere(f reportFilter) (string, []any) {
	w := []string{"d.status <> 'void'", "(d.type = 'invoice' OR d.paid_total > 0)"}
	a := []any{}
	add := func(sql string, v any) { a = append(a, v); w = append(w, fmt.Sprintf(sql, len(a))) }
	if f.HasFrom {
		add(salesDateExpr+" >= $%d", f.From)
	}
	if f.HasTo {
		add(salesDateExpr+" < $%d", f.To)
	}
	if f.Customer != "" {
		add("d.customer_id = $%d", f.Customer)
	}
	if f.Technician != "" {
		if id, err := strconv.ParseInt(f.Technician, 10, 64); err == nil {
			add("d.technician_id = $%d", id)
		}
	}
	if f.Writer != "" {
		if id, err := strconv.ParseInt(f.Writer, 10, 64); err == nil {
			add("d.writer_id = $%d", id)
		}
	}
	if f.InvoiceStatus != "" {
		add("d.status = $%d", f.InvoiceStatus)
	}
	return strings.Join(w, " AND "), a
}

// ---------------------------------------------------------------- summary

func (s *Server) reportSalesSummary(w http.ResponseWriter, r *http.Request) {
	f := parseFilter(r)
	where, args := salesWhere(f)

	var out = map[string]any{}
	// Totals + counts
	var totSales, totInvoiced, totPaid, totBalance string
	var totParts, totLabor, totOther, totDisc, totFees, totTax string
	var numInv, numCust int64
	err := s.db.QueryRow(r.Context(), `
		SELECT coalesce(sum(d.total),0)::text,
			   coalesce(sum(d.total),0)::text,
			   coalesce(sum(d.paid_total),0)::text,
			   coalesce(sum(d.balance),0)::text,
			   coalesce(sum(d.parts_total),0)::text,
			   coalesce(sum(d.labor_total),0)::text,
			   coalesce(sum(d.other_total),0)::text,
			   coalesce(sum(d.discount_total),0)::text,
			   coalesce(sum(d.shop_fees_total),0)::text,
			   coalesce(sum(d.tax_total),0)::text,
			   count(*)::bigint,
			   count(distinct nullif(d.customer_id, ''))::bigint
		FROM documents d WHERE `+where, args...).Scan(
		&totSales, &totInvoiced, &totPaid, &totBalance,
		&totParts, &totLabor, &totOther, &totDisc, &totFees, &totTax,
		&numInv, &numCust)
	if err != nil {
		handleErr(w, err)
		return
	}
	avgInv, avgCust := "0", "0"
	if numInv > 0 {
		avgInv = dec(totSales).Div(dec(numInv)).StringFixed(2)
	}
	if numCust > 0 {
		avgCust = dec(totSales).Div(dec(numCust)).StringFixed(2)
	}
	out["totals"] = map[string]any{
		"totalSales": dec(totSales), "totalInvoiced": dec(totInvoiced),
		"totalPaid": dec(totPaid), "outstandingBalance": dec(totBalance),
		"totalParts": dec(totParts), "totalLabor": dec(totLabor),
		"totalOther": dec(totOther), "totalDiscounts": dec(totDisc),
		"totalShopFees": dec(totFees), "totalTaxes": dec(totTax),
		"numberOfInvoices": numInv, "numberOfCustomers": numCust,
		"averageSalePerInvoice": dec(avgInv), "averageSalePerCustomer": dec(avgCust),
	}

	out["byDate"], err = groupedSales(r.Context(), s.db, where, args, "to_char(date_trunc('day', "+salesDateExpr+"), 'YYYY-MM-DD')", "day")
	if err != nil {
		handleErr(w, err)
		return
	}
	out["byMonth"], err = groupedSales(r.Context(), s.db, where, args, "to_char(date_trunc('month', "+salesDateExpr+"), 'YYYY-MM')", "month")
	if err != nil {
		handleErr(w, err)
		return
	}
	out["byYear"], err = groupedSales(r.Context(), s.db, where, args, "to_char(date_trunc('year', "+salesDateExpr+"), 'YYYY')", "year")
	if err != nil {
		handleErr(w, err)
		return
	}
	out["byTechnician"], err = groupedByStaff(r.Context(), s.db, where, args, "d.technician_id", "d.technician_name")
	if err != nil {
		handleErr(w, err)
		return
	}
	out["byServiceWriter"], err = groupedByStaff(r.Context(), s.db, where, args, "d.writer_id", "d.writer_name")
	if err != nil {
		handleErr(w, err)
		return
	}
	out["byPaymentMethod"], err = paymentsByMethod(r.Context(), s.db, f)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}

func groupedSales(ctx context.Context, db queryer, where string, args []any, bucket, label string) ([]map[string]any, error) {
	rows, err := db.Query(ctx, `
		SELECT `+bucket+` AS bucket,
			   coalesce(sum(d.total),0)::text,
			   coalesce(sum(d.parts_total),0)::text,
			   coalesce(sum(d.labor_total),0)::text,
			   coalesce(sum(d.tax_total),0)::text,
			   count(*)::bigint
		FROM documents d WHERE `+where+`
		GROUP BY bucket ORDER BY bucket`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var b, tot, p, l, t string
		var n int64
		if err := rows.Scan(&b, &tot, &p, &l, &t, &n); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{label: b, "total": dec(tot), "parts": dec(p), "labor": dec(l), "tax": dec(t), "count": n})
	}
	return out, rows.Err()
}

func groupedByStaff(ctx context.Context, db queryer, where string, args []any, idCol, nameCol string) ([]map[string]any, error) {
	rows, err := db.Query(ctx, `
		SELECT `+idCol+`, coalesce(nullif(`+nameCol+`, ''), 'Unassigned'),
			   coalesce(sum(d.total),0)::text,
			   coalesce(sum(d.labor_total),0)::text,
			   coalesce(sum(d.parts_total),0)::text,
			   count(*)::bigint
		FROM documents d WHERE `+where+`
		GROUP BY `+idCol+`, `+nameCol+` ORDER BY sum(d.total) DESC NULLS LAST`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id *int64
		var name, tot, lab, par string
		var n int64
		if err := rows.Scan(&id, &name, &tot, &lab, &par, &n); err != nil {
			return nil, err
		}
		avg := "0"
		if n > 0 {
			avg = dec(tot).Div(dec(n)).StringFixed(2)
		}
		out = append(out, map[string]any{"id": id, "name": name, "total": dec(tot), "labor": dec(lab), "parts": dec(par), "repairOrders": n, "avgRO": dec(avg)})
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------- parts profit

func (s *Server) reportPartsProfit(w http.ResponseWriter, r *http.Request) {
	f := parseFilter(r)
	where, args := salesWhere(f)
	if f.PartNumber != "" {
		args = append(args, f.PartNumber)
		where += fmt.Sprintf(" AND l.part_number ILIKE $%d", len(args))
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT l.part_number, l.description, l.vendor,
			   l.quantity::text, l.unit_cost::text, l.unit_price::text,
			   l.cost_total::text, l.line_total::text,
			   d.display_number, d.customer_snapshot, d.vehicle_snapshot,
			   `+salesDateExpr+`, coalesce(d.technician_name, '')
		FROM document_lines l JOIN documents d ON d.id = l.document_id
		WHERE l.kind = 'part' AND `+where+`
		ORDER BY `+salesDateExpr+` DESC, l.line_no`, args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	lines := []map[string]any{}
	var totCost, totRev string = "0", "0"
	for rows.Next() {
		var pn, desc, vend, qty, uc, up, ct, lt, inv, tech string
		var cust, veh []byte
		var at time.Time
		if err := rows.Scan(&pn, &desc, &vend, &qty, &uc, &up, &ct, &lt, &inv, &cust, &veh, &at, &tech); err != nil {
			handleErr(w, err)
			return
		}
		cost, rev := dec(ct), dec(lt)
		profit := rev.Sub(cost)
		margin := "0"
		if !rev.IsZero() {
			margin = profit.Div(rev).Mul(dec("100")).StringFixed(2)
		}
		totCost = dec(totCost).Add(cost).StringFixed(2)
		totRev = dec(totRev).Add(rev).StringFixed(2)
		lines = append(lines, map[string]any{
			"partNumber": pn, "description": desc, "vendor": vend,
			"quantity": dec(qty), "unitCost": dec(uc), "unitPrice": dec(up),
			"totalCost": cost, "totalSales": rev, "profit": profit, "marginPct": dec(margin),
			"invoiceNumber": inv, "customer": string(cust), "vehicle": string(veh),
			"invoiceDate": at.UnixMilli(), "technician": tech,
		})
	}
	totProfit := dec(totRev).Sub(dec(totCost)).StringFixed(2)
	avgMargin := "0"
	if !dec(totRev).IsZero() {
		avgMargin = dec(totProfit).Div(dec(totRev)).Mul(dec("100")).StringFixed(2)
	}
	writeJSON(w, 200, map[string]any{
		"lines": lines,
		"totals": map[string]any{
			"totalCost": dec(totCost), "totalRevenue": dec(totRev),
			"totalProfit": dec(totProfit), "averageMarginPct": dec(avgMargin),
		},
	})
}

// ---------------------------------------------------------------- payments

func (s *Server) reportPayments(w http.ResponseWriter, r *http.Request) {
	f := parseFilter(r)
	w2 := []string{"1=1"}
	a := []any{}
	add := func(sql string, v any) { a = append(a, v); w2 = append(w2, fmt.Sprintf(sql, len(a))) }
	if f.HasFrom {
		add("p.paid_at >= $%d", f.From)
	}
	if f.HasTo {
		add("p.paid_at < $%d", f.To)
	}
	if f.PaymentMethod != "" {
		add("p.method = $%d", f.PaymentMethod)
	}
	if f.Customer != "" {
		add("d.customer_id = $%d", f.Customer)
	}
	where := strings.Join(w2, " AND ")
	rows, err := s.db.Query(r.Context(), `
		SELECT p.id::text, p.payment_number, p.paid_at, p.method,
			   p.amount::text, p.refunded_amount::text,
			   p.check_number, p.reference, p.notes, p.status, p.recorded_by,
			   d.display_number, d.customer_snapshot, d.vehicle_snapshot
		FROM payments p JOIN documents d ON d.id = p.document_id
		WHERE `+where+` ORDER BY p.paid_at DESC, p.payment_number DESC LIMIT 5000`, a...)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	methodTotals := map[string]any{}
	for _, m := range paymentMethods {
		methodTotals[m] = dec("0")
	}
	var tot, refTot string = "0", "0"
	for rows.Next() {
		var id, method, check, ref, notes, status, by, inv string
		var num int64
		var amt, refunded string
		var at time.Time
		var cust, veh []byte
		if err := rows.Scan(&id, &num, &at, &method, &amt, &refunded, &check, &ref, &notes, &status, &by, &inv, &cust, &veh); err != nil {
			handleErr(w, err)
			return
		}
		net := dec(amt).Sub(dec(refunded))
		if status != "voided" {
			tot = dec(tot).Add(net).StringFixed(2)
			refTot = dec(refTot).Add(dec(refunded)).StringFixed(2)
			if _, ok := methodTotals[method]; !ok {
				methodTotals[method] = dec("0")
			}
			methodTotals[method] = dec(methodTotals[method]).Add(net)
		}
		list = append(list, map[string]any{
			"id": id, "paymentNumber": num, "paidAt": at.UnixMilli(), "method": method,
			"amount": dec(amt), "refundedAmount": dec(refunded), "netAmount": net,
			"checkNumber": check, "reference": ref, "notes": notes, "status": status,
			"recordedBy": by, "invoiceNumber": inv,
			"customer": string(cust), "vehicle": string(veh),
		})
	}
	writeJSON(w, 200, map[string]any{
		"payments": list,
		"totals": map[string]any{
			"totalPayments": dec(tot), "refunds": dec(refTot), "netPayments": dec(tot),
			"byMethod": methodTotals,
		},
	})
}

func paymentsByMethod(ctx context.Context, db queryer, f reportFilter) ([]map[string]any, error) {
	w2 := []string{"p.status <> 'voided'"}
	a := []any{}
	add := func(sql string, v any) { a = append(a, v); w2 = append(w2, fmt.Sprintf(sql, len(a))) }
	if f.HasFrom {
		add("p.paid_at >= $%d", f.From)
	}
	if f.HasTo {
		add("p.paid_at < $%d", f.To)
	}
	rows, err := db.Query(ctx, `
		SELECT p.method,
			   coalesce(sum(p.amount - p.refunded_amount), 0)::text,
			   count(*)::bigint
		FROM payments p WHERE `+strings.Join(w2, " AND ")+`
		GROUP BY p.method ORDER BY p.method`, a...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var m, amt string
		var n int64
		if err := rows.Scan(&m, &amt, &n); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"method": m, "amount": dec(amt), "count": n})
	}
	return out, rows.Err()
}

func (s *Server) reportPaymentMethods(w http.ResponseWriter, r *http.Request) {
	f := parseFilter(r)
	out, err := paymentsByMethod(r.Context(), s.db, f)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}

// ---------------------------------------------------------------- tax

func (s *Server) reportTax(w http.ResponseWriter, r *http.Request) {
	f := parseFilter(r)
	where, args := salesWhere(f)
	if f.TaxType != "" {
		args = append(args, f.TaxType)
		where += fmt.Sprintf(" AND t.name = $%d", len(args))
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT `+salesDateExpr+`, d.display_number, d.customer_snapshot,
			   t.name, t.rate::text, t.taxable_amount::text, t.tax_amount::text, d.status
		FROM document_taxes t JOIN documents d ON d.id = t.document_id
		WHERE `+where+`
		ORDER BY `+salesDateExpr+` DESC LIMIT 5000`, args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	entries := []map[string]any{}
	var totBase, totTax string = "0", "0"
	byType := map[string]map[string]any{}
	for rows.Next() {
		var at time.Time
		var inv, name, rate, base, amt, status string
		var cust []byte
		if err := rows.Scan(&at, &inv, &cust, &name, &rate, &base, &amt, &status); err != nil {
			handleErr(w, err)
			return
		}
		entries = append(entries, map[string]any{
			"taxDate": at.UnixMilli(), "invoiceNumber": inv, "customer": string(cust),
			"taxType": name, "taxRate": dec(rate), "taxableAmount": dec(base),
			"taxCollected": dec(amt), "status": status,
		})
		totBase = dec(totBase).Add(dec(base)).StringFixed(2)
		totTax = dec(totTax).Add(dec(amt)).StringFixed(2)
		b, ok := byType[name]
		if !ok {
			b = map[string]any{"taxType": name, "rate": dec(rate), "taxable": dec("0"), "collected": dec("0")}
			byType[name] = b
		}
		b["taxable"] = dec(b["taxable"]).Add(dec(base))
		b["collected"] = dec(b["collected"]).Add(dec(amt))
	}
	byTypeList := []map[string]any{}
	for _, v := range byType {
		byTypeList = append(byTypeList, v)
	}

	byMonth, err := taxByBucket(r.Context(), s.db, where, args, "to_char(date_trunc('month', "+salesDateExpr+"), 'YYYY-MM')", "month")
	if err != nil {
		handleErr(w, err)
		return
	}
	byYear, err := taxByBucket(r.Context(), s.db, where, args, "to_char(date_trunc('year', "+salesDateExpr+"), 'YYYY')", "year")
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{
		"entries": entries,
		"totals": map[string]any{
			"totalTaxableSales": dec(totBase), "totalTaxCollected": dec(totTax),
			"byType": byTypeList, "byMonth": byMonth, "byYear": byYear,
		},
	})
}

func taxByBucket(ctx context.Context, db queryer, where string, args []any, bucket, label string) ([]map[string]any, error) {
	rows, err := db.Query(ctx, `
		SELECT `+bucket+`,
			   coalesce(sum(t.taxable_amount),0)::text,
			   coalesce(sum(t.tax_amount),0)::text
		FROM document_taxes t JOIN documents d ON d.id = t.document_id
		WHERE `+where+` GROUP BY 1 ORDER BY 1`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var b, base, amt string
		if err := rows.Scan(&b, &base, &amt); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{label: b, "taxable": dec(base), "collected": dec(amt)})
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------- customers

func (s *Server) reportCustomers(w http.ResponseWriter, r *http.Request) {
	f := parseFilter(r)
	where, args := salesWhere(f)
	rows, err := s.db.Query(r.Context(), `
		SELECT coalesce(nullif(d.customer_id, ''), '(unknown)') AS cid,
			   coalesce(d.customer_snapshot ->> 'name', d.customer_snapshot ->> 'firstName' || ' ' || (d.customer_snapshot ->> 'lastName'), '(unknown)') AS name,
			   count(*)::bigint, coalesce(sum(d.total),0)::text, coalesce(sum(d.paid_total),0)::text,
			   coalesce(sum(d.balance),0)::text, coalesce(min(`+salesDateExpr+`), now()), coalesce(max(`+salesDateExpr+`), now())
		FROM documents d WHERE `+where+`
		GROUP BY cid, name ORDER BY sum(d.total) DESC NULLS LAST LIMIT 500`, args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var cid, name, tot, paid, bal string
		var n int64
		var first, last time.Time
		if err := rows.Scan(&cid, &name, &n, &tot, &paid, &bal, &first, &last); err != nil {
			handleErr(w, err)
			return
		}
		avg := "0"
		if n > 0 {
			avg = dec(tot).Div(dec(n)).StringFixed(2)
		}
		list = append(list, map[string]any{
			"customerId": cid, "name": strings.TrimSpace(name), "invoices": n,
			"totalSales": dec(tot), "totalPaid": dec(paid), "balance": dec(bal),
			"averageInvoice": dec(avg), "firstInvoice": first.UnixMilli(), "lastInvoice": last.UnixMilli(),
		})
	}

	// New vs returning: customer's first invoice ever vs within the window.
	var newC, retC int64
	if f.HasFrom && f.HasTo {
		if err := s.db.QueryRow(r.Context(), `
			WITH firsts AS (
				SELECT d.customer_id, min(`+salesDateExpr+`) AS first_at
				FROM documents d WHERE d.status <> 'void' AND (d.type='invoice' OR d.paid_total > 0) AND nullif(d.customer_id,'') IS NOT NULL
				GROUP BY d.customer_id
			), inrange AS (
				SELECT DISTINCT d.customer_id FROM documents d
				WHERE d.status <> 'void' AND (d.type='invoice' OR d.paid_total > 0) AND d.customer_id <> ''
				  AND `+salesDateExpr+` >= $1 AND `+salesDateExpr+` < $2
			)
			SELECT count(*) FILTER (WHERE f.first_at >= $1 AND f.first_at < $2),
				   count(*) FILTER (WHERE f.first_at < $1)
			FROM inrange i JOIN firsts f USING (customer_id)`, f.From, f.To).Scan(&newC, &retC); err != nil {
			handleErr(w, err)
			return
		}
	}
	writeJSON(w, 200, map[string]any{
		"customers":          list,
		"newCustomers":       newC,
		"returningCustomers": retC,
	})
}

// ---------------------------------------------------------------- technicians / writers

func (s *Server) reportTechnicians(w http.ResponseWriter, r *http.Request) {
	f := parseFilter(r)
	where, args := salesWhere(f)
	out, err := groupedByStaff(r.Context(), s.db, where, args, "d.technician_id", "d.technician_name")
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) reportWriters(w http.ResponseWriter, r *http.Request) {
	f := parseFilter(r)
	where, args := salesWhere(f)
	out, err := groupedByStaff(r.Context(), s.db, where, args, "d.writer_id", "d.writer_name")
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}

// ---------------------------------------------------------------- invoice table

func (s *Server) reportInvoices(w http.ResponseWriter, r *http.Request) {
	f := parseFilter(r)
	where, args := salesWhere(f)
	// Pagination
	offset := (f.Page - 1) * f.Limit
	args2 := append([]any{}, args...)
	args2 = append(args2, f.Limit, offset)
	rows, err := s.db.Query(r.Context(), `
		SELECT d.id::text, d.display_number, `+salesDateExpr+`,
			   d.customer_snapshot, d.vehicle_snapshot,
			   d.parts_total::text, d.labor_total::text, d.shop_fees_total::text,
			   d.discount_total::text, d.tax_total::text, d.total::text,
			   d.paid_total::text, d.balance::text, d.payment_status, d.status
		FROM documents d WHERE `+where+`
		ORDER BY `+salesDateExpr+` DESC LIMIT $`+strconv.Itoa(len(args)+1)+` OFFSET $`+strconv.Itoa(len(args)+2), args2...)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id, inv, parts, labor, fees, disc, tax, tot, paid, bal, pst, st string
		var cust, veh []byte
		var at time.Time
		if err := rows.Scan(&id, &inv, &at, &cust, &veh, &parts, &labor, &fees, &disc, &tax, &tot, &paid, &bal, &pst, &st); err != nil {
			handleErr(w, err)
			return
		}
		list = append(list, map[string]any{
			"id": id, "invoiceNumber": inv, "date": at.UnixMilli(),
			"customer": string(cust), "vehicle": string(veh),
			"parts": dec(parts), "labor": dec(labor), "fees": dec(fees),
			"discount": dec(disc), "tax": dec(tax), "total": dec(tot),
			"paid": dec(paid), "balance": dec(bal), "paymentStatus": pst, "status": st,
		})
	}
	var total int64
	if err := s.db.QueryRow(r.Context(), `SELECT count(*) FROM documents d WHERE `+where, args...).Scan(&total); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"invoices": list, "page": f.Page, "limit": f.Limit, "total": total})
}

// ---------------------------------------------------------------- dashboard

func (s *Server) reportDashboard(w http.ResponseWriter, r *http.Request) {
	f := parseFilter(r)
	ctx := r.Context()
	now := time.Now().UTC()
	if !f.HasFrom || !f.HasTo {
		f.From = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		f.To = f.From.AddDate(0, 1, 0)
		f.HasFrom, f.HasTo = true, true
	}
	where, args := salesWhere(f)

	// KPIs
	var periodSales, periodTax string
	var custCount, invCount int64
	if err := s.db.QueryRow(ctx, `SELECT coalesce(sum(d.total),0)::text, coalesce(sum(d.tax_total),0)::text,
		count(distinct nullif(d.customer_id,''))::bigint, count(*)::bigint
		FROM documents d WHERE `+where, args...).Scan(&periodSales, &periodTax, &custCount, &invCount); err != nil {
		handleErr(w, err)
		return
	}

	// Month / previous month / year / previous year comparisons
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	prevMonth := monthStart.AddDate(0, -1, 0)
	yearStart := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
	prevYear := yearStart.AddDate(-1, 0, 0)

	totalBetween := func(a, b time.Time) (string, error) {
		var t string
		err := s.db.QueryRow(ctx, `SELECT coalesce(sum(d.total),0)::text FROM documents d
			WHERE d.status <> 'void' AND (d.type='invoice' OR d.paid_total > 0)
			  AND `+salesDateExpr+` >= $1 AND `+salesDateExpr+` < $2`, a, b).Scan(&t)
		return t, err
	}
	mSales, err := totalBetween(monthStart, monthStart.AddDate(0, 1, 0))
	if err != nil {
		handleErr(w, err)
		return
	}
	pmSales, err := totalBetween(prevMonth, monthStart)
	if err != nil {
		handleErr(w, err)
		return
	}
	ySales, err := totalBetween(yearStart, yearStart.AddDate(1, 0, 0))
	if err != nil {
		handleErr(w, err)
		return
	}
	pySales, err := totalBetween(prevYear, yearStart)
	if err != nil {
		handleErr(w, err)
		return
	}

	days := int(f.To.Sub(f.From).Hours() / 24)
	if days < 1 {
		days = 1
	}
	dailyAvg := dec(periodSales).Div(dec(int64(days))).StringFixed(2)

	// Months span of selected period for "avg customers / month"
	months := monthsBetween(f.From, f.To)
	if months < 1 {
		months = 1
	}
	avgCustMonth := dec(custCount).Div(dec(int64(months))).StringFixed(2)

	// Monthly series last 12 months
	twelveStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, -11, 0)
	monthlyRows, err := groupedSales(ctx, s.db,
		"d.status <> 'void' AND (d.type='invoice' OR d.paid_total > 0) AND "+salesDateExpr+" >= $1",
		[]any{twelveStart},
		"to_char(date_trunc('month', "+salesDateExpr+"), 'YYYY-MM')", "month")
	if err != nil {
		handleErr(w, err)
		return
	}

	// Daily series for the selected period (grouped to week if > 60 days)
	dailyBucket := "to_char(date_trunc('day', " + salesDateExpr + "), 'YYYY-MM-DD')"
	dailyLabel := "day"
	if days > 60 {
		dailyBucket = "to_char(date_trunc('week', " + salesDateExpr + "), 'YYYY-MM-DD')"
		dailyLabel = "week"
	}
	if days > 365 {
		dailyBucket = "to_char(date_trunc('month', " + salesDateExpr + "), 'YYYY-MM')"
		dailyLabel = "month"
	}
	daily, err := groupedSales(ctx, s.db, where, args, dailyBucket, dailyLabel)
	if err != nil {
		handleErr(w, err)
		return
	}

	// Sales breakdown
	var tParts, tLabor, tFees, tOther, tTax string
	if err := s.db.QueryRow(ctx, `SELECT coalesce(sum(d.parts_total),0)::text, coalesce(sum(d.labor_total),0)::text,
		coalesce(sum(d.shop_fees_total),0)::text, coalesce(sum(d.other_total),0)::text, coalesce(sum(d.tax_total),0)::text
		FROM documents d WHERE `+where, args...).Scan(&tParts, &tLabor, &tFees, &tOther, &tTax); err != nil {
		handleErr(w, err)
		return
	}
	breakdown := []map[string]any{
		{"category": "Parts", "amount": dec(tParts)},
		{"category": "Labor", "amount": dec(tLabor)},
		{"category": "Shop Fees", "amount": dec(tFees)},
		{"category": "Other", "amount": dec(tOther)},
		{"category": "Tax", "amount": dec(tTax)},
	}

	// Top parts
	topParts, err := s.topParts(ctx, where, args, 10)
	if err != nil {
		handleErr(w, err)
		return
	}

	// Top customers (reuse report)
	byTech, _ := groupedByStaff(ctx, s.db, where, args, "d.technician_id", "d.technician_name")
	byWriter, _ := groupedByStaff(ctx, s.db, where, args, "d.writer_id", "d.writer_name")
	byMethod, _ := paymentsByMethod(ctx, s.db, f)
	taxByMonth, _ := taxByBucket(ctx, s.db, where, args, "to_char(date_trunc('month', "+salesDateExpr+"), 'YYYY-MM')", "month")

	writeJSON(w, 200, map[string]any{
		"kpis": map[string]any{
			"monthlySales":            dec(mSales),
			"previousMonthlySales":    dec(pmSales),
			"dailyAverageSales":       dec(dailyAvg),
			"selectedPeriodDays":      days,
			"monthlyAverageCustomers": dec(avgCustMonth),
			"currentMonthCustomers":   custCount,
			"yearlySales":             dec(ySales),
			"previousYearlySales":     dec(pySales),
			"taxCollectedPeriod":      dec(periodTax),
			"taxCollectedMonth":       taxBetween(ctx, s.db, monthStart, monthStart.AddDate(0, 1, 0)),
			"taxCollectedYear":        taxBetween(ctx, s.db, yearStart, yearStart.AddDate(1, 0, 0)),
			"invoiceCount":            invCount,
			"periodSales":             dec(periodSales),
		},
		"monthlySales":       monthlyRows,
		"dailySales":         daily,
		"dailyLabel":         dailyLabel,
		"salesBreakdown":     breakdown,
		"paymentMethods":     byMethod,
		"technicianSales":    byTech,
		"serviceWriterSales": byWriter,
		"taxByMonth":         taxByMonth,
		"topParts":           topParts,
		"from":               f.From.UnixMilli(),
		"to":                 f.To.UnixMilli(),
	})
}

func taxBetween(ctx context.Context, db queryer, a, b time.Time) any {
	var t string
	_ = db.QueryRow(ctx, `SELECT coalesce(sum(d.tax_total),0)::text FROM documents d
		WHERE d.status <> 'void' AND (d.type='invoice' OR d.paid_total > 0)
		  AND `+salesDateExpr+` >= $1 AND `+salesDateExpr+` < $2`, a, b).Scan(&t)
	return dec(t)
}

func monthsBetween(a, b time.Time) int {
	m := (b.Year()-a.Year())*12 + int(b.Month()-a.Month())
	if m < 1 {
		m = 1
	}
	return m
}

func (s *Server) topParts(ctx context.Context, where string, args []any, limit int) ([]map[string]any, error) {
	rows, err := s.db.Query(ctx, `
		SELECT l.part_number, max(l.description),
			   sum(l.quantity)::text, sum(l.cost_total)::text, sum(l.line_total)::text
		FROM document_lines l JOIN documents d ON d.id = l.document_id
		WHERE l.kind = 'part' AND l.part_number <> '' AND `+where+`
		GROUP BY l.part_number ORDER BY sum(l.line_total) DESC NULLS LAST LIMIT `+strconv.Itoa(limit), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var pn, desc, qty, cost, rev string
		if err := rows.Scan(&pn, &desc, &qty, &cost, &rev); err != nil {
			return nil, err
		}
		profit := dec(rev).Sub(dec(cost))
		margin := "0"
		if !dec(rev).IsZero() {
			margin = profit.Div(dec(rev)).Mul(dec("100")).StringFixed(2)
		}
		out = append(out, map[string]any{
			"partNumber": pn, "description": desc, "quantity": dec(qty),
			"revenue": dec(rev), "cost": dec(cost), "profit": profit, "marginPct": dec(margin),
		})
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------- export audit

type exportLog struct {
	Report    string `json:"report"`
	Format    string `json:"format"`
	From      string `json:"from"`
	To        string `json:"to"`
	FiltersJS string `json:"filters"`
}

func (s *Server) logReportExport(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in exportLog
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid JSON body.")
		return
	}
	if in.Report == "" || len(in.Report) > 80 || len(in.Format) > 20 {
		writeErr(w, 400, "Invalid export log.")
		return
	}
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		details := strings.TrimSpace(fmt.Sprintf("from=%s to=%s filters=%s", in.From, in.To, in.FiltersJS))
		return audit(r.Context(), tx, u, "report", in.Report, "export", in.Format, "", details)
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	w.WriteHeader(204)
}

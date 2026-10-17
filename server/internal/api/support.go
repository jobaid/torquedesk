package api

// Technical Support / Service Desk.
//
// Shop managers submit tickets from the shop UI; the SaaS Owner reads and
// replies from the Owner Service Desk. One backend file to keep the surface
// small — DB access, routes, email, and audit all live here.
//
// Deferred (not shipped this pass): file attachments, knowledge base,
// reusable response templates, business-hours/holiday SLA engine (we ship
// wall-clock deadlines), signed one-time ticket links, delivery-status
// pass-through from the email provider.

import (
	"context"
	"errors"
	"fmt"
	"html"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var supportCategories = []string{
	"login_auth", "subscription_billing", "payments_stripe", "permissions",
	"customers", "vehicles", "inspections", "estimates_orders",
	"invoices_payments", "reports", "email_notifications", "application_errors",
	"performance", "backup_restore", "data_import_export", "feature_request",
	"other",
}

var supportPriorities = map[string]bool{"low": true, "normal": true, "high": true, "urgent": true}

var supportStatuses = map[string]bool{
	"open": true, "assigned": true, "in_progress": true,
	"awaiting_customer": true, "awaiting_internal": true,
	"resolved": true, "closed": true,
}

// Wall-clock SLA defaults — in hours — applied at ticket creation time.
// Not business-hours aware; see "Deferred" note above.
var slaResponseHours = map[string]int{"urgent": 1, "high": 2, "normal": 8, "low": 24}
var slaResolveHours = map[string]int{"urgent": 4, "high": 24, "normal": 72, "low": 120}

func (s *Server) supportRoutes(mux *http.ServeMux) {
	// Shop (any authenticated shop user)
	mux.HandleFunc("GET /api/support/categories", s.auth("", s.listSupportCategories))
	mux.HandleFunc("GET /api/support/tickets", s.auth("", s.listShopTickets))
	mux.HandleFunc("POST /api/support/tickets", s.auth("", s.createShopTicket))
	mux.HandleFunc("GET /api/support/tickets/{id}", s.auth("", s.getShopTicket))
	mux.HandleFunc("POST /api/support/tickets/{id}/messages", s.auth("", s.shopReplyToTicket))
	mux.HandleFunc("POST /api/support/tickets/{id}/reopen", s.auth("", s.shopReopenTicket))

	// Owner Service Desk
	mux.HandleFunc("GET /api/owner/support/stats", s.ownerAuth(s.ownerSupportStats))
	mux.HandleFunc("GET /api/owner/support/tickets", s.ownerAuth(s.ownerListTickets))
	mux.HandleFunc("GET /api/owner/support/tickets/{id}", s.ownerAuth(s.ownerGetTicket))
	mux.HandleFunc("PATCH /api/owner/support/tickets/{id}", s.ownerAuth(s.ownerUpdateTicket))
	mux.HandleFunc("POST /api/owner/support/tickets/{id}/messages", s.ownerAuth(s.ownerReplyToTicket))
	mux.HandleFunc("GET /api/owner/support/admins", s.ownerAuth(s.ownerListSupportAdmins))
}

// --------------------------------------------------- categories

func (s *Server) listSupportCategories(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, supportCategories)
}

// --------------------------------------------------- ticket number

// nextTicketNumber reserves the next per-day sequence atomically.
// Format: TD-SUP-YYYYMMDD-NNNN (zero-padded to 4; grows past 9999 naturally).
func (s *Server) nextTicketNumber(ctx context.Context, tx pgx.Tx) (string, error) {
	day := time.Now().UTC().Format("2006-01-02")
	var seq int
	err := tx.QueryRow(ctx, `
		INSERT INTO support_ticket_counters (day, next_seq) VALUES ($1::date, 1)
		ON CONFLICT (day) DO UPDATE SET next_seq = support_ticket_counters.next_seq + 1
		RETURNING next_seq`, day).Scan(&seq)
	if err != nil {
		return "", err
	}
	stamp := strings.ReplaceAll(day, "-", "")
	return fmt.Sprintf("TD-SUP-%s-%04d", stamp, seq), nil
}

// --------------------------------------------------- SHOP endpoints

type createTicketReq struct {
	Subject         string `json:"subject"`
	Category        string `json:"category"`
	Description     string `json:"description"`
	Priority        string `json:"priority"`
	AffectedModule  string `json:"affectedModule"`
	ErrorMessage    string `json:"errorMessage"`
	StepsToRepro    string `json:"stepsToReproduce"`
	ExpectedResult  string `json:"expectedResult"`
	ActualResult    string `json:"actualResult"`
}

func (s *Server) createShopTicket(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in createTicketReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	in.Subject = strings.TrimSpace(in.Subject)
	in.Description = strings.TrimSpace(in.Description)
	if in.Subject == "" || in.Description == "" {
		writeErr(w, 400, "Subject and description are required.")
		return
	}
	if len(in.Subject) > 200 {
		in.Subject = in.Subject[:200]
	}
	if !supportPriorities[in.Priority] {
		in.Priority = "normal"
	}
	if in.Category == "" {
		in.Category = "other"
	}

	resDeadline := time.Now().Add(time.Duration(slaResponseHours[in.Priority]) * time.Hour)
	resolveDeadline := time.Now().Add(time.Duration(slaResolveHours[in.Priority]) * time.Hour)

	var ticketID, ticketNumber string
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		num, err := s.nextTicketNumber(r.Context(), tx)
		if err != nil {
			return err
		}
		ticketNumber = num
		if err := tx.QueryRow(r.Context(), `
			INSERT INTO support_tickets
			  (ticket_number, company_id, submitter_name, submitter_email,
			   subject, description, category, priority, status,
			   affected_module, error_message, steps_to_reproduce,
			   expected_result, actual_result,
			   sla_response_due_at, sla_resolve_due_at)
			VALUES ($1,$2::uuid,$3,$4,$5,$6,$7,$8,'open',$9,$10,$11,$12,$13,$14,$15)
			RETURNING id::text`,
			num, u.CompanyID, u.Name, u.Email,
			in.Subject, in.Description, in.Category, in.Priority,
			in.AffectedModule, in.ErrorMessage, in.StepsToRepro,
			in.ExpectedResult, in.ActualResult,
			resDeadline, resolveDeadline).Scan(&ticketID); err != nil {
			return err
		}
		_, err = tx.Exec(r.Context(), `
			INSERT INTO support_audit (ticket_id, actor_name, actor_type, action, to_value)
			VALUES ($1::uuid, $2, 'shop', 'created', 'open')`, ticketID, u.Name)
		return err
	})
	if err != nil {
		handleErr(w, err)
		return
	}

	// Fire-and-forget emails. Enqueue failures are logged, not surfaced.
	s.sendTicketCreatedEmails(r.Context(), ticketID, ticketNumber, in.Subject, in.Priority, u.Email, u.Name, u.CompanyID)

	writeJSON(w, 201, map[string]any{
		"id":           ticketID,
		"ticketNumber": ticketNumber,
	})
}

func (s *Server) listShopTickets(w http.ResponseWriter, r *http.Request) {
	cid := userFrom(r.Context()).CompanyID
	status := r.URL.Query().Get("status")
	q := `SELECT id::text, ticket_number, subject, category, priority, status,
	             coalesce(assigned_admin_name,''), created_at, updated_at
	        FROM support_tickets WHERE company_id::text = $1`
	args := []any{cid}
	if status != "" && supportStatuses[status] {
		q += ` AND status = $2`
		args = append(args, status)
	}
	q += ` ORDER BY updated_at DESC LIMIT 200`
	rows, err := s.db.Query(r.Context(), q, args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, num, subj, cat, pri, st, assignee string
		var created, updated time.Time
		if err := rows.Scan(&id, &num, &subj, &cat, &pri, &st, &assignee, &created, &updated); err != nil {
			handleErr(w, err)
			return
		}
		out = append(out, map[string]any{
			"id": id, "ticketNumber": num, "subject": subj,
			"category": cat, "priority": pri, "status": st,
			"assignee": assignee, "createdAt": created, "updatedAt": updated,
		})
	}
	writeJSON(w, 200, out)
}

func (s *Server) getShopTicket(w http.ResponseWriter, r *http.Request) {
	cid := userFrom(r.Context()).CompanyID
	id := r.PathValue("id")
	t, err := s.loadTicket(r.Context(), id, &cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	msgs, err := s.loadSupportMessages(r.Context(), id, false)
	if err != nil {
		handleErr(w, err)
		return
	}
	t["messages"] = msgs
	writeJSON(w, 200, t)
}

type replyReq struct {
	Body       string `json:"body"`
	Internal   bool   `json:"internal"`
}

func (s *Server) shopReplyToTicket(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	id := r.PathValue("id")
	var in replyReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	in.Body = strings.TrimSpace(in.Body)
	if in.Body == "" {
		writeErr(w, 400, "Message is required.")
		return
	}
	// Verify ticket belongs to this company before touching it.
	var number, subject string
	err := s.db.QueryRow(r.Context(),
		`SELECT ticket_number, subject FROM support_tickets WHERE id::text=$1 AND company_id::text=$2`,
		id, u.CompanyID).Scan(&number, &subject)
	if err != nil {
		handleErr(w, err)
		return
	}
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `
			INSERT INTO support_messages (ticket_id, author_type, author_name, author_email, body, visibility)
			VALUES ($1::uuid, 'shop', $2, $3, $4, 'public')`, id, u.Name, u.Email, in.Body); err != nil {
			return err
		}
		// A shop reply nudges the state toward 'awaiting_internal' unless the
		// ticket is already with support in progress.
		_, err := tx.Exec(r.Context(), `UPDATE support_tickets
			SET status = CASE
			    WHEN status IN ('resolved','closed') THEN status
			    WHEN status = 'awaiting_customer' THEN 'awaiting_internal'
			    ELSE status
			  END,
			  updated_at = now()
			WHERE id::text = $1`, id)
		return err
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	s.notifyOwnerReply(r.Context(), id, number, subject, u.Name)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) shopReopenTicket(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	id := r.PathValue("id")
	tag, err := s.db.Exec(r.Context(), `UPDATE support_tickets
		SET status='awaiting_internal', resolved_at=NULL, closed_at=NULL, updated_at=now()
		WHERE id::text=$1 AND company_id::text=$2 AND status IN ('resolved','closed')`,
		id, u.CompanyID)
	if err != nil {
		handleErr(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeErr(w, 400, "Ticket cannot be reopened in its current state.")
		return
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO support_audit
		(ticket_id, actor_name, actor_type, action, to_value, note)
		VALUES ($1::uuid, $2, 'shop', 'reopened', 'awaiting_internal', 'Reopened by customer')`,
		id, u.Name)
	writeJSON(w, 200, map[string]any{"ok": true})
}

// --------------------------------------------------- OWNER endpoints

func (s *Server) ownerSupportStats(w http.ResponseWriter, r *http.Request) {
	row := s.db.QueryRow(r.Context(), `
		SELECT
		  count(*) FILTER (WHERE status='open'),
		  count(*) FILTER (WHERE status='assigned'),
		  count(*) FILTER (WHERE status='in_progress'),
		  count(*) FILTER (WHERE status='awaiting_customer'),
		  count(*) FILTER (WHERE status='awaiting_internal'),
		  count(*) FILTER (WHERE status='resolved'),
		  count(*) FILTER (WHERE status='closed'),
		  count(*) FILTER (WHERE priority='urgent' AND status NOT IN ('resolved','closed')),
		  count(*) FILTER (WHERE sla_resolve_due_at < now() AND status NOT IN ('resolved','closed')),
		  count(*)
		FROM support_tickets`)
	var open, assigned, inProg, awaitCust, awaitInt, resolved, closed, urgent, overdue, total int
	if err := row.Scan(&open, &assigned, &inProg, &awaitCust, &awaitInt, &resolved, &closed, &urgent, &overdue, &total); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{
		"total": total, "open": open, "assigned": assigned, "inProgress": inProg,
		"awaitingCustomer": awaitCust, "awaitingInternal": awaitInt,
		"resolved": resolved, "closed": closed,
		"urgent": urgent, "overdue": overdue,
	})
}

func (s *Server) ownerListTickets(w http.ResponseWriter, r *http.Request) {
	q := `SELECT t.id::text, t.ticket_number, t.subject, c.name, t.submitter_name,
	             t.category, t.priority, t.status, coalesce(t.assigned_admin_name,''),
	             t.created_at, t.updated_at, t.sla_resolve_due_at
	       FROM support_tickets t
	       JOIN companies c ON c.id = t.company_id
	       WHERE 1=1`
	args := []any{}
	add := func(cond string, v any) { args = append(args, v); q += fmt.Sprintf(" AND %s = $%d", cond, len(args)) }
	v := r.URL.Query()
	if s := v.Get("status"); s != "" && supportStatuses[s] { add("t.status", s) }
	if p := v.Get("priority"); p != "" && supportPriorities[p] { add("t.priority", p) }
	if cat := v.Get("category"); cat != "" { add("t.category", cat) }
	if cid := v.Get("companyId"); cid != "" {
		args = append(args, cid)
		q += fmt.Sprintf(" AND t.company_id::text = $%d", len(args))
	}
	if search := strings.TrimSpace(v.Get("q")); search != "" {
		args = append(args, "%"+strings.ToLower(search)+"%")
		q += fmt.Sprintf(" AND (lower(t.ticket_number) LIKE $%d OR lower(t.subject) LIKE $%d OR lower(c.name) LIKE $%d OR lower(t.submitter_name) LIKE $%d)",
			len(args), len(args), len(args), len(args))
	}
	q += " ORDER BY t.updated_at DESC LIMIT 500"
	rows, err := s.db.Query(r.Context(), q, args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, num, subj, comp, submitter, cat, pri, st, assignee string
		var created, updated time.Time
		var slaDue *time.Time
		if err := rows.Scan(&id, &num, &subj, &comp, &submitter, &cat, &pri, &st, &assignee, &created, &updated, &slaDue); err != nil {
			handleErr(w, err)
			return
		}
		out = append(out, map[string]any{
			"id": id, "ticketNumber": num, "subject": subj,
			"company": comp, "submitter": submitter,
			"category": cat, "priority": pri, "status": st,
			"assignee": assignee, "createdAt": created, "updatedAt": updated,
			"slaResolveDueAt": slaDue,
		})
	}
	writeJSON(w, 200, out)
}

func (s *Server) ownerGetTicket(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	t, err := s.loadTicket(r.Context(), id, nil)
	if err != nil {
		handleErr(w, err)
		return
	}
	msgs, err := s.loadSupportMessages(r.Context(), id, true)
	if err != nil {
		handleErr(w, err)
		return
	}
	audit, err := s.loadAudit(r.Context(), id)
	if err != nil {
		handleErr(w, err)
		return
	}
	t["messages"] = msgs
	t["audit"] = audit
	writeJSON(w, 200, t)
}

type ownerUpdateReq struct {
	Status            *string `json:"status"`
	Priority          *string `json:"priority"`
	Category          *string `json:"category"`
	AssignedAdminID   *string `json:"assignedAdminId"`
	Reason            string  `json:"reason"`
}

func (s *Server) ownerUpdateTicket(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	id := r.PathValue("id")
	var in ownerUpdateReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	var curStatus, curPri, curCat, curAssigneeName, companyID, submitterEmail, submitterName, number, subject string
	var curAssigneeID string
	err := s.db.QueryRow(r.Context(), `
		SELECT status, priority, category, coalesce(assigned_admin_id::text,''), coalesce(assigned_admin_name,''),
		       company_id::text, submitter_email, submitter_name, ticket_number, subject
		  FROM support_tickets WHERE id::text=$1`, id).
		Scan(&curStatus, &curPri, &curCat, &curAssigneeID, &curAssigneeName,
			&companyID, &submitterEmail, &submitterName, &number, &subject)
	if err != nil {
		handleErr(w, err)
		return
	}
	sets := []string{"updated_at = now()"}
	args := []any{}
	addSet := func(clause string, v any) {
		args = append(args, v)
		sets = append(sets, fmt.Sprintf(clause, len(args)))
	}

	audits := []map[string]string{}
	if in.Status != nil && supportStatuses[*in.Status] && *in.Status != curStatus {
		addSet("status = $%d", *in.Status)
		audits = append(audits, map[string]string{"action": "status_changed", "from": curStatus, "to": *in.Status})
		switch *in.Status {
		case "resolved":
			sets = append(sets, "resolved_at = now()")
		case "closed":
			sets = append(sets, "closed_at = now()")
		}
	}
	if in.Priority != nil && supportPriorities[*in.Priority] && *in.Priority != curPri {
		addSet("priority = $%d", *in.Priority)
		audits = append(audits, map[string]string{"action": "priority_changed", "from": curPri, "to": *in.Priority})
	}
	if in.Category != nil && *in.Category != "" && *in.Category != curCat {
		addSet("category = $%d", *in.Category)
		audits = append(audits, map[string]string{"action": "category_changed", "from": curCat, "to": *in.Category})
	}
	if in.AssignedAdminID != nil {
		if *in.AssignedAdminID == "" {
			sets = append(sets, "assigned_admin_id = NULL", "assigned_admin_name = ''")
			audits = append(audits, map[string]string{"action": "unassigned", "from": curAssigneeName, "to": ""})
		} else {
			var name string
			if err := s.db.QueryRow(r.Context(), `SELECT name FROM saas_admin_users WHERE id::text=$1`, *in.AssignedAdminID).Scan(&name); err != nil {
				writeErr(w, 400, "Unknown assignee.")
				return
			}
			addSet("assigned_admin_id = $%d::uuid", *in.AssignedAdminID)
			addSet("assigned_admin_name = $%d", name)
			audits = append(audits, map[string]string{"action": "assigned", "from": curAssigneeName, "to": name})
			if curStatus == "open" && in.Status == nil {
				addSet("status = $%d", "assigned")
				audits = append(audits, map[string]string{"action": "status_changed", "from": curStatus, "to": "assigned"})
			}
		}
	}
	if len(audits) == 0 {
		writeJSON(w, 200, map[string]any{"ok": true, "noop": true})
		return
	}
	args = append(args, id)
	sql := fmt.Sprintf(`UPDATE support_tickets SET %s WHERE id::text = $%d`, strings.Join(sets, ", "), len(args))
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), sql, args...); err != nil {
			return err
		}
		for _, a := range audits {
			if _, err := tx.Exec(r.Context(), `INSERT INTO support_audit
				(ticket_id, actor_name, actor_type, action, from_value, to_value, note)
				VALUES ($1::uuid, $2, 'owner', $3, $4, $5, $6)`,
				id, u.Name, a["action"], a["from"], a["to"], in.Reason); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	for _, a := range audits {
		if a["action"] == "status_changed" && (a["to"] == "resolved" || a["to"] == "closed") {
			s.notifyShopStatus(r.Context(), id, number, subject, submitterEmail, submitterName, a["to"], companyID)
		}
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) ownerReplyToTicket(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	id := r.PathValue("id")
	var in replyReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	in.Body = strings.TrimSpace(in.Body)
	if in.Body == "" {
		writeErr(w, 400, "Message is required.")
		return
	}
	vis := "public"
	if in.Internal {
		vis = "internal"
	}
	var number, subject, submitterEmail, submitterName, companyID string
	if err := s.db.QueryRow(r.Context(),
		`SELECT ticket_number, subject, submitter_email, submitter_name, company_id::text
		   FROM support_tickets WHERE id::text=$1`, id).
		Scan(&number, &subject, &submitterEmail, &submitterName, &companyID); err != nil {
		handleErr(w, err)
		return
	}
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `
			INSERT INTO support_messages (ticket_id, author_type, author_name, author_email, body, visibility)
			VALUES ($1::uuid, 'owner', $2, $3, $4, $5)`, id, u.Name, u.Email, in.Body, vis); err != nil {
			return err
		}
		if !in.Internal {
			// Public owner reply: record first_response_at (if unset) and
			// advance a stale 'open' / 'awaiting_internal' ticket forward.
			if _, err := tx.Exec(r.Context(), `UPDATE support_tickets
				SET first_response_at = COALESCE(first_response_at, now()),
				    status = CASE
				      WHEN status IN ('resolved','closed') THEN status
				      WHEN status = 'open' THEN 'in_progress'
				      WHEN status = 'awaiting_internal' THEN 'in_progress'
				      ELSE status
				    END,
				    updated_at = now()
				WHERE id::text = $1`, id); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	if !in.Internal {
		s.notifyShopReply(r.Context(), id, number, subject, submitterEmail, submitterName, companyID)
	}
	writeJSON(w, 200, map[string]any{"ok": true, "visibility": vis})
}

func (s *Server) ownerListSupportAdmins(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(),
		`SELECT id::text, name, email FROM saas_admin_users WHERE active ORDER BY name`)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, email string
		if err := rows.Scan(&id, &name, &email); err != nil {
			handleErr(w, err)
			return
		}
		out = append(out, map[string]any{"id": id, "name": name, "email": email})
	}
	writeJSON(w, 200, out)
}

// --------------------------------------------------- shared loaders

func (s *Server) loadTicket(ctx context.Context, id string, mustMatchCompany *string) (map[string]any, error) {
	q := `SELECT t.id::text, t.ticket_number, t.company_id::text, c.name, t.submitter_name, t.submitter_email,
	             t.subject, t.description, t.category, t.priority, t.status,
	             t.affected_module, t.error_message, t.steps_to_reproduce,
	             t.expected_result, t.actual_result,
	             coalesce(t.assigned_admin_id::text,''), coalesce(t.assigned_admin_name,''),
	             t.first_response_at, t.resolved_at, t.closed_at,
	             t.sla_response_due_at, t.sla_resolve_due_at,
	             t.created_at, t.updated_at
	       FROM support_tickets t
	       JOIN companies c ON c.id = t.company_id
	       WHERE t.id::text = $1`
	args := []any{id}
	if mustMatchCompany != nil {
		q += ` AND t.company_id::text = $2`
		args = append(args, *mustMatchCompany)
	}
	var tid, num, cid, comp, submitterName, submitterEmail, subj, desc, cat, pri, st, mod, errMsg, steps, exp, act, assigneeID, assigneeName string
	var firstResp, resolved, closed, respDue, resolveDue *time.Time
	var created, updated time.Time
	err := s.db.QueryRow(ctx, q, args...).Scan(
		&tid, &num, &cid, &comp, &submitterName, &submitterEmail,
		&subj, &desc, &cat, &pri, &st,
		&mod, &errMsg, &steps, &exp, &act,
		&assigneeID, &assigneeName,
		&firstResp, &resolved, &closed, &respDue, &resolveDue,
		&created, &updated)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": tid, "ticketNumber": num,
		"companyId": cid, "company": comp,
		"submitterName": submitterName, "submitterEmail": submitterEmail,
		"subject": subj, "description": desc,
		"category": cat, "priority": pri, "status": st,
		"affectedModule": mod, "errorMessage": errMsg,
		"stepsToReproduce": steps, "expectedResult": exp, "actualResult": act,
		"assignedAdminId": assigneeID, "assignedAdminName": assigneeName,
		"firstResponseAt": firstResp, "resolvedAt": resolved, "closedAt": closed,
		"slaResponseDueAt": respDue, "slaResolveDueAt": resolveDue,
		"createdAt": created, "updatedAt": updated,
	}, nil
}

func (s *Server) loadSupportMessages(ctx context.Context, ticketID string, includeInternal bool) ([]map[string]any, error) {
	q := `SELECT id::text, author_type, author_name, body, visibility, created_at
	        FROM support_messages WHERE ticket_id::text = $1`
	if !includeInternal {
		q += ` AND visibility = 'public'`
	}
	q += ` ORDER BY created_at`
	rows, err := s.db.Query(ctx, q, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, at, name, body, vis string
		var created time.Time
		if err := rows.Scan(&id, &at, &name, &body, &vis, &created); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"id": id, "authorType": at, "authorName": name,
			"body": body, "visibility": vis, "createdAt": created,
		})
	}
	return out, nil
}

func (s *Server) loadAudit(ctx context.Context, ticketID string) ([]map[string]any, error) {
	rows, err := s.db.Query(ctx, `SELECT actor_name, actor_type, action, from_value, to_value, note, created_at
		FROM support_audit WHERE ticket_id::text = $1 ORDER BY created_at`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var actor, atype, action, from, to, note string
		var created time.Time
		if err := rows.Scan(&actor, &atype, &action, &from, &to, &note, &created); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"actorName": actor, "actorType": atype,
			"action": action, "from": from, "to": to, "note": note,
			"createdAt": created,
		})
	}
	return out, nil
}

// --------------------------------------------------- email

func supportBrand() string {
	if v := os.Getenv("TORQUEDESK_BRAND"); v != "" {
		return v
	}
	return "Fixora Support"
}

func supportPortalBase() string {
	if v := strings.TrimRight(os.Getenv("APP_ORIGIN"), "/"); v != "" {
		return v
	}
	return "https://apps.2set.com"
}

func supportEmailShell(title, body string) string {
	return `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
<div style="max-width:620px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="padding:20px 28px;background:linear-gradient(90deg,#3c6dff,#2554f5);color:#fff">
    <div style="font-weight:700;font-size:16px">` + html.EscapeString(supportBrand()) + `</div>
    <div style="opacity:.9;font-size:12px;margin-top:2px">` + html.EscapeString(title) + `</div>
  </div>
  <div style="padding:24px 28px;line-height:1.55;font-size:14px">` + body + `</div>
  <div style="padding:14px 28px;background:#f8fafc;color:#64748b;font-size:11px;border-top:1px solid #e2e8f0">
    You received this because you have an active Fixora account. Reply by signing in — do not reply to this email.
  </div>
</div></body></html>`
}

func (s *Server) sendTicketCreatedEmails(ctx context.Context, ticketID, number, subject, priority, submitterEmail, submitterName, companyID string) {
	portal := supportPortalBase()
	customerBody := fmt.Sprintf(`<p>Hi %s,</p>
<p>We received your support request. Our team will review it and get back to you.</p>
<table style="margin:16px 0;border-collapse:collapse;font-size:13px">
  <tr><td style="padding:4px 10px;color:#64748b">Ticket number</td><td style="padding:4px 0;font-weight:600">%s</td></tr>
  <tr><td style="padding:4px 10px;color:#64748b">Subject</td><td style="padding:4px 0">%s</td></tr>
  <tr><td style="padding:4px 10px;color:#64748b">Priority</td><td style="padding:4px 0">%s</td></tr>
  <tr><td style="padding:4px 10px;color:#64748b">Status</td><td style="padding:4px 0">Open</td></tr>
</table>
<p><a href="%s/support/%s" style="display:inline-block;background:#2554f5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">View support ticket</a></p>`,
		html.EscapeString(submitterName), html.EscapeString(number),
		html.EscapeString(subject), html.EscapeString(priority),
		portal, ticketID)
	if _, err := s.enqueueEmail(ctx, emailEnqueue{
		Scope:       "platform",
		To:          submitterEmail,
		Subject:     fmt.Sprintf("[%s] Ticket %s Created", supportBrand(), number),
		HTML:        supportEmailShell("Ticket "+number+" created", customerBody),
		Text:        fmt.Sprintf("Your ticket %s (%s) was received. View it at %s/support/%s", number, subject, portal, ticketID),
		Kind:        "support_created",
		RelatedType: "support_ticket",
		RelatedID:   ticketID,
		DedupeKey:   "support_created_customer:" + ticketID,
	}); err != nil {
		logSupportMail("ticket_created_customer", err)
	}

	// Owner notification: send to every active saas_admin_users.
	rows, err := s.db.Query(ctx, `SELECT email FROM saas_admin_users WHERE active`)
	if err != nil {
		logSupportMail("ticket_created_owners_query", err)
		return
	}
	defer rows.Close()
	var companyName string
	_ = s.db.QueryRow(ctx, `SELECT name FROM companies WHERE id::text=$1`, companyID).Scan(&companyName)
	ownerBody := fmt.Sprintf(`<p>A new support ticket was submitted.</p>
<table style="margin:16px 0;border-collapse:collapse;font-size:13px">
  <tr><td style="padding:4px 10px;color:#64748b">Ticket</td><td style="padding:4px 0;font-weight:600">%s</td></tr>
  <tr><td style="padding:4px 10px;color:#64748b">Subject</td><td style="padding:4px 0">%s</td></tr>
  <tr><td style="padding:4px 10px;color:#64748b">Company</td><td style="padding:4px 0">%s</td></tr>
  <tr><td style="padding:4px 10px;color:#64748b">Submitter</td><td style="padding:4px 0">%s &lt;%s&gt;</td></tr>
  <tr><td style="padding:4px 10px;color:#64748b">Priority</td><td style="padding:4px 0">%s</td></tr>
</table>
<p><a href="%s/owner/support/%s" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open in Service Desk</a></p>`,
		html.EscapeString(number), html.EscapeString(subject),
		html.EscapeString(companyName), html.EscapeString(submitterName), html.EscapeString(submitterEmail),
		html.EscapeString(priority), portal, ticketID)
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err != nil {
			continue
		}
		if _, err := s.enqueueEmail(ctx, emailEnqueue{
			Scope:       "platform",
			To:          email,
			Subject:     fmt.Sprintf("[Service Desk] %s — %s (%s)", number, subject, priority),
			HTML:        supportEmailShell("New support ticket", ownerBody),
			Text:        fmt.Sprintf("New ticket %s from %s. Open: %s/owner/support/%s", number, companyName, portal, ticketID),
			Kind:        "support_created_owner",
			RelatedType: "support_ticket",
			RelatedID:   ticketID,
			DedupeKey:   "support_created_owner:" + ticketID + ":" + email,
		}); err != nil {
			logSupportMail("ticket_created_owner", err)
		}
	}
}

func (s *Server) notifyOwnerReply(ctx context.Context, ticketID, number, subject, shopName string) {
	portal := supportPortalBase()
	body := fmt.Sprintf(`<p>%s replied on ticket <strong>%s</strong>.</p>
<p>%s</p>
<p><a href="%s/owner/support/%s" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open ticket</a></p>`,
		html.EscapeString(shopName), html.EscapeString(number), html.EscapeString(subject), portal, ticketID)
	rows, err := s.db.Query(ctx, `SELECT email FROM saas_admin_users WHERE active`)
	if err != nil {
		logSupportMail("notify_owner_query", err)
		return
	}
	defer rows.Close()
	// Dedupe uses a per-message counter so each new shop reply still fires.
	stamp := strconv.FormatInt(time.Now().UnixNano(), 36)
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err != nil {
			continue
		}
		if _, err := s.enqueueEmail(ctx, emailEnqueue{
			Scope:       "platform",
			To:          email,
			Subject:     fmt.Sprintf("[Service Desk] Reply on %s", number),
			HTML:        supportEmailShell("Customer replied on "+number, body),
			Text:        fmt.Sprintf("%s replied on %s. Open: %s/owner/support/%s", shopName, number, portal, ticketID),
			Kind:        "support_customer_reply",
			RelatedType: "support_ticket",
			RelatedID:   ticketID,
			DedupeKey:   "support_cust_reply:" + ticketID + ":" + email + ":" + stamp,
		}); err != nil {
			logSupportMail("notify_owner_reply", err)
		}
	}
}

func (s *Server) notifyShopReply(ctx context.Context, ticketID, number, subject, email, name, companyID string) {
	portal := supportPortalBase()
	body := fmt.Sprintf(`<p>Hi %s,</p>
<p>Our support team replied on ticket <strong>%s — %s</strong>. Sign in to view the message.</p>
<p><a href="%s/support/%s" style="display:inline-block;background:#2554f5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">View support ticket</a></p>`,
		html.EscapeString(name), html.EscapeString(number), html.EscapeString(subject), portal, ticketID)
	stamp := strconv.FormatInt(time.Now().UnixNano(), 36)
	if _, err := s.enqueueEmail(ctx, emailEnqueue{
		Scope:       "platform",
		To:          email,
		Subject:     fmt.Sprintf("[%s] Update on ticket %s", supportBrand(), number),
		HTML:        supportEmailShell("New reply on your ticket", body),
		Text:        fmt.Sprintf("Support replied on your ticket %s. View: %s/support/%s", number, portal, ticketID),
		Kind:        "support_owner_reply",
		RelatedType: "support_ticket",
		RelatedID:   ticketID,
		DedupeKey:   "support_owner_reply:" + ticketID + ":" + email + ":" + stamp,
	}); err != nil {
		logSupportMail("notify_shop_reply", err)
	}
}

func (s *Server) notifyShopStatus(ctx context.Context, ticketID, number, subject, email, name, newStatus, companyID string) {
	portal := supportPortalBase()
	label := strings.ReplaceAll(newStatus, "_", " ")
	body := fmt.Sprintf(`<p>Hi %s,</p>
<p>Ticket <strong>%s — %s</strong> was marked <strong>%s</strong>.</p>
<p>If the problem persists, you can reopen the ticket from the support portal.</p>
<p><a href="%s/support/%s" style="display:inline-block;background:#2554f5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">View ticket</a></p>`,
		html.EscapeString(name), html.EscapeString(number), html.EscapeString(subject),
		html.EscapeString(label), portal, ticketID)
	if _, err := s.enqueueEmail(ctx, emailEnqueue{
		Scope:       "platform",
		To:          email,
		Subject:     fmt.Sprintf("[%s] Ticket %s %s", supportBrand(), number, label),
		HTML:        supportEmailShell("Ticket "+label, body),
		Text:        fmt.Sprintf("Ticket %s was marked %s. View: %s/support/%s", number, label, portal, ticketID),
		Kind:        "support_status_" + newStatus,
		RelatedType: "support_ticket",
		RelatedID:   ticketID,
		DedupeKey:   "support_status:" + ticketID + ":" + newStatus,
	}); err != nil {
		logSupportMail("notify_shop_status", err)
	}
}

func logSupportMail(where string, err error) {
	if err == nil || errors.Is(err, pgx.ErrNoRows) {
		return
	}
	// Non-fatal; the ticket write already committed.
	fmt.Printf("[support/email] %s: %v\n", where, err)
}

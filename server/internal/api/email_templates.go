package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ----------------------------------------------------------------------------
// Editable email templates.
//
// Each outbound email the app sends has a built-in default (subject +
// html + text) with named {{placeholders}}. If a row exists in
// email_templates for the current (scope, kind, company_id?) and is enabled,
// its text is used instead; otherwise the built-in default is used.
//
// Placeholders are substituted with simple literal replacement — no logic,
// no loops, no sanitizers. Callers pre-escape anything user-supplied that
// goes into HTML (we already do that through htmlEscape).
// ----------------------------------------------------------------------------

type templateDef struct {
	Kind         string
	Label        string
	Scope        string // "platform" or "tenant"
	Description  string
	Placeholders []string
	Subject      string
	HTML         string
	Text         string
}

// Built-in defaults for every template kind the app sends. The sender code
// paths call renderTemplate with the matching kind + vars.
var builtInTemplates = map[string]templateDef{
	// -------- platform --------
	"welcome": {
		Kind: "welcome", Scope: "platform",
		Label:        "New shop welcome",
		Description:  "Sent when a new shop account is created by the SaaS owner.",
		Placeholders: []string{"owner_name", "company_name", "application_url", "from_name"},
		Subject:      "Welcome to {{from_name}} — your shop is ready",
		HTML: `<p>Hi {{owner_name}},</p>
<p>Your TorqueDesk shop account for <strong>{{company_name}}</strong> is ready.
Sign in with the credentials you were provided and start setting up your workspace.</p>
<p><a href="{{application_url}}" style="display:inline-block;padding:10px 18px;background:#2a6cf0;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Open your shop</a></p>`,
		Text: "Hi {{owner_name}},\n\nYour TorqueDesk shop account for {{company_name}} is ready.\n\nOpen your shop: {{application_url}}\n",
	},
	"status_change": {
		Kind: "status_change", Scope: "platform",
		Label:        "Account status change",
		Description:  "Sent when you suspend, reactivate, expire, or cancel a shop.",
		Placeholders: []string{"company_name", "status_phrase", "reason", "status"},
		Subject:      "TorqueDesk account status: {{status}}",
		HTML: `<p>Your TorqueDesk shop <strong>{{company_name}}</strong> {{status_phrase}}.</p>
<p>{{reason}}</p>
<p>If you believe this is a mistake, reply to this email and the TorqueDesk team will look into it.</p>`,
		Text: "Your TorqueDesk shop {{company_name}} {{status_phrase}}.\n{{reason}}\n",
	},
	"subscription": {
		Kind: "subscription", Scope: "platform",
		Label:        "Subscription update",
		Description:  "Sent on subscription extend / renew / plan-change / expiration.",
		Placeholders: []string{"company_name", "title", "intro", "detail_table"},
		Subject:      "TorqueDesk: {{title}}",
		HTML:         `<p>{{intro}}</p>{{detail_table}}`,
		Text:         "{{intro}}\n",
	},

	// -------- tenant --------
	"password_reset": {
		Kind: "password_reset", Scope: "tenant",
		Label:        "Password reset",
		Description:  "Sent when a shop user clicks \"Forgot password\".",
		Placeholders: []string{"shop_name", "reset_url"},
		Subject:      "Reset your {{shop_name}} password",
		HTML: `<p>You asked to reset your password at <b>{{shop_name}}</b>.</p>
<p><a href="{{reset_url}}">Reset your password</a> (expires in 1 hour)</p>
<p style="color:#6b7280;font-size:12px">If you didn't ask for this, ignore this email.</p>`,
		Text: "You asked to reset your password at {{shop_name}}.\r\n\r\nClick the link below (expires in 1 hour):\r\n\r\n{{reset_url}}\r\n\r\nIf you didn't ask for this, ignore this email.",
	},
	"payment_receipt": {
		Kind: "payment_receipt", Scope: "tenant",
		Label:        "Payment receipt",
		Description:  "Sent to the customer when their online payment succeeds (Stripe / Authorize.Net).",
		Placeholders: []string{"shop_name", "doc_number", "amount", "method", "reference"},
		Subject:      "Payment received — {{shop_name}} {{doc_number}}",
		HTML: `<p>Hi,</p>
<p>Thank you — we received your payment of <strong>{{amount}}</strong> for <strong>{{shop_name}}</strong> {{doc_number}}.</p>
<p><strong>Payment method:</strong> {{method}}<br><strong>Reference:</strong> {{reference}}</p>
<p>This email is your receipt. If you have any questions, reply here and we'll help.</p>
<p>— {{shop_name}}</p>`,
		Text: "Hi,\n\nThank you — we received your payment of {{amount}} for {{shop_name}} {{doc_number}}.\n\nPayment method: {{method}}\nReference: {{reference}}\n\nThis email is your receipt. If you have any questions, reply here and we'll help.\n\n— {{shop_name}}\n",
	},
	"authorization_reminder": {
		Kind: "authorization_reminder", Scope: "tenant",
		Label:        "Authorization reminder",
		Description:  "Sent to customers who haven't responded to an authorization request.",
		Placeholders: []string{"shop_name", "doc_number", "share_url"},
		Subject:      "Reminder: please review {{doc_number}}",
		HTML:         `<p>Hi,</p><p><b>{{shop_name}}</b> is still waiting on your authorization for document <b>{{doc_number}}</b>.</p><p><a href="{{share_url}}">Open the document</a></p>`,
		Text:         "Hi,\n\n{{shop_name}} is still waiting on your authorization for document {{doc_number}}.\n\nOpen it here: {{share_url}}\n\nThanks.\n",
	},
}

// renderTemplate loads an override from email_templates if one exists and is
// enabled, else uses the built-in default. Returns (subject, html, text).
func (s *Server) renderTemplate(ctx context.Context, scope, companyID, kind string, vars map[string]string) (string, string, string) {
	def, ok := builtInTemplates[kind]
	if !ok {
		return "", "", ""
	}
	subject, html, text := def.Subject, def.HTML, def.Text
	var cid any
	if companyID != "" {
		cid = companyID
	}
	var row struct {
		Subject, HTML, Text string
		Enabled             bool
	}
	err := s.db.QueryRow(ctx, `SELECT subject, body_html, body_text, enabled FROM email_templates
		WHERE scope = $1 AND kind = $2 AND company_id IS NOT DISTINCT FROM $3::uuid`,
		scope, kind, cid).Scan(&row.Subject, &row.HTML, &row.Text, &row.Enabled)
	if err == nil && row.Enabled {
		subject, html, text = row.Subject, row.HTML, row.Text
	}
	return applyVars(subject, vars), applyVars(html, vars), applyVars(text, vars)
}

func applyVars(s string, vars map[string]string) string {
	if len(vars) == 0 {
		return s
	}
	pairs := make([]string, 0, len(vars)*2)
	for k, v := range vars {
		pairs = append(pairs, "{{"+k+"}}", v)
	}
	return strings.NewReplacer(pairs...).Replace(s)
}

// --------------------------- HTTP API --------------------------------------

type templateDTO struct {
	Kind        string   `json:"kind"`
	Label       string   `json:"label"`
	Scope       string   `json:"scope"`
	Description string   `json:"description"`
	Placeholders []string `json:"placeholders"`
	Subject     string   `json:"subject"`
	HTML        string   `json:"html"`
	Text        string   `json:"text"`
	Enabled     bool     `json:"enabled"`
	IsCustom    bool     `json:"isCustom"` // true when a row exists (override active)
	UpdatedBy   string   `json:"updatedBy,omitempty"`
	UpdatedAt   int64    `json:"updatedAt,omitempty"`
	DefaultSubject string `json:"defaultSubject"`
	DefaultHTML    string `json:"defaultHtml"`
	DefaultText    string `json:"defaultText"`
}

func (s *Server) emailTemplateRoutes(mux *http.ServeMux) {
	// Tenant-scoped
	mux.HandleFunc("GET /api/settings/email-templates", s.auth("settings.view", s.listTenantTemplates))
	mux.HandleFunc("PUT /api/settings/email-templates/{kind}", s.auth("shop.edit", s.upsertTenantTemplate))
	mux.HandleFunc("DELETE /api/settings/email-templates/{kind}", s.auth("shop.edit", s.deleteTenantTemplate))
	// Platform-scoped (owner only)
	mux.HandleFunc("GET /api/owner/mail/templates", s.ownerAuth(s.listPlatformTemplates))
	mux.HandleFunc("PUT /api/owner/mail/templates/{kind}", s.ownerAuth(s.upsertPlatformTemplate))
	mux.HandleFunc("DELETE /api/owner/mail/templates/{kind}", s.ownerAuth(s.deletePlatformTemplate))
}

func (s *Server) collectTemplates(ctx context.Context, scope, companyID string) []templateDTO {
	out := []templateDTO{}
	// Which rows exist as overrides?
	overrides := map[string]struct {
		Subject, HTML, Text, UpdatedBy string
		Enabled                        bool
		UpdatedAt                      time.Time
	}{}
	var rows pgx.Rows
	var err error
	if scope == "platform" {
		rows, err = s.db.Query(ctx, `SELECT kind, subject, body_html, body_text, enabled, updated_by, updated_at
			FROM email_templates WHERE scope = 'platform'`)
	} else {
		rows, err = s.db.Query(ctx, `SELECT kind, subject, body_html, body_text, enabled, updated_by, updated_at
			FROM email_templates WHERE scope = 'tenant' AND company_id::text = $1`, companyID)
	}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var kind string
			var o struct {
				Subject, HTML, Text, UpdatedBy string
				Enabled                        bool
				UpdatedAt                      time.Time
			}
			if err := rows.Scan(&kind, &o.Subject, &o.HTML, &o.Text, &o.Enabled, &o.UpdatedBy, &o.UpdatedAt); err == nil {
				overrides[kind] = o
			}
		}
	}
	for _, def := range builtInTemplates {
		if def.Scope != scope {
			continue
		}
		dto := templateDTO{
			Kind: def.Kind, Label: def.Label, Scope: def.Scope,
			Description: def.Description, Placeholders: def.Placeholders,
			Subject: def.Subject, HTML: def.HTML, Text: def.Text,
			Enabled: true, IsCustom: false,
			DefaultSubject: def.Subject, DefaultHTML: def.HTML, DefaultText: def.Text,
		}
		if o, ok := overrides[def.Kind]; ok {
			dto.Subject = o.Subject
			dto.HTML = o.HTML
			dto.Text = o.Text
			dto.Enabled = o.Enabled
			dto.IsCustom = true
			dto.UpdatedBy = o.UpdatedBy
			dto.UpdatedAt = o.UpdatedAt.UnixMilli()
		}
		out = append(out, dto)
	}
	return out
}

func (s *Server) listTenantTemplates(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	writeJSON(w, 200, s.collectTemplates(r.Context(), "tenant", cid))
}

func (s *Server) listPlatformTemplates(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.collectTemplates(r.Context(), "platform", ""))
}

type templatePut struct {
	Subject string `json:"subject"`
	HTML    string `json:"html"`
	Text    string `json:"text"`
	Enabled *bool  `json:"enabled"`
}

func (s *Server) upsertTenantTemplate(w http.ResponseWriter, r *http.Request) {
	kind := r.PathValue("kind")
	cid := companyFrom(r.Context())
	u := userFrom(r.Context())
	if err := s.upsertTemplate(r, "tenant", cid, kind, u.Name); err != nil {
		handleErr(w, err)
		return
	}
	s.listTenantTemplates(w, r)
}

func (s *Server) upsertPlatformTemplate(w http.ResponseWriter, r *http.Request) {
	kind := r.PathValue("kind")
	u := userFrom(r.Context())
	if err := s.upsertTemplate(r, "platform", "", kind, u.Name); err != nil {
		handleErr(w, err)
		return
	}
	s.listPlatformTemplates(w, r)
}

func (s *Server) upsertTemplate(r *http.Request, scope, companyID, kind, actor string) error {
	def, ok := builtInTemplates[kind]
	if !ok || def.Scope != scope {
		return errStatus(404, "Unknown template kind.")
	}
	var in templatePut
	if err := readJSON(r, &in); err != nil {
		return errStatus(400, "Invalid request.")
	}
	in.Subject = strings.TrimSpace(in.Subject)
	if in.Subject == "" {
		return errStatus(400, "Subject is required.")
	}
	if strings.TrimSpace(in.HTML) == "" && strings.TrimSpace(in.Text) == "" {
		return errStatus(400, "Provide at least an HTML body or a text body.")
	}
	if len(in.HTML) > 200000 || len(in.Text) > 200000 || len(in.Subject) > 500 {
		return errStatus(413, "Template is too large.")
	}
	enabled := true
	if in.Enabled != nil {
		enabled = *in.Enabled
	}
	var cid any
	if companyID != "" {
		cid = companyID
	}
	// Upsert by (scope, kind, company_id).
	if scope == "platform" {
		_, err := s.db.Exec(r.Context(), `INSERT INTO email_templates
			(scope, company_id, kind, subject, body_html, body_text, enabled, updated_by)
			VALUES ('platform', NULL, $1, $2, $3, $4, $5, $6)
			ON CONFLICT (kind) WHERE scope = 'platform'
			DO UPDATE SET subject = EXCLUDED.subject, body_html = EXCLUDED.body_html,
			              body_text = EXCLUDED.body_text, enabled = EXCLUDED.enabled,
			              updated_by = EXCLUDED.updated_by, updated_at = now()`,
			kind, in.Subject, in.HTML, in.Text, enabled, actor)
		return err
	}
	_, err := s.db.Exec(r.Context(), `INSERT INTO email_templates
		(scope, company_id, kind, subject, body_html, body_text, enabled, updated_by)
		VALUES ('tenant', $1::uuid, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (company_id, kind) WHERE scope = 'tenant'
		DO UPDATE SET subject = EXCLUDED.subject, body_html = EXCLUDED.body_html,
		              body_text = EXCLUDED.body_text, enabled = EXCLUDED.enabled,
		              updated_by = EXCLUDED.updated_by, updated_at = now()`,
		cid, kind, in.Subject, in.HTML, in.Text, enabled, actor)
	return err
}

func (s *Server) deleteTenantTemplate(w http.ResponseWriter, r *http.Request) {
	kind := r.PathValue("kind")
	cid := companyFrom(r.Context())
	if _, err := s.db.Exec(r.Context(), `DELETE FROM email_templates
		WHERE scope = 'tenant' AND company_id::text = $1 AND kind = $2`, cid, kind); err != nil {
		handleErr(w, err)
		return
	}
	s.listTenantTemplates(w, r)
}

func (s *Server) deletePlatformTemplate(w http.ResponseWriter, r *http.Request) {
	kind := r.PathValue("kind")
	if _, err := s.db.Exec(r.Context(), `DELETE FROM email_templates
		WHERE scope = 'platform' AND kind = $1`, kind); err != nil {
		handleErr(w, err)
		return
	}
	s.listPlatformTemplates(w, r)
}

// Guard against someone importing this file without using the pgx package.
var _ = errors.New

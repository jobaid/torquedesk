package api

// Vehicle Intelligence & Parts merchant adapters.
//
// Each real provider implements MerchantAdapter. Capabilities flag which
// surfaces the UI should show. All adapters start in the "requires auth"
// state and return ErrNotConfigured until a shop connects a real account
// via Settings → Integrations with provider-issued credentials.
//
// Why stubs: CARFAX requires a signed Service Shops partner agreement before
// they issue API credentials. Advance Auto Parts has no public API — real
// catalog/pricing access goes through PartsTech (aggregator) or a direct
// commercial contract. These stubs guard the surface so the add-on can ship
// to a tenant today and switch to live calls as soon as credentials arrive,
// without a frontend rewrite.

import (
	"context"
	"errors"
	"time"
)

var ErrNotConfigured = errors.New("integration requires provider authorization — contact support to connect your account")

type MerchantKind string

const (
	KindVehicleHistory MerchantKind = "vehicle_history"
	KindPartsPricing   MerchantKind = "parts_pricing"
)

type Capabilities struct {
	ReportRequest bool
	CatalogSearch bool
	PriceQuote    bool
	Ordering      bool
}

type ReportRequestResult struct {
	Status     string    // 'pending_authorization' | 'completed' | 'failed'
	ReportURL  string    // provider-hosted URL
	Error      string
	Completed  time.Time
}

type QuoteItem struct {
	Provider       string
	MerchantPartNo string
	Description    string
	Classification string
	Fitment        string
	UnitPrice      float64
	Core           float64
	Shipping       float64
	Fees           float64
	Currency       string
	Availability   string
	DeliveryEst    string
	RetrievedAt    time.Time
}

type QuoteRequest struct {
	VIN         string
	SearchTerm  string
	PartNumber  string
}

type MerchantAdapter interface {
	Provider() string
	Kind() MerchantKind
	Capabilities() Capabilities
	// Credentials() returns a short display label and the shape of the
	// credential blob for the connect UI (never returns secret material).
	CredentialSchema() []CredentialField
}

type VehicleHistoryAdapter interface {
	MerchantAdapter
	RequestReport(ctx context.Context, creds []byte, vin string) (ReportRequestResult, error)
}

type PartsAdapter interface {
	MerchantAdapter
	Quote(ctx context.Context, creds []byte, req QuoteRequest) ([]QuoteItem, error)
}

type CredentialField struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Secret   bool   `json:"secret"`
	Required bool   `json:"required"`
}

// ---------------------------------------------------------------------------
// CARFAX — stub. Real integration: CARFAX Service Shops partner API.
// ---------------------------------------------------------------------------

type carfaxAdapter struct{}

func (carfaxAdapter) Provider() string     { return "carfax" }
func (carfaxAdapter) Kind() MerchantKind   { return KindVehicleHistory }
func (carfaxAdapter) Capabilities() Capabilities {
	return Capabilities{ReportRequest: true}
}
func (carfaxAdapter) CredentialSchema() []CredentialField {
	return []CredentialField{
		{Key: "partner_id", Label: "CARFAX Partner ID", Required: true},
		{Key: "api_key", Label: "CARFAX API Key", Secret: true, Required: true},
	}
}
func (carfaxAdapter) RequestReport(ctx context.Context, creds []byte, vin string) (ReportRequestResult, error) {
	if len(creds) == 0 {
		return ReportRequestResult{Status: "pending_authorization"}, ErrNotConfigured
	}
	// Real impl: POST to CARFAX Service Shops /vhrsummary with partner_id + api_key,
	// return the hosted report URL. Not reachable until partnership signed.
	return ReportRequestResult{Status: "pending_authorization", Error: "CARFAX live calls not wired in Phase 1"}, nil
}

// ---------------------------------------------------------------------------
// PartsTech — stub. Real integration: PartsTech Pro API (aggregator across
// 40+ suppliers including Advance/Carquest, NAPA, WorldPac).
// ---------------------------------------------------------------------------

type partstechAdapter struct{}

func (partstechAdapter) Provider() string   { return "partstech" }
func (partstechAdapter) Kind() MerchantKind { return KindPartsPricing }
func (partstechAdapter) Capabilities() Capabilities {
	return Capabilities{CatalogSearch: true, PriceQuote: true}
}
func (partstechAdapter) CredentialSchema() []CredentialField {
	return []CredentialField{
		{Key: "api_key", Label: "PartsTech API Key", Secret: true, Required: true},
	}
}
func (partstechAdapter) Quote(ctx context.Context, creds []byte, req QuoteRequest) ([]QuoteItem, error) {
	if len(creds) == 0 {
		return nil, ErrNotConfigured
	}
	// Real impl: POST /punchout/catalog/quote with VIN + searchTerm.
	return nil, nil
}

// ---------------------------------------------------------------------------
// Advance Auto Parts — stub. No public API; this adapter exists so that if
// a direct commercial contract is signed later, a native connector lands
// without a frontend change.
// ---------------------------------------------------------------------------

type advanceAdapter struct{}

func (advanceAdapter) Provider() string   { return "advance" }
func (advanceAdapter) Kind() MerchantKind { return KindPartsPricing }
func (advanceAdapter) Capabilities() Capabilities {
	return Capabilities{PriceQuote: true}
}
func (advanceAdapter) CredentialSchema() []CredentialField {
	return []CredentialField{
		{Key: "account_id", Label: "Advance Pro Account ID", Required: true},
		{Key: "api_key", Label: "Advance Commercial API Key", Secret: true, Required: true},
	}
}
func (advanceAdapter) Quote(ctx context.Context, creds []byte, req QuoteRequest) ([]QuoteItem, error) {
	if len(creds) == 0 {
		return nil, ErrNotConfigured
	}
	return nil, nil
}

// ---------------------------------------------------------------------------
// Registry — single source of truth for which providers exist.
// ---------------------------------------------------------------------------

var merchantRegistry = []MerchantAdapter{
	carfaxAdapter{},
	partstechAdapter{},
	advanceAdapter{},
}

func findAdapter(provider string) MerchantAdapter {
	for _, a := range merchantRegistry {
		if a.Provider() == provider {
			return a
		}
	}
	return nil
}

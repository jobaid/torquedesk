# Graph Report - .  (2026-10-03)

## Corpus Check
- 82 files · ~72,521 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 520 nodes · 1194 edges · 22 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output
- Edge kinds: contains: 385 · imports: 383 · imports_from: 248 · calls: 116 · method: 50 · references: 10 · conceptually_related_to: 1 · implements: 1

## God Nodes (most connected - your core abstractions)
1. `Server` - 50 edges
2. `useApp` - 32 edges
3. `toast` - 25 edges
4. `EmptyState()` - 20 edges
5. `vehicleLabel()` - 14 edges
6. `Field()` - 11 edges
7. `api()` - 11 edges
8. `money()` - 10 edges
9. `useSettings` - 10 edges
10. `useShop` - 10 edges

## Surprising Connections (you probably didn't know these)
- `index.html entry` --references--> `src/main.jsx`  [EXTRACTED]
  index.html → src/main.jsx
- `index.html entry` --implements--> `TorqueDesk`  [EXTRACTED]
  index.html → README.md

## Communities

### Community 0 - "Vehicle Specs & TSBs"
Cohesion: 0.06
Nodes (29): SPEC_CATEGORIES, SPECS, TSB_INDEX, TSBS, vehicleLabel(), vehicleSub(), SHORTCUTS, FOOT_NAV (+21 more)

### Community 1 - "Frontend API Client"
Cohesion: 0.07
Nodes (54): api(), ApiError, openFile(), DocumentOptions(), EstimateSettings(), FOOTER_SHOW, FOOTER_TEXT, HEADER_SHOW (+46 more)

### Community 2 - "Document Sheet & Modals"
Cohesion: 0.06
Nodes (33): buildPreviewDoc(), DocumentSheet(), fmtDate(), fmtDateTime(), SAMPLE_STATEMENT, dateTime(), greeting(), money() (+25 more)

### Community 3 - "Components & Maintenance"
Cohesion: 0.06
Nodes (23): COMPONENT_INDEX, COMPONENTS, itemsDueAt(), MAINT_INTERVALS, MAINT_ITEMS, BATTERY_OFF, CATEGORIES, GROUP_INDEX (+15 more)

### Community 4 - "DTC Diagnostic Codes"
Cohesion: 0.07
Nodes (19): DTC_INDEX, DTCS, explainCode(), normalizeDtc(), PREFIX, SUBSYS, SYMPTOM_INDEX, SYMPTOMS (+11 more)

### Community 5 - "Vehicle Catalog"
Cohesion: 0.10
Nodes (19): CATALOG, defaultTransmission(), makeFromWmi(), MAKES, makesForYear(), modelInfo(), modelsFor(), TRANSMISSIONS (+11 more)

### Community 6 - "App Shell & Pages"
Cohesion: 0.08
Nodes (20): useThemeSync(), Bulletins, ComponentsPage, Customers, Dashboard, Diagnostics, DtcPage, Favorites (+12 more)

### Community 7 - "Server HTTP & Errors"
Cohesion: 0.10
Nodes (5): apiError, httpError, Server, readUpload(), ValidationError

### Community 8 - "Resource Framework"
Cohesion: 0.20
Nodes (10): Field, Kind, label(), normalize(), pathID(), sameValue(), selectExpr(), show() (+2 more)

### Community 9 - "Document API Handler"
Cohesion: 0.19
Nodes (11): docInput, allocateNumber(), attachPayments(), checkSnapshotJSON(), cleanItems(), defaultTaxIDs(), markupPrice(), nullJSON() (+3 more)

### Community 10 - "Settings Schema Migration"
Cohesion: 0.13
Nodes (17): app_secrets, document_header_footer, document_number_settings, document_options, document_preferences, documents, estimate_settings, labor_rates (+9 more)

### Community 11 - "Totals & Tax Math"
Cohesion: 0.25
Nodes (12): DocTotals, feeResult, lineResult, taxResult, CalcFee(), ComputeTotals(), dec(), isSet() (+4 more)

### Community 12 - "Settings Bundle API"
Cohesion: 0.20
Nodes (3): Bundle, laborRates(), numbering()

### Community 13 - "Auth & Permissions"
Cohesion: 0.32
Nodes (4): userFrom(), ctxKey, loginReq, User

### Community 14 - "HTTP Middleware"
Cohesion: 0.38
Nodes (5): handleErr(), logRequests(), writeErr(), writeJSON(), statusWriter

### Community 15 - "Reports Schema"
Cohesion: 0.60
Nodes (5): document_fees, document_lines, document_taxes, documents, payments

### Community 16 - "Demo Seed Data"
Cohesion: 0.67
Nodes (2): itoa(), join()

### Community 17 - "HTML Entry & Branding"
Cohesion: 0.67
Nodes (3): index.html entry, src/main.jsx, TorqueDesk

### Community 18 - "Server Main"
Cohesion: 0.83
Nodes (3): envOr(), itoa(), main()

### Community 21 - "Settings UI Shell"
Cohesion: 1.00
Nodes (1): kit.jsx shared helpers

### Community 22 - "React Router Entry"
Cohesion: 1.00
Nodes (1): router

### Community 24 - "Auth Login Demo"
Cohesion: 1.00
Nodes (1): auth.go login (demo)

## Knowledge Gaps
- **95 isolated node(s):** `ctxKey`, `loginReq`, `queryer`, `docInput`, `Kind` (+90 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Demo Seed Data`** (2 nodes): `itoa()`, `join()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Settings UI Shell`** (1 nodes): `kit.jsx shared helpers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `React Router Entry`** (1 nodes): `router`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Login Demo`** (1 nodes): `auth.go login (demo)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Server` connect `Server HTTP & Errors` to `Document API Handler`, `Settings Bundle API`, `Resource Framework`, `HTTP Middleware`, `Auth & Permissions`, `Totals & Tax Math`, `Demo Seed Data`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `useApp` connect `Vehicle Specs & TSBs` to `Document Sheet & Modals`, `Frontend API Client`, `App Shell & Pages`, `Components & Maintenance`, `DTC Diagnostic Codes`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `toast` connect `Vehicle Specs & TSBs` to `Document Sheet & Modals`, `DTC Diagnostic Codes`, `Components & Maintenance`, `Frontend API Client`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `ctxKey`, `loginReq`, `queryer` to the rest of the system?**
  _95 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Vehicle Specs & TSBs` be split into smaller, more focused modules?**
  _Cohesion score 0.061621621621621624 - nodes in this community are weakly interconnected._
- **Should `Frontend API Client` be split into smaller, more focused modules?**
  _Cohesion score 0.06564364876385337 - nodes in this community are weakly interconnected._
- **Should `Document Sheet & Modals` be split into smaller, more focused modules?**
  _Cohesion score 0.055523085914669784 - nodes in this community are weakly interconnected._
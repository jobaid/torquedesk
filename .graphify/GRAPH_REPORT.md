# Graph Report - .  (2026-10-18)

## Corpus Check
- 213 files · ~238,514 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1709 nodes · 3139 edges · 115 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output
- Edge kinds: contains: 1072 · imports: 603 · calls: 571 · method: 420 · imports_from: 408 · references: 62 · shares_data_with: 2 · semantically_similar_to: 1

## God Nodes (most connected - your core abstractions)
1. `Server` - 395 edges
2. `useApp` - 43 edges
3. `toast` - 35 edges
4. `api()` - 29 edges
5. `EmptyState()` - 27 edges
6. `ownerApi()` - 20 edges
7. `Card()` - 16 edges
8. `PageHeader()` - 16 edges
9. `SectionHead()` - 15 edges
10. `vehicleLabel()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Off-box backup (rclone to Google Drive)` --semantically_similar_to--> `Docker Migration Guide`  [INFERRED] [semantically similar]
  scripts/BACKUP.md → docs/DOCKER_MIGRATION.md
- `scripts/rclone-backup.sh` --calls--> `db service (Postgres 16)`  [INFERRED]
  scripts/BACKUP.md → docker-compose.yml
- `scripts/rclone-backup.sh` --shares_data_with--> `torquedesk_data volume`  [INFERRED]
  scripts/BACKUP.md → docker-compose.yml
- `server service (TorqueDesk Go API)` --references--> `Docker Migration Guide`  [EXTRACTED]
  docker-compose.yml → docs/DOCKER_MIGRATION.md
- `Docker Migration Guide` --references--> `db service (Postgres 16)`  [EXTRACTED]
  docs/DOCKER_MIGRATION.md → docker-compose.yml

## Communities

### Community 0 - "API Server Routing"
Cohesion: 0.02
Nodes (2): apiError, Server

### Community 1 - "Documents & Sheets UI"
Cohesion: 0.06
Nodes (25): DocumentSheet(), fmtDate(), fmtDateTime(), dateTime(), formatPhone(), greeting(), initials(), money() (+17 more)

### Community 2 - "App Shell & Theming"
Cohesion: 0.03
Nodes (55): useThemeSync(), Bulletins, ComponentsPage, CustomerBroadcast, Customers, Dashboard, Diagnostics, DtcPage (+47 more)

### Community 3 - "Order & Agreement UI"
Cohesion: 0.08
Nodes (17): vehicleLabel(), vehicleSub(), SHORTCUTS, FOOT_NAV, NAV, PAGE_META, relTime(), RESULT_TYPES (+9 more)

### Community 4 - "API Client & Broadcast"
Cohesion: 0.07
Nodes (21): api(), ApiError, openFile(), Addons(), Billing(), EmailTemplates(), Appearance(), AuditLog() (+13 more)

### Community 5 - "Vehicle Catalog Data"
Cohesion: 0.06
Nodes (20): CATALOG, defaultTransmission(), makeFromWmi(), MAKES, makesForYear(), modelInfo(), modelsFor(), TRANSMISSIONS (+12 more)

### Community 6 - "Reports Common Utils"
Cohesion: 0.11
Nodes (19): buildQuery(), COLORS, downloadCSV(), fetchReport(), fmtCompact(), fmtMoney(), logExport(), pad() (+11 more)

### Community 7 - "Backup & Financial Settings"
Cohesion: 0.09
Nodes (32): BackupSettings(), FEE_FIELDS, LABOR_FIELDS, LaborRates(), MARKUP_FIELDS, Markups(), pickFields(), ShopFees() (+24 more)

### Community 8 - "Owner API DTOs"
Cohesion: 0.08
Nodes (22): addressInput, changeEmailReq, companyInput, companyOwnerPatch, companyPatch, mfaEnableReq, clientIP(), daysUntil() (+14 more)

### Community 9 - "Floating Chat"
Cohesion: 0.07
Nodes (15): centerStyle, ChatThread(), iconBtnStyle, cardStyle, CONDITION_MAP, groupedItems(), InspectionReport(), itemsOf() (+7 more)

### Community 10 - "Credential Adapters"
Cohesion: 0.07
Nodes (12): advanceAdapter, Capabilities, carfaxAdapter, CredentialField, MerchantAdapter, MerchantKind, PartsAdapter, partstechAdapter (+4 more)

### Community 11 - "Backup Export Backend"
Cohesion: 0.12
Nodes (16): allAsJSON(), autoDir(), autoFilename(), backupDir(), listKind(), manualDir(), manualFilename(), mustJSON() (+8 more)

### Community 12 - "Specs & TSBs Catalog"
Cohesion: 0.11
Nodes (11): SPEC_CATEGORIES, SPECS, TSB_INDEX, TSBS, groupResults(), INDEX, search(), SUGGESTIONS (+3 more)

### Community 13 - "Owner Admin Pages"
Cohesion: 0.16
Nodes (10): AddonRow(), addonStatusMap(), inputStyle, Card(), money(), PageHeader(), Select(), StatusPill() (+2 more)

### Community 14 - "Authorizations API"
Cohesion: 0.11
Nodes (14): authEventDTO, authItemDTO, authItemSeed, authorizationDTO, firstFloat(), firstStr(), insertAuthEvent(), round2() (+6 more)

### Community 15 - "Technician Links"
Cohesion: 0.10
Nodes (9): techAddItemReq, techContext, techItemPatch, techLinkDTO, techMetaReq, extractVehicle(), msOrNil(), recalcInspectionCountsNoTx() (+1 more)

### Community 16 - "Support Page UI"
Cohesion: 0.08
Nodes (16): btnGhost, btnPrimary, card, CATEGORIES, errBox, fmtDate(), inp, pre (+8 more)

### Community 17 - "Resource Framework"
Cohesion: 0.21
Nodes (10): Field, Kind, label(), normalize(), pathID(), sameValue(), selectExpr(), show() (+2 more)

### Community 18 - "Pay Return & Logo"
Cohesion: 0.10
Nodes (12): cardStyle, shellStyle, banner(), card, ctaBtn(), cycleBtn(), eyeBtn, grid2 (+4 more)

### Community 19 - "Support Styles"
Cohesion: 0.09
Nodes (16): btnPrimary, card, CATEGORIES, CATEGORY_KEYS, errBox, fmtDate(), inp, OwnerTicket() (+8 more)

### Community 20 - "Reports Backend"
Cohesion: 0.17
Nodes (11): exportLog, reportFilter, groupedByStaff(), groupedSales(), monthsBetween(), parseDate(), parseFilter(), paymentsByMethod() (+3 more)

### Community 21 - "Components & Wiring Diagrams"
Cohesion: 0.13
Nodes (7): COMPONENT_INDEX, COMPONENTS, DIAGRAM_INDEX, DIAGRAMS, WIRE_COLORS, colorOf(), WireSwatch()

### Community 22 - "Payment Gateways"
Cohesion: 0.14
Nodes (8): gatewayDTO, gatewayInput, scanGateway(), snippet(), validMode(), validProvider(), VerifyProviderKey(), gatewayScope

### Community 23 - "Mail & Notifications"
Cohesion: 0.12
Nodes (10): mailer, mailSendReq, extractCustEmail(), htmlEscape(), oauthSMTPHost(), scanNotif(), notifSettingsDTO, notifSettingsPatch (+2 more)

### Community 24 - "Auth API"
Cohesion: 0.11
Nodes (7): userFrom(), changePasswordReq, companyLoginReq, ctxKey, loginReq, mfaCodeReq, User

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (11): docInput, allocateNumber(), attachPayments(), checkSnapshotJSON(), cleanItems(), defaultTaxIDs(), markupPrice(), nullJSON() (+3 more)

### Community 26 - "Community 26"
Cohesion: 0.11
Nodes (10): BATTERY_OFF, CATEGORIES, GROUP_INDEX, LIFT, PROCEDURE_INDEX, PROCEDURES, WHEEL_OFF, WHEEL_ON (+2 more)

### Community 27 - "Community 27"
Cohesion: 0.14
Nodes (7): asideStyle, NAV, shellStyle, inputStyle, ownerApi(), OwnerApiError, useOwner

### Community 28 - "Community 28"
Cohesion: 0.15
Nodes (10): countRows(), ownerAutoDir(), ownerBackupBaseDir(), ownerListKind(), ownerManualDir(), upsertRows(), verifyOwnerArchive(), ownerBackupItem (+2 more)

### Community 29 - "Community 29"
Cohesion: 0.13
Nodes (6): KNOWN_KEYS, PROVIDERS, FEATURE_GROUPS, Btn(), Field(), Input()

### Community 30 - "Community 30"
Cohesion: 0.12
Nodes (10): inspectionCreateReq, inspectionDTO, inspectionItem, inspectionItemPatch, inspectionPatch, inspectionPhoto, recalcInspectionCounts(), scanInspection() (+2 more)

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (11): exchangeOAuthCode(), fetchUserEmail(), oauthRedirectURI(), refreshOAuthAccessToken(), signOAuthState(), verifyOAuthState(), writeCallbackPage(), oauthProvider (+3 more)

### Community 32 - "Community 32"
Cohesion: 0.11
Nodes (16): buildPreviewDoc(), SAMPLE_STATEMENT, DocumentOptions(), EstimateSettings(), FOOTER_SHOW, FOOTER_TEXT, HEADER_SHOW, HeaderFooter() (+8 more)

### Community 33 - "Community 33"
Cohesion: 0.13
Nodes (17): app_secrets, document_header_footer, document_number_settings, document_options, document_preferences, documents, estimate_settings, labor_rates (+9 more)

### Community 34 - "Community 34"
Cohesion: 0.13
Nodes (11): publicOrigin(), stripeCreateCheckoutSession(), stripeRetrieveSession(), verifyStripeSignature(), paymentLinkReq, paymentLinkRes, stripeCheckoutInput, stripeCheckoutObject (+3 more)

### Community 35 - "Community 35"
Cohesion: 0.21
Nodes (7): createTicketReq, ownerUpdateReq, replyReq, logSupportMail(), supportBrand(), supportEmailShell(), supportPortalBase()

### Community 36 - "Community 36"
Cohesion: 0.13
Nodes (4): Bundle, laborRates(), numbering(), readUpload()

### Community 37 - "Community 37"
Cohesion: 0.18
Nodes (4): platformEmailShell(), platformMailDTO, platformMailPatch, platformTestReq

### Community 38 - "Community 38"
Cohesion: 0.16
Nodes (6): DTC_INDEX, DTCS, explainCode(), normalizeDtc(), PREFIX, SUBSYS

### Community 39 - "Community 39"
Cohesion: 0.16
Nodes (8): SYMPTOM_INDEX, SYMPTOMS, ICONS, useToast, FavoriteButton(), SEVERITY, TOAST_ICON, useOutside()

### Community 40 - "Community 40"
Cohesion: 0.25
Nodes (12): DocTotals, feeResult, lineResult, taxResult, CalcFee(), ComputeTotals(), dec(), isSet() (+4 more)

### Community 41 - "Community 41"
Cohesion: 0.21
Nodes (11): addonDTO, addonInput, stripeCancelAtPeriodEnd(), stripeCreateProductAndPrice(), stripeCreateProductAndPriceWithInterval(), stripeCreateSubscriptionCheckout(), stripeCreateSubscriptionCheckoutV2(), stripeForm() (+3 more)

### Community 42 - "Community 42"
Cohesion: 0.15
Nodes (1): RECO_LABELS

### Community 44 - "Community 44"
Cohesion: 0.18
Nodes (7): uid(), applyMarkup(), flushSaves(), pending, priceWithSnapshot(), SEED_CUSTOMERS, timers

### Community 45 - "Community 45"
Cohesion: 0.22
Nodes (7): hashResetToken(), newResetToken(), resetBaseURL(), sendResetEmail(), resetConfirm, resetRequest, resetTargetKind

### Community 46 - "Community 46"
Cohesion: 0.18
Nodes (3): newShareToken(), sanitizeDocForPublic(), shareLinkDTO

### Community 47 - "Community 47"
Cohesion: 0.22
Nodes (5): fmtSize(), OffsiteTile(), relTime(), td, th

### Community 48 - "Community 48"
Cohesion: 0.20
Nodes (4): isPermanentMailError(), scanEmailJobs(), emailEnqueue, emailJobRow

### Community 49 - "Community 49"
Cohesion: 0.24
Nodes (6): itemsDueAt(), MAINT_INTERVALS, MAINT_ITEMS, STOPS, laborRateOf(), VehicleContext()

### Community 50 - "Community 50"
Cohesion: 0.22
Nodes (6): banner(), ownerTd, ownerTh, PlatformEmail(), PRESETS, selStyle

### Community 51 - "Community 51"
Cohesion: 0.20
Nodes (2): PAGES, SECTIONS

### Community 52 - "Community 52"
Cohesion: 0.28
Nodes (5): photoDTO, bytesReader(), photoBaseDir(), photoDiskPath(), sliceReader

### Community 53 - "Community 53"
Cohesion: 0.36
Nodes (9): Off-box backup (rclone to Google Drive), scripts/rclone-backup.sh, torquedesk-backup.service, torquedesk-backup.timer, db service (Postgres 16), server service (TorqueDesk Go API), torquedesk_data volume, torquedesk_db volume (+1 more)

### Community 54 - "Community 54"
Cohesion: 0.36
Nodes (8): companies, documents, saas_payment_methods, saas_subscription_charges, shop_payment_gateways, shop_payment_intents, subscriptions, webhook_events

### Community 55 - "Community 55"
Cohesion: 0.32
Nodes (4): broadcastImageDir(), randomHex(), sweepBroadcastImages(), shopBroadcastReq

### Community 56 - "Community 56"
Cohesion: 0.32
Nodes (5): ipLimiter, loginBucket, clientIPForLimit(), intToStr(), loginLimit()

### Community 57 - "Community 57"
Cohesion: 0.36
Nodes (1): publishMessageEvent()

### Community 58 - "Community 58"
Cohesion: 0.29
Nodes (5): featuresFromPlan(), signupStripePriceFor(), stripePaymentStatus(), signupPlan, signupReq

### Community 61 - "Community 61"
Cohesion: 0.25
Nodes (2): ROLE_META, ROLES

### Community 62 - "Community 62"
Cohesion: 0.25
Nodes (3): CONDITIONS, inputStyle, RECOMMENDATIONS

### Community 63 - "Community 63"
Cohesion: 0.25
Nodes (4): card, h2, link, p

### Community 64 - "Community 64"
Cohesion: 0.25
Nodes (4): EMAIL_PRESETS, NotificationSettings(), td, th

### Community 65 - "Community 65"
Cohesion: 0.29
Nodes (2): customerIn, scanCustomer()

### Community 66 - "Community 66"
Cohesion: 0.29
Nodes (2): fullDumpDir(), fullDumpItem

### Community 67 - "Community 67"
Cohesion: 0.33
Nodes (1): getEnv()

### Community 68 - "Community 68"
Cohesion: 0.38
Nodes (5): handleErr(), logRequests(), writeErr(), writeJSON(), statusWriter

### Community 69 - "Community 69"
Cohesion: 0.48
Nodes (6): companies, saas_admin_users, support_audit, support_messages, support_ticket_counters, support_tickets

### Community 70 - "Community 70"
Cohesion: 0.52
Nodes (6): companies, integration_audit_logs, parts_price_quotes, parts_quote_items, shop_merchant_connections, vehicle_history_report_requests

### Community 71 - "Community 71"
Cohesion: 0.40
Nodes (4): jsonUnmarshalFloat(), parseFloat(), myBillingDTO, setupBillingReq

### Community 72 - "Community 72"
Cohesion: 0.33
Nodes (2): stripTags(), broadcastReq

### Community 73 - "Community 73"
Cohesion: 0.40
Nodes (4): catalogEntry, normalizeAnswer(), validQIdx(), setQReq

### Community 75 - "Community 75"
Cohesion: 0.33
Nodes (4): applyVars(), templateDef, templateDTO, templatePut

### Community 76 - "Community 76"
Cohesion: 0.33
Nodes (1): httpEnvOn()

### Community 77 - "Community 77"
Cohesion: 0.40
Nodes (3): envOr(), itoa(), join()

### Community 78 - "Community 78"
Cohesion: 0.33
Nodes (5): calcFee(), doc, snapshot, supplies, t

### Community 79 - "Community 79"
Cohesion: 0.60
Nodes (5): document_fees, document_lines, document_taxes, documents, payments

### Community 80 - "Community 80"
Cohesion: 0.67
Nodes (5): companies, company_owners, saas_admin_users, saas_audit_log, subscriptions

### Community 81 - "Community 81"
Cohesion: 0.60
Nodes (5): companies, customers, documents, inspection_items, inspections

### Community 83 - "Community 83"
Cohesion: 0.40
Nodes (4): connectionDTO, connectReq, quoteBody, vhrReq

### Community 84 - "Community 84"
Cohesion: 0.40
Nodes (3): demoCache, statusCache, statusEntry

### Community 87 - "Community 87"
Cohesion: 0.50
Nodes (2): hotp(), VerifyTOTP()

### Community 88 - "Community 88"
Cohesion: 0.60
Nodes (4): companies, company_features, document_number_settings, documents

### Community 89 - "Community 89"
Cohesion: 0.90
Nodes (4): companies, document_auth_events, document_authorizations, documents

### Community 90 - "Community 90"
Cohesion: 0.70
Nodes (4): envOr(), itoa(), main(), splitEmailPassword()

### Community 91 - "Community 91"
Cohesion: 0.50
Nodes (3): messageDTO, postPublicMsgReq, postShopMsgReq

### Community 92 - "Community 92"
Cohesion: 0.50
Nodes (2): paymentInput, paymentPatch

### Community 93 - "Community 93"
Cohesion: 0.50
Nodes (1): scanPayment()

### Community 95 - "Community 95"
Cohesion: 0.50
Nodes (3): stripePaymentMethod, stripePMList, fetchCustomerPaymentFingerprint()

### Community 96 - "Community 96"
Cohesion: 0.83
Nodes (3): companies, document_share_tokens, documents

### Community 97 - "Community 97"
Cohesion: 0.83
Nodes (3): inspection_item_photos, inspection_items, inspections

### Community 98 - "Community 98"
Cohesion: 0.83
Nodes (3): companies, document_messages, documents

### Community 99 - "Community 99"
Cohesion: 0.83
Nodes (3): companies, inspection_tokens, inspections

### Community 100 - "Community 100"
Cohesion: 0.83
Nodes (3): addon_catalog, companies, shop_addon_subscriptions

### Community 101 - "Community 101"
Cohesion: 0.67
Nodes (2): createAdminReq, updateAdminReq

### Community 102 - "Community 102"
Cohesion: 0.67
Nodes (1): parseZipArchive()

### Community 103 - "Community 103"
Cohesion: 0.67
Nodes (1): writeOffsiteStatus()

### Community 104 - "Community 104"
Cohesion: 0.67
Nodes (2): planInput, planRow

### Community 105 - "Community 105"
Cohesion: 0.67
Nodes (1): companyFrom()

### Community 107 - "Community 107"
Cohesion: 1.00
Nodes (2): companies, customers

### Community 108 - "Community 108"
Cohesion: 1.00
Nodes (2): document_auth_items, document_authorizations

### Community 109 - "Community 109"
Cohesion: 1.00
Nodes (2): companies, notification_settings

### Community 110 - "Community 110"
Cohesion: 1.00
Nodes (2): companies, email_oauth_tokens

### Community 111 - "Community 111"
Cohesion: 1.00
Nodes (2): companies, email_jobs

### Community 112 - "Community 112"
Cohesion: 1.00
Nodes (2): companies, email_templates

### Community 113 - "Community 113"
Cohesion: 1.00
Nodes (2): companies, trial_payment_fingerprints

### Community 115 - "Community 115"
Cohesion: 1.00
Nodes (1): updateFeaturesReq

### Community 116 - "Community 116"
Cohesion: 1.00
Nodes (1): httpError

### Community 117 - "Community 117"
Cohesion: 1.00
Nodes (1): ValidationError

### Community 118 - "Community 118"
Cohesion: 1.00
Nodes (2): Fixora index.html entrypoint, /src/main.jsx entry

### Community 119 - "Community 119"
Cohesion: 1.00
Nodes (1): password_reset_tokens

### Community 120 - "Community 120"
Cohesion: 1.00
Nodes (1): platform_mail_settings

### Community 121 - "Community 121"
Cohesion: 1.00
Nodes (1): signup_plans

### Community 122 - "Community 122"
Cohesion: 1.00
Nodes (1): router

### Community 123 - "Community 123"
Cohesion: 1.00
Nodes (1): Fixora Favicon (TF Monogram)

### Community 134 - "Community 134"
Cohesion: 1.00
Nodes (1): TorqueDesk

## Knowledge Gaps
- **334 isolated node(s):** `addonDTO`, `addonInput`, `stripeSubscription`, `ownerAddonPatch`, `stripeSubscriptionCheckoutInput` (+329 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `API Server Routing`** (2 nodes): `apiError`, `Server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `RECO_LABELS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `PAGES`, `SECTIONS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `publishMessageEvent()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (2 nodes): `ROLE_META`, `ROLES`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (2 nodes): `customerIn`, `scanCustomer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (2 nodes): `fullDumpDir()`, `fullDumpItem`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `getEnv()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (2 nodes): `stripTags()`, `broadcastReq`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `httpEnvOn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (2 nodes): `hotp()`, `VerifyTOTP()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (2 nodes): `paymentInput`, `paymentPatch`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (1 nodes): `scanPayment()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (2 nodes): `createAdminReq`, `updateAdminReq`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (1 nodes): `parseZipArchive()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (1 nodes): `writeOffsiteStatus()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 104`** (2 nodes): `planInput`, `planRow`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (1 nodes): `companyFrom()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 107`** (2 nodes): `companies`, `customers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (2 nodes): `document_auth_items`, `document_authorizations`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 109`** (2 nodes): `companies`, `notification_settings`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 110`** (2 nodes): `companies`, `email_oauth_tokens`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 111`** (2 nodes): `companies`, `email_jobs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 112`** (2 nodes): `companies`, `email_templates`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 113`** (2 nodes): `companies`, `trial_payment_fingerprints`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 115`** (1 nodes): `updateFeaturesReq`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 116`** (1 nodes): `httpError`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 117`** (1 nodes): `ValidationError`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 118`** (2 nodes): `Fixora index.html entrypoint`, `/src/main.jsx entry`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 119`** (1 nodes): `password_reset_tokens`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 120`** (1 nodes): `platform_mail_settings`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 121`** (1 nodes): `signup_plans`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 122`** (1 nodes): `router`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 123`** (1 nodes): `Fixora Favicon (TF Monogram)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 134`** (1 nodes): `TorqueDesk`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Server` connect `API Server Routing` to `Community 116`, `Backup Export Backend`, `Community 25`, `Community 58`, `Payment Gateways`, `Auth API`, `Authorizations API`, `Community 72`, `Community 67`, `Community 36`, `Community 41`, `Owner API DTOs`, `Community 59`, `Technician Links`, `Community 60`, `Community 105`, `Community 30`, `Community 45`, `Community 43`, `Community 65`, `Community 34`, `Community 66`, `Community 93`, `Resource Framework`, `Community 46`, `Community 35`, `Community 52`, `Community 94`, `Community 71`, `Mail & Notifications`, `Community 31`, `Community 37`, `Community 85`, `Community 68`, `Community 102`, `Community 48`, `Community 86`, `Community 28`, `Community 103`, `Community 40`, `Community 75`, `Community 76`, `Reports Backend`, `Community 77`, `Community 55`, `Community 73`, `Community 57`, `Community 117`?**
  _High betweenness centrality (0.177) - this node is a cross-community bridge._
- **Why does `useApp` connect `Order & Agreement UI` to `Floating Chat`, `Documents & Sheets UI`, `API Client & Broadcast`, `App Shell & Theming`, `Specs & TSBs Catalog`, `Components & Wiring Diagrams`, `Community 39`, `Community 38`, `Community 42`, `Community 26`, `Backup & Financial Settings`, `Community 32`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `addonDTO`, `addonInput`, `stripeSubscription` to the rest of the system?**
  _334 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API Server Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.018627450980392157 - nodes in this community are weakly interconnected._
- **Should `Documents & Sheets UI` be split into smaller, more focused modules?**
  _Cohesion score 0.058653846153846154 - nodes in this community are weakly interconnected._
- **Should `App Shell & Theming` be split into smaller, more focused modules?**
  _Cohesion score 0.03333333333333333 - nodes in this community are weakly interconnected._
- **Should `Order & Agreement UI` be split into smaller, more focused modules?**
  _Cohesion score 0.07686932215234102 - nodes in this community are weakly interconnected._
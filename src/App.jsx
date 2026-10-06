import { lazy, Suspense, useEffect } from 'react'
import { ServerOff, RotateCw } from 'lucide-react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import Login from './pages/Login'
import { useApp } from './store/useApp'
import { useThemeSync } from './lib/useTheme'
import { SkeletonCard, EmptyState } from './components/ui'
import { useSettings } from './store/useSettings'
import { useShop } from './store/useShop'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const VehiclePage = lazy(() => import('./pages/VehiclePage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const RepairInfo = lazy(() => import('./pages/RepairInfo'))
const Diagnostics = lazy(() => import('./pages/Diagnostics'))
const DtcPage = lazy(() => import('./pages/DtcPage'))
const WiringPage = lazy(() => import('./pages/WiringPage'))
const Maintenance = lazy(() => import('./pages/Maintenance'))
const Specifications = lazy(() => import('./pages/Specifications'))
const Bulletins = lazy(() => import('./pages/Bulletins'))
const ComponentsPage = lazy(() => import('./pages/ComponentsPage'))
const Favorites = lazy(() => import('./pages/Favorites'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const Orders = lazy(() => import('./pages/Orders'))
const OrderEditor = lazy(() => import('./pages/OrderEditor'))
const Customers = lazy(() => import('./pages/Customers'))
const SettingsLayout = lazy(() => import('./pages/settings/SettingsLayout'))
const ReportsLayout = lazy(() => import('./pages/reports/ReportsLayout'))
const SalesDashboard = lazy(() => import('./pages/reports/SalesDashboard'))
const SalesSummary = lazy(() => import('./pages/reports/SalesSummary'))
const PartsProfit = lazy(() => import('./pages/reports/PartsProfit'))
const PaymentsReport = lazy(() => import('./pages/reports/Payments'))
const TaxReport = lazy(() => import('./pages/reports/Tax'))
const Profile = lazy(() => import('./pages/Profile'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Inspections = lazy(() => import('./pages/Inspections'))

// Toraquedesk SaaS Owner Portal — its own self-contained route tree. It does NOT
// render inside AppShell and does NOT touch the main app's auth state.
const OwnerLogin = lazy(() => import('./pages/owner/OwnerLogin'))
const OwnerLayout = lazy(() => import('./pages/owner/OwnerLayout'))
const OwnerDashboard = lazy(() => import('./pages/owner/OwnerDashboard'))
const OwnerCompanies = lazy(() => import('./pages/owner/Companies'))
const OwnerAddCompany = lazy(() => import('./pages/owner/AddCompany'))
const OwnerCompanyDetail = lazy(() => import('./pages/owner/CompanyDetail'))
const OwnerSubscriptions = lazy(() => import('./pages/owner/Subscriptions'))
const OwnerAuditLog = lazy(() => import('./pages/owner/AuditLog'))
const OwnerPlaceholder = lazy(() => import('./pages/owner/Placeholder'))
const OwnerSettings = lazy(() => import('./pages/owner/Settings'))
const OwnerBilling = lazy(() => import('./pages/owner/Billing'))

function PageFallback() {
  return (
    <div className="page stack gap-16">
      <SkeletonCard lines={2} />
      <div className="grid-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
    </div>
  )
}

const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const PayReturn = lazy(() => import('./pages/PayReturn'))

export default function App() {
  useThemeSync()
  // Password-reset lands outside normal auth gates — the link in the email
  // works whether or not the user has an active session.
  if (typeof window !== 'undefined' && (window.location.pathname === '/reset-password' || window.location.pathname === '/p/admin/reset-password' || window.location.pathname === '/owner-reset-password')) {
    return (
      <Suspense fallback={null}>
        <ResetPassword />
      </Suspense>
    )
  }
  // Stripe Checkout return pages — public, no auth. The customer's browser
  // lands here after they pay (or cancel) on Stripe-hosted pages.
  if (typeof window !== 'undefined' && (window.location.pathname === '/pay/success' || window.location.pathname === '/pay/cancel')) {
    return (
      <Suspense fallback={null}>
        <PayReturn outcome={window.location.pathname === '/pay/success' ? 'success' : 'cancel'} />
      </Suspense>
    )
  }
  // The owner-portal routes own their own auth and chrome; keep them separate
  // from the customer app's gating so a company user can never land in /p/admin
  // and vice-versa. Legacy /owner paths still redirect in so bookmarks keep working.
  if (typeof window !== 'undefined' && (
    window.location.pathname === '/p/admin/login' ||
    window.location.pathname.startsWith('/p/admin') ||
    window.location.pathname === '/owner-login' ||
    window.location.pathname.startsWith('/owner')
  )) {
    return (
      <Suspense fallback={null}>
        <Routes>
          <Route path="/p/admin/login" element={<OwnerLogin />} />
          <Route path="/owner-login" element={<OwnerLogin />} />
          <Route path="/p/admin" element={<OwnerLayout />}>
            <Route index element={<OwnerDashboard />} />
            <Route path="companies" element={<OwnerCompanies />} />
            <Route path="companies/new" element={<OwnerAddCompany />} />
            <Route path="companies/:id" element={<OwnerCompanyDetail />} />
            <Route path="subscriptions" element={<OwnerSubscriptions />} />
            <Route path="audit" element={<OwnerAuditLog />} />
            <Route path="users" element={<OwnerPlaceholder title="Users" body="Phase 1 scope: company owners are managed from each company's detail page." />} />
            <Route path="access" element={<OwnerPlaceholder title="Access Management" body="Access is controlled by changing a company's status from its detail page." />} />
            <Route path="urls" element={<OwnerPlaceholder title="Application URLs" body="Each company has an application URL on its detail page." />} />
            <Route path="billing" element={<OwnerBilling />} />
            <Route path="security" element={<OwnerPlaceholder title="Security" body="MFA is on the login page; broader security settings arrive later." />} />
            <Route path="settings" element={<OwnerSettings />} />
          </Route>
          <Route path="/owner" element={<OwnerLayout />}>
            <Route index element={<OwnerDashboard />} />
            <Route path="companies" element={<OwnerCompanies />} />
            <Route path="companies/new" element={<OwnerAddCompany />} />
            <Route path="companies/:id" element={<OwnerCompanyDetail />} />
            <Route path="subscriptions" element={<OwnerSubscriptions />} />
            <Route path="audit" element={<OwnerAuditLog />} />
            <Route path="users" element={<OwnerPlaceholder title="Users" body="Phase 1 scope: company owners are managed from each company's detail page. Platform-wide user management arrives in a later phase." />} />
            <Route path="access" element={<OwnerPlaceholder title="Access Management" body="Access is controlled by changing a company's status from its detail page. A dedicated matrix view lands in a later phase." />} />
            <Route path="urls" element={<OwnerPlaceholder title="Application URLs" body="Each company has an application URL on its detail page. Custom-domain management will be added in a later phase." />} />
            <Route path="billing" element={<OwnerBilling />} />
            <Route path="security" element={<OwnerPlaceholder title="Security" body="MFA, session management, and SSO settings are planned for a later phase. For now, owner passwords use Argon2id hashing." />} />
            <Route path="settings" element={<OwnerSettings />} />
          </Route>
        </Routes>
      </Suspense>
    )
  }
  const user = useApp((s) => s.user)
  if (!user?.token) return <Login />
  return <Boot />
}

/** Loads settings and documents from the API before showing the app. */
function Boot() {
  const { data, error, errorStatus, load } = useSettings()
  const logout = useApp((s) => s.logout)
  const loadDocuments = useShop((s) => s.loadDocuments)
  const loadCustomers = useShop((s) => s.loadCustomers)
  const docsLoaded = useShop((s) => s.docsLoaded)
  useEffect(() => {
    load().catch(() => {})
    loadDocuments()
    loadCustomers()
  }, [load, loadDocuments, loadCustomers])

  if (error && !data) {
    // 401 is handled by the API client (auto-logout). 403 here means the token
    // is valid but the role doesn't have settings.view — almost always because
    // this is a stale session from before the multi-tenancy migration (role
    // not in rolePerms map, or empty role). Offer a clean sign-out.
    const isAuth = errorStatus === 401 || errorStatus === 403
    return (
      <div className="page" style={{ maxWidth: 640, paddingTop: '12vh' }}>
        <div className="card">
          <EmptyState
            icon={ServerOff}
            title={isAuth ? 'Your session is no longer valid' : "Can't reach the TorqueDesk server"}
            action={
              isAuth
                ? <button className="btn btn-primary" onClick={() => logout()}>Sign in again</button>
                : <button className="btn btn-primary" onClick={() => { load().catch(() => {}); loadDocuments() }}><RotateCw size={16} />Try again</button>
            }
          >
            <div style={{ background: 'rgba(220,53,69,0.08)', border: '1px solid rgba(220,53,69,0.3)', padding: 12, borderRadius: 8, marginBottom: 12, fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-word' }}>
              <strong>Error {errorStatus || ''}:</strong> {error}
            </div>
            {isAuth
              ? 'This usually happens after an upgrade or role change. Sign in again to continue.'
              : <>Start it with <code>cd server &amp;&amp; go run .</code></>}
          </EmptyState>
        </div>
      </div>
    )
  }
  if (!data || !docsLoaded) return <PageFallback />

  return (
    <Suspense fallback={null}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<S><Dashboard /></S>} />
          <Route path="vehicle" element={<S><VehiclePage /></S>} />
          <Route path="search" element={<S><SearchPage /></S>} />
          <Route path="repair" element={<S><RepairInfo /></S>} />
          <Route path="repair/:id" element={<S><RepairInfo /></S>} />
          <Route path="diagnostics" element={<S><Diagnostics /></S>} />
          <Route path="diagnostics/:id" element={<S><Diagnostics /></S>} />
          <Route path="dtc" element={<S><DtcPage /></S>} />
          <Route path="dtc/:code" element={<S><DtcPage /></S>} />
          <Route path="wiring" element={<S><WiringPage /></S>} />
          <Route path="wiring/:id" element={<S><WiringPage /></S>} />
          <Route path="maintenance" element={<S><Maintenance /></S>} />
          <Route path="specifications" element={<S><Specifications /></S>} />
          <Route path="bulletins" element={<S><Bulletins /></S>} />
          <Route path="bulletins/:id" element={<S><Bulletins /></S>} />
          <Route path="components" element={<S><ComponentsPage /></S>} />
          <Route path="components/:id" element={<S><ComponentsPage /></S>} />
          <Route path="favorites" element={<S><Favorites /></S>} />
          <Route path="history" element={<S><HistoryPage /></S>} />
          <Route path="orders" element={<S><Orders /></S>} />
          <Route path="orders/:id" element={<S><OrderEditor /></S>} />
          <Route path="customers" element={<S><Customers /></S>} />
          <Route path="customers/:id" element={<S><Customers /></S>} />
          <Route path="inspections" element={<S><Inspections /></S>} />
          <Route path="inspections/:id" element={<S><Inspections /></S>} />
          <Route path="settings/*" element={<S><SettingsLayout /></S>} />
          <Route path="reports" element={<S><ReportsLayout /></S>}>
            <Route index element={<Navigate to="sales/dashboard" replace />} />
            <Route path="sales/dashboard" element={<S><SalesDashboard /></S>} />
            <Route path="sales/summary" element={<S><SalesSummary /></S>} />
            <Route path="sales/parts-profit" element={<S><PartsProfit /></S>} />
            <Route path="sales/payments" element={<S><PaymentsReport /></S>} />
            <Route path="sales/tax" element={<S><TaxReport /></S>} />
          </Route>
          <Route path="profile" element={<S><Profile /></S>} />
          <Route path="login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<S><NotFound /></S>} />
        </Route>
      </Routes>
    </Suspense>
  )
}

function S({ children }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>
}

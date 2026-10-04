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
const Profile = lazy(() => import('./pages/Profile'))
const NotFound = lazy(() => import('./pages/NotFound'))

function PageFallback() {
  return (
    <div className="page stack gap-16">
      <SkeletonCard lines={2} />
      <div className="grid-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
    </div>
  )
}

export default function App() {
  useThemeSync()
  const user = useApp((s) => s.user)
  // Sessions are issued by the Go API; older local-only sign-ins must sign in again.
  if (!user?.token) return <Login />
  return <Boot />
}

/** Loads settings and documents from the API before showing the app. */
function Boot() {
  const { data, error, load } = useSettings()
  const loadDocuments = useShop((s) => s.loadDocuments)
  const docsLoaded = useShop((s) => s.docsLoaded)
  useEffect(() => {
    load().catch(() => {})
    loadDocuments()
  }, [load, loadDocuments])

  if (error && !data) {
    return (
      <div className="page" style={{ maxWidth: 640, paddingTop: '12vh' }}>
        <div className="card">
          <EmptyState icon={ServerOff} title="Can't reach the TorqueDesk server" action={<button className="btn btn-primary" onClick={() => { load().catch(() => {}); loadDocuments() }}><RotateCw size={16} />Try again</button>}>
            {error} Start it with <code>cd server &amp;&amp; go run .</code>
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
          <Route path="settings/*" element={<S><SettingsLayout /></S>} />
          <Route path="reports/*" element={<S><ReportsLayout /></S>} />
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

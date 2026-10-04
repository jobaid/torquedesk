import { Suspense, lazy } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { BarChart3, FileText, Package, Wallet, Receipt } from 'lucide-react'
import { useApp } from '../../store/useApp'
import { EmptyState, SkeletonCard } from '../../components/ui'

const SalesDashboard = lazy(() => import('./SalesDashboard'))
const SalesSummary = lazy(() => import('./SalesSummary'))
const PartsProfit = lazy(() => import('./PartsProfit'))
const Payments = lazy(() => import('./Payments'))
const Tax = lazy(() => import('./Tax'))

const SECTIONS = [
  {
    label: 'Sales & Revenue',
    description: "What's been sold and how much money the shop is bringing in.",
    perm: 'sales_reports.view',
    items: [
      { to: 'sales/dashboard', label: 'Sales Dashboard', icon: BarChart3 },
      { to: 'sales/summary', label: 'Sales Summary', icon: FileText },
      { to: 'sales/parts-profit', label: 'Parts Profit', icon: Package },
    ],
  },
  {
    label: 'Billing & Payments',
    description: 'Focuses on invoices and payments.',
    perm: 'financial_reports.view',
    items: [
      { to: 'payments', label: 'Payments', icon: Wallet },
      { to: 'tax', label: 'Tax', icon: Receipt },
    ],
  },
]

export default function ReportsLayout() {
  const user = useApp((s) => s.user)
  const perms = user?.permissions || []
  const isAdmin = user?.role === 'admin'
  const hasPerm = (p) => isAdmin || perms.includes(p)
  const visibleSections = SECTIONS.filter((s) => hasPerm(s.perm))
  if (!user) {
    return (
      <div className="page">
        <div className="card" style={{ padding: 24 }}>
          <EmptyState title="Sign in required">Sign in to view reports.</EmptyState>
        </div>
      </div>
    )
  }
  return (
    <div className="page reports-page" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
      <aside className="card reports-sidebar" style={{ padding: 12, position: 'sticky', top: 12, alignSelf: 'start', maxHeight: 'calc(100vh - 24px)', overflow: 'auto' }}>
        {visibleSections.map((section) => (
          <div key={section.label} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '6px 10px' }}>
              {section.label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '0 10px 8px' }}>{section.description}</div>
            {section.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                style={{ padding: '8px 10px', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}
              >
                <it.icon size={16} />
                <span>{it.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </aside>
      <main>
        <Suspense fallback={<SkeletonCard lines={4} />}>
          <Routes>
            <Route index element={<Navigate to="sales/dashboard" replace />} />
            <Route path="sales/dashboard" element={<SalesDashboard />} />
            <Route path="sales/summary" element={<SalesSummary />} />
            <Route path="sales/parts-profit" element={<PartsProfit />} />
            <Route path="payments" element={<Payments />} />
            <Route path="tax" element={<Tax />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

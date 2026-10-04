import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, FileText, Package, Wallet, Receipt } from 'lucide-react'
import { useApp } from '../../store/useApp'
import { EmptyState } from '../../components/ui'

const SECTIONS = [
  {
    label: 'Sales & Revenue',
    description: "What's been sold and how much money the shop is bringing in.",
    perm: 'sales_reports.view',
    items: [
      { to: '/reports/sales/dashboard', label: 'Sales Dashboard', icon: BarChart3 },
      { to: '/reports/sales/summary', label: 'Sales Summary', icon: FileText },
      { to: '/reports/sales/parts-profit', label: 'Parts Profit', icon: Package },
    ],
  },
  {
    label: 'Billing & Payments',
    description: 'Focuses on invoices and payments.',
    perm: 'financial_reports.view',
    items: [
      { to: '/reports/sales/payments', label: 'Payments', icon: Wallet },
      { to: '/reports/sales/tax', label: 'Tax', icon: Receipt },
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
                end
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
        <Outlet />
      </main>
    </div>
  )
}

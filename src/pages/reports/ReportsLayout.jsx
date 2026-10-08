import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, FileText, Package, Wallet, Receipt, RefreshCw } from 'lucide-react'
import { useApp, toast } from '../../store/useApp'
import { api } from '../../lib/api'
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
  const canResync = isAdmin || perms.includes('shop.edit')
  const visibleSections = SECTIONS.filter((s) => hasPerm(s.perm))
  const [resyncing, setResyncing] = useState(false)

  const resync = async () => {
    if (!confirm('Rebuild the report tables from current documents? Safe to run — nothing is deleted.')) return
    setResyncing(true)
    try {
      const r = await api('/reports/resync', { method: 'POST', body: {} })
      toast.success('Reports resynced', `Recalculated ${r.recalculated} documents. Refresh any report to see the data.`)
    } catch (e) {
      toast.error('Resync failed', e.message)
    } finally { setResyncing(false) }
  }

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
        {canResync && (
          <div style={{ borderTop: '1px solid var(--border, #e5e7eb)', padding: '12px 10px', marginTop: 10 }}>
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={resync} disabled={resyncing}>
              <RefreshCw size={13} />{resyncing ? 'Resyncing…' : 'Resync report tables'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
              Click once if Parts Profit, Payments or Tax show no data after a restore.
            </div>
          </div>
        )}
      </aside>
      <main>
        <Outlet />
      </main>
    </div>
  )
}

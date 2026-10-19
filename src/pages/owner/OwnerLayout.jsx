import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import {
  ShieldCheck, LayoutDashboard, Building2, CreditCard, Users, KeyRound,
  Globe, Receipt, ScrollText, Lock, Settings, LogOut, HardDrive, Mail, FileText, Package, LifeBuoy, Megaphone, Database,
} from 'lucide-react'
import { useOwner } from '../../store/useOwner'

// Base path auto-detects so the same UI renders at /p/admin (production) and
// legacy /owner (bookmarked links from pre-rename).
const BASE = typeof window !== 'undefined' && window.location.pathname.startsWith('/owner') ? '/owner' : '/p/admin'
const LOGIN_PATH = BASE === '/owner' ? '/owner-login' : '/p/admin/login'

const NAV = [
  { to: `${BASE}`, end: true, label: 'Dashboard', icon: LayoutDashboard },
  { to: `${BASE}/companies`, label: 'Companies', icon: Building2 },
  { to: `${BASE}/subscriptions`, label: 'Subscriptions', icon: CreditCard },
  { to: `${BASE}/plans`, label: 'Plans', icon: CreditCard },
  { to: `${BASE}/users`, label: 'Users', icon: Users },
  { to: `${BASE}/access`, label: 'Access Management', icon: KeyRound },
  { to: `${BASE}/urls`, label: 'Application URLs', icon: Globe },
  { to: `${BASE}/billing`, label: 'Billing', icon: Receipt },
  { to: `${BASE}/backups`, label: 'Backups', icon: HardDrive },
  { to: `${BASE}/email`, label: 'Platform Email', icon: Mail },
  { to: `${BASE}/email-templates`, label: 'Email Templates', icon: FileText },
  { to: `${BASE}/broadcast`, label: 'Broadcast Email', icon: Megaphone },
  { to: `${BASE}/addons`, label: 'Add-ons', icon: Package },
  { to: `${BASE}/support`, label: 'Service Desk', icon: LifeBuoy },
  { to: `${BASE}/migrations`, label: 'Data Migration', icon: Database },
  { to: `${BASE}/audit`, label: 'Audit Logs', icon: ScrollText },
  { to: `${BASE}/security`, label: 'Security', icon: Lock },
  { to: `${BASE}/settings`, label: 'Settings', icon: Settings },
]

export default function OwnerLayout() {
  const owner = useOwner((s) => s.owner)
  const logout = useOwner((s) => s.logout)
  const navigate = useNavigate()
  if (!owner?.token) return <Navigate to={LOGIN_PATH} replace />
  return (
    <div style={shellStyle}>
      <aside style={asideStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <img src="/logo.png" alt="Fixora" style={{ height: 29, width: 'auto', objectFit: 'contain' }} />
          <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>Admin</div>
        </div>
        <nav style={{ padding: 10, overflow: 'auto', flex: 1 }}>
          {NAV.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, marginBottom: 2,
                color: isActive ? '#000000' : '#000000',
                background: isActive ? 'linear-gradient(90deg,#eef2ff,#f5f3ff)' : 'transparent',
                fontSize: 14, textDecoration: 'none',
                fontWeight: isActive ? 600 : 500,
                borderLeft: isActive ? '2px solid #2554f5' : '2px solid transparent',
              })}
            >
              <it.icon size={16} />
              <span>{it.label}</span>
            </NavLink>
          ))}
        </nav>
        <div style={{ borderTop: '1px solid #e2e8f0', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#2554f5,#7c3aed)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600 }}>
              {(owner.user?.name || 'O').slice(0, 1).toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#000000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{owner.user?.name || 'Owner'}</div>
              <div style={{ fontSize: 11, color: '#000000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{owner.user?.email || ''}</div>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate(LOGIN_PATH, { replace: true }) }}
            style={{ width: '100%', background: '#fff', border: '1px solid #e2e8f0', color: '#000000', padding: '8px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}
          >
            <LogOut size={14} /> Log out
          </button>
        </div>
      </aside>
      <main style={{ padding: '20px 28px', overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}

const shellStyle = {
  display: 'grid', gridTemplateColumns: '240px 1fr',
  minHeight: '100vh',
  background: '#ffffff', color: '#000000',
  fontFamily: 'Inter, system-ui, sans-serif',
}

const asideStyle = {
  display: 'flex', flexDirection: 'column',
  background: '#ffffff', borderRight: '1px solid #e2e8f0',
}

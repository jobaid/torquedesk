import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import {
  ShieldCheck, LayoutDashboard, Building2, CreditCard, Users, KeyRound,
  Globe, Receipt, ScrollText, Lock, Settings, LogOut, HardDrive, Mail,
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
  { to: `${BASE}/users`, label: 'Users', icon: Users },
  { to: `${BASE}/access`, label: 'Access Management', icon: KeyRound },
  { to: `${BASE}/urls`, label: 'Application URLs', icon: Globe },
  { to: `${BASE}/billing`, label: 'Billing', icon: Receipt },
  { to: `${BASE}/backups`, label: 'Backups', icon: HardDrive },
  { to: `${BASE}/email`, label: 'Platform Email', icon: Mail },
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px', borderBottom: '1px solid #1e2a44' }}>
          <div style={{ background: 'linear-gradient(135deg,#5b8def,#8b5cf6)', borderRadius: 8, padding: 6, display: 'flex' }}><ShieldCheck size={18} color="#fff" /></div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>TorqueDesk</div>
            <div style={{ fontSize: 10.5, color: '#8da2bf', marginTop: 2 }}>Admin Portal</div>
          </div>
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
                color: isActive ? '#fff' : '#8da2bf',
                background: isActive ? 'linear-gradient(90deg, rgba(91,141,239,.18), rgba(139,92,246,.08))' : 'transparent',
                fontSize: 14, textDecoration: 'none',
                borderLeft: isActive ? '2px solid #5b8def' : '2px solid transparent',
              })}
            >
              <it.icon size={16} />
              <span>{it.label}</span>
            </NavLink>
          ))}
        </nav>
        <div style={{ borderTop: '1px solid #1e2a44', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1e2a44', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600 }}>
              {(owner.user?.name || 'O').slice(0, 1).toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e5edf5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{owner.user?.name || 'Owner'}</div>
              <div style={{ fontSize: 11, color: '#8da2bf', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{owner.user?.email || ''}</div>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate(LOGIN_PATH, { replace: true }) }}
            style={{ width: '100%', background: 'transparent', border: '1px solid #1e2a44', color: '#8da2bf', padding: '8px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13 }}
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
  background: '#0b1220', color: '#e5edf5',
  fontFamily: 'Inter, system-ui, sans-serif',
}

const asideStyle = {
  display: 'flex', flexDirection: 'column',
  background: '#0e1627', borderRight: '1px solid #1e2a44',
}

import { useEffect } from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import Sidebar from './Sidebar'
import Header from './Header'
import CommandPalette from '../search/CommandPalette'
import VehiclePickerModal from '../vehicle/VehiclePickerModal'
import FloatingChat from '../chat/FloatingChat'
import { ToastRegion } from '../ui'
import { useApp, useUI } from '../../store/useApp'

export default function AppShell() {
  const collapsed = useApp((s) => s.sidebarCollapsed)
  const toggleSidebar = useApp((s) => s.toggleSidebar)
  const features = useApp((s) => s.features)
  const expired = !!features?.__subscription_expired
  const { drawerOpen, setDrawer, openPalette, openVehiclePicker } = useUI()
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
    setDrawer(false)
  }, [pathname, setDrawer])

  useEffect(() => {
    const onKey = (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette() }
      else if (e.key === '/' && !typing) { e.preventDefault(); openPalette() }
      else if (e.altKey && e.key.toLowerCase() === 'v') { e.preventDefault(); openVehiclePicker() }
      else if (e.altKey && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSidebar() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPalette, openVehiclePicker, toggleSidebar])

  return (
    <div className={`shell${collapsed ? ' collapsed' : ''}${drawerOpen ? ' drawer-open' : ''}`}>
      <a href="#main" className="skip-link">Skip to content</a>
      <Sidebar />
      <div className="drawer-backdrop" onClick={() => setDrawer(false)} aria-hidden="true" />
      <div className="shell-main">
        <Header />
        {expired && (
          <div style={{
            background: 'linear-gradient(90deg,#b91c1c,#dc2626)', color: '#fff',
            padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <AlertTriangle size={18} />
            <strong>Your subscription has expired.</strong>
            <span style={{ opacity: 0.9, fontSize: 13 }}>
              All features are disabled until you renew. Your data is safe and will come back the moment payment goes through.
            </span>
            <Link to="/settings/general/billing" style={{
              marginLeft: 'auto', padding: '6px 14px', background: '#fff', color: '#b91c1c',
              borderRadius: 6, fontWeight: 700, fontSize: 13, textDecoration: 'none',
            }}>Renew now →</Link>
          </div>
        )}
        <main id="main" tabIndex={-1} style={{ outline: 'none' }}>
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <VehiclePickerModal />
      <FloatingChat />
      <ToastRegion />
    </div>
  )
}

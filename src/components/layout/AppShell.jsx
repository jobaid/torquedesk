import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
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

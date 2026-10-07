import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { NAV, FOOT_NAV } from './nav'
import { useApp, useUI, toast } from '../../store/useApp'
import { useShop } from '../../store/useShop'
import Logo from './Logo'

export default function Sidebar() {
  const collapsed = useApp((s) => s.sidebarCollapsed)
  const toggleSidebar = useApp((s) => s.toggleSidebar)
  const favorites = useApp((s) => s.favorites.length)
  const logout = useApp((s) => s.logout)
  const openOrders = useShop((s) => s.documents.filter((d) => d.type !== 'invoice').length)
  const features = useApp((s) => s.features)
  const canFeature = (k) => !features || !(k in features) || !!features[k]
  const setDrawer = useUI((s) => s.setDrawer)
  const navigate = useNavigate()
  const counts = { favorites, openOrders }

  const close = () => setDrawer(false)

  const link = (item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
      data-tip={item.label}
      onClick={close}
    >
      <item.icon size={19} strokeWidth={1.9} aria-hidden="true" />
      <span className="nav-label">{item.label}</span>
      {item.countKey && counts[item.countKey] > 0 && <span className="nav-count">{counts[item.countKey]}</span>}
      {collapsed && <span className="sr-only">{item.label}</span>}
    </NavLink>
  )

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sidebar-brand">
        <Logo />
        <span className="brand-name">Torque<span>Desk</span></span>
        <button className="icon-btn sm mobile-only" style={{ marginLeft: 'auto', color: '#a9b4c0' }} onClick={close} aria-label="Close navigation">
          <X size={18} />
        </button>
      </div>
      <nav className="sidebar-scroll">
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.feature || canFeature(i.feature))
          if (items.length === 0) return null
          return (
            <div key={group.label} role="group" aria-label={group.label}>
              <div className="nav-group-label"><span>{group.label}</span></div>
              {items.map(link)}
            </div>
          )
        })}
      </nav>
      <div className="sidebar-foot">
        {FOOT_NAV.map(link)}
        <div className="foot-row">
          <button
            className="nav-link"
            data-tip="Log out"
            onClick={() => { logout(); navigate('/'); toast.info('Signed out', 'See you next time.') }}
          >
            <LogOut size={19} strokeWidth={1.9} aria-hidden="true" />
            <span className="nav-label">Log out</span>
            {collapsed && <span className="sr-only">Log out</span>}
          </button>
          <button
            className="nav-link collapse-btn"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            data-tip={collapsed ? 'Expand' : 'Collapse'}
            title={collapsed ? 'Expand sidebar (Alt+B)' : 'Collapse sidebar (Alt+B)'}
          >
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
        </div>
      </div>
    </aside>
  )
}

import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronRight, CircleHelp, Menu, Search, Car, Monitor, Moon, Sun, LogOut, Settings, UserRound, CheckCheck } from 'lucide-react'
import { useApp, useUI, toast, ROLES } from '../../store/useApp'
import { PAGE_META } from './nav'
import { useOutside } from '../ui'
import Modal from '../ui/Modal'
import { vehicleLabel, vehicleSub } from '../../data/vehicles'
import { initials, relTime } from '../../lib/format'

export default function Header() {
  const { pathname } = useLocation()
  const seg = pathname.split('/')[1] || ''
  const meta = PAGE_META[seg] || { title: 'TorqueDesk' }
  const openPalette = useUI((s) => s.openPalette)
  const setDrawer = useUI((s) => s.setDrawer)

  return (
    <header className="header">
      <button className="icon-btn mobile-only" onClick={() => setDrawer(true)} aria-label="Open navigation"><Menu size={20} /></button>
      <div className="header-title">
        {meta.crumb && (
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link><ChevronRight size={12} /><span>{meta.crumb}</span>
            {pathname.split('/').length > 2 && <><ChevronRight size={12} /><Link to={`/${seg}`}>{meta.title}</Link></>}
          </nav>
        )}
        <h1>{meta.title}</h1>
      </div>

      <button className="header-search" onClick={openPalette} aria-label="Search (Ctrl+K)">
        <Search size={17} />
        <span className="grow">Search vehicle, DTC, component, repair procedure…</span>
        <span className="kbd">Ctrl K</span>
      </button>

      <div className="header-right">
        <VehicleChip />
        <Notifications />
        <Help />
        <UserMenu />
      </div>
    </header>
  )
}

function VehicleChip() {
  const vehicle = useApp((s) => s.vehicle)
  const open = useUI((s) => s.openVehiclePicker)
  return (
    <button className="vehicle-chip" onClick={open} aria-label={vehicle ? `Current vehicle: ${vehicleLabel(vehicle)}. Change vehicle` : 'Select a vehicle'}>
      <span className={`vc-icon${vehicle ? '' : ' vc-empty'}`}><Car size={18} /></span>
      <span className="vc-text" style={{ minWidth: 0 }}>
        {vehicle ? (
          <>
            <div className="vc-title">{vehicleLabel(vehicle)}</div>
            <div className="vc-sub">{vehicleSub(vehicle)}</div>
          </>
        ) : (
          <>
            <div className="vc-title">No vehicle selected</div>
            <div className="vc-sub">Select vehicle ›</div>
          </>
        )}
      </span>
    </button>
  )
}

function Notifications() {
  const [open, setOpen] = useState(false)
  const notifications = useApp((s) => s.notifications)
  const markAllRead = useApp((s) => s.markAllRead)
  const markRead = useApp((s) => s.markRead)
  const navigate = useNavigate()
  const unread = notifications.filter((n) => !n.read).length
  const ref = useOutside(open, () => setOpen(false))
  return (
    <div className="anchor" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}>
        <Bell size={19} />
        {unread > 0 && <span className="dot-badge">{unread}</span>}
      </button>
      {open && (
        <div className="popover notif-pop" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <h3>Notifications</h3>
            <button className="btn btn-ghost btn-sm" onClick={markAllRead} disabled={!unread}><CheckCheck size={15} />Mark all read</button>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.length === 0 && <p className="muted" style={{ padding: 20, textAlign: 'center' }}>You're all caught up.</p>}
            {notifications.map((n) => (
              <button
                key={n.id}
                className={`notif-item list-row${n.read ? '' : ' unread'}`}
                style={{ borderRadius: 0, alignItems: 'flex-start' }}
                onClick={() => { markRead(n.id); setOpen(false); n.path && navigate(n.path) }}
              >
                <span className="icon-tile sm info"><Bell size={15} /></span>
                <span className="grow">
                  <div className="strong" style={{ fontSize: 13.5 }}>{n.title}</div>
                  <div className="small muted">{n.body}</div>
                  <div className="xs subtle mt-4">{relTime(n.at)}</div>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const SHORTCUTS = [
  ['Ctrl / ⌘ + K', 'Open global search'],
  ['/', 'Open global search'],
  ['Alt + V', 'Change vehicle'],
  ['Alt + B', 'Collapse / expand sidebar'],
  ['Esc', 'Close dialogs and menus'],
  ['↑ ↓ Enter', 'Navigate search results'],
]

function Help() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="icon-btn hide-xs" onClick={() => setOpen(true)} aria-label="Help and keyboard shortcuts"><CircleHelp size={19} /></button>
      <Modal open={open} onClose={() => setOpen(false)} title="Help & shortcuts" description="The fastest path: Select vehicle → Search → Read procedure → Repair.">
        <div className="stack gap-16">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
              <tbody>{SHORTCUTS.map(([k, a]) => <tr key={k}><td><span className="kbd">{k}</span></td><td>{a}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="callout callout-info">
            <CircleHelp size={18} />
            <div>Repair data in this build is sample content for demonstration. Always verify specifications against OEM service information before performing repairs.</div>
          </div>
        </div>
      </Modal>
    </>
  )
}

function UserMenu() {
  const [open, setOpen] = useState(false)
  const user = useApp((s) => s.user)
  const theme = useApp((s) => s.theme)
  const setTheme = useApp((s) => s.setTheme)
  const logout = useApp((s) => s.logout)
  const navigate = useNavigate()
  const ref = useOutside(open, () => setOpen(false))
  const go = (p) => { setOpen(false); navigate(p) }
  return (
    <div className="anchor" ref={ref}>
      <button className="avatar" onClick={() => setOpen((o) => !o)} aria-label="Account menu" aria-expanded={open}>{initials(user?.name)}</button>
      {open && (
        <div className="popover" role="menu" style={{ width: 250 }}>
          <div style={{ padding: '8px 10px 10px' }}>
            <div className="strong">{user?.name}</div>
            <div className="small subtle">{user?.email}</div>
            <span className="badge badge-brand mt-8">{ROLES[user?.role]?.label}</span>
          </div>
          <div className="menu-sep" />
          <div style={{ padding: '4px 6px 8px' }}>
            <div className="xs subtle strong" style={{ marginBottom: 6 }}>THEME</div>
            <div className="segmented" role="group" aria-label="Theme" style={{ width: '100%' }}>
              {[['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'Auto']].map(([v, I, l]) => (
                <button key={v} aria-pressed={theme === v} onClick={() => setTheme(v)} style={{ flex: 1, justifyContent: 'center', padding: '6px 4px' }}><I size={14} />{l}</button>
              ))}
            </div>
          </div>
          <div className="menu-sep" />
          <button className="menu-item" role="menuitem" onClick={() => go('/profile')}><UserRound size={16} />Profile</button>
          <button className="menu-item" role="menuitem" onClick={() => go('/settings')}><Settings size={16} />Settings</button>
          <div className="menu-sep" />
          <button className="menu-item" role="menuitem" onClick={() => { logout(); go('/'); toast.info('Signed out') }}><LogOut size={16} />Log out</button>
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../store/useApp'
import { useOwner } from '../store/useOwner'

// Browser-side deterrence driven by the SaaS owner's settings
// (GET /api/security/config). Every protection is independent and re-fetched
// on the configured interval + on window focus, so a toggle in the admin
// panel reaches open sessions without a reload.
//
// This is deterrence, not prevention: a browser cannot stop OS screenshots,
// external recorders or a determined dev-tools user. Form fields are always
// exempt so typing, pasting and accessibility tools keep working.

export function pageKeyFor(path, loggedIn) {
  if (path.startsWith('/portal/admin/login') || path === '/owner-login') return 'admin_login'
  if (path.startsWith('/portal/admin') || path.startsWith('/owner')) return 'admin_dashboard'
  if (!loggedIn) return 'shop_login'
  if (path === '/') return 'shop_dashboard'
  if (path.startsWith('/orders')) return 'orders'
  if (path.startsWith('/customers')) return 'customers'
  if (path.startsWith('/inspections')) return 'inspections'
  if (path.startsWith('/reports')) return 'reports'
  if (path.startsWith('/settings')) return 'settings'
  if (path.startsWith('/customer-broadcast')) return 'broadcast'
  return 'shop_other'
}

const isField = (el) => !!el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], .sec-allow')

const STYLE_ID = 'fixora-sec-style'
const CSS = `
html.sec-noselect body { -webkit-user-select: none; user-select: none; }
html.sec-noselect input, html.sec-noselect textarea, html.sec-noselect select,
html.sec-noselect [contenteditable], html.sec-noselect .sec-allow { -webkit-user-select: text; user-select: text; }
html.sec-nodrag img { -webkit-user-drag: none; }
@media print {
  html.sec-print-block body > * { display: none !important; }
  html.sec-print-block body::after { content: "Printing this screen is restricted by your Fixora administrator."; display: block; padding: 48px; font: 16px system-ui, sans-serif; }
}
.sec-shield-overlay { position: fixed; inset: 0; z-index: 2147483600; background: rgba(15,23,42,.92); backdrop-filter: blur(18px);
  display: grid; place-items: center; color: #fff; font: 600 16px system-ui, sans-serif; text-align: center; padding: 24px; }
.sec-shield-banner { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 2147483601; max-width: min(560px, calc(100vw - 32px));
  background: #0f172a; color: #fff; border-left: 4px solid #f58220; padding: 12px 16px; border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,.3); font: 500 13.5px/1.45 system-ui, sans-serif; display: flex; gap: 12px; align-items: flex-start; }
.sec-shield-banner button { background: transparent; border: 0; color: #cbd5e1; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 2px; }
.sec-shield-wm { position: fixed; inset: 0; pointer-events: none; z-index: 2147483500; }
`

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]))
}

function watermarkStyle(wm, lines) {
  const fs = wm.fontSize
  const text = lines.map((l, i) => `<text x="50%" y="${40 + i * (fs + 6)}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fs}" fill="#0f172a">${escapeXml(l)}</text>`).join('')
  const h = 40 + lines.length * (fs + 6) + 20
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fs * 26}" height="${h * 2}"><g transform="rotate(${wm.rotation} ${fs * 13} ${h})">${text}</g></svg>`
  const url = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
  const base = { opacity: wm.opacity, backgroundImage: url }
  if (wm.position === 'center') return { ...base, backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }
  if (wm.position === 'bottom-right') return { ...base, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 24px bottom 24px' }
  return base // tiled
}

export default function SecurityShield() {
  const { pathname } = useLocation()
  const shopToken = useApp((s) => s.user?.token)
  const ownerToken = useOwner((s) => s.owner?.token)
  const isAdmin = pathname.startsWith('/portal/admin') || pathname.startsWith('/owner')
  const token = isAdmin ? ownerToken : shopToken
  const page = pageKeyFor(pathname, !!token)
  const [cfg, setCfg] = useState(null)
  const [overlay, setOverlay] = useState('')
  const [banner, setBanner] = useState('')
  const [now, setNow] = useState(() => new Date())
  const sent = useRef({})
  const cfgRef = useRef(null)
  cfgRef.current = cfg

  // ---- config fetch + refresh policy
  useEffect(() => {
    let alive = true
    let timer
    const load = async () => {
      try {
        const res = await fetch(`/api/security/config?page=${page}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store',
        })
        if (res.ok && alive) setCfg(await res.json())
      } catch { /* offline: keep last config */ }
    }
    load()
    const schedule = () => { timer = setTimeout(async () => { await load(); if (alive) schedule() }, ((cfgRef.current?.refreshSeconds) || 60) * 1000) }
    schedule()
    window.addEventListener('focus', load)
    return () => { alive = false; clearTimeout(timer); window.removeEventListener('focus', load) }
  }, [page, token])

  const on = (k) => !!cfg?.features?.[k]
  // Effects re-run only when the protections actually change, not on every
  // refresh (each fetch returns a new object with the same content).
  const sig = cfg ? JSON.stringify([cfg.features, cfg.watermark, cfg.logEvents]) : ''

  // ---- event reporting, throttled to one per type per minute
  const report = (type, details) => {
    const c = cfgRef.current
    if (!c?.logEvents) return
    const last = sent.current[type] || 0
    if (Date.now() - last < 60000) return
    sent.current[type] = Date.now()
    fetch('/api/security/events', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ type, page, details }),
    }).catch(() => {})
  }
  const reportRef = useRef(report)
  reportRef.current = report

  const flashOverlay = (msg, ms = 1800) => {
    setOverlay(msg)
    setTimeout(() => setOverlay(''), ms)
  }

  useEffect(() => { ensureStyle() }, [])

  // ---- class-based protections (selection, drag, print)
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('sec-noselect', on('text_selection_restriction'))
    root.classList.toggle('sec-nodrag', on('drag_drop_restriction'))
    root.classList.toggle('sec-print-block', on('print_restriction'))
    return () => root.classList.remove('sec-noselect', 'sec-nodrag', 'sec-print-block')
  }, [sig])

  // ---- event-based protections
  useEffect(() => {
    if (!cfg) return
    const ctx = (e) => {
      if (isField(e.target)) return
      e.preventDefault()
      reportRef.current('right_click')
    }
    const copy = (e) => {
      if (isField(e.target)) return
      e.preventDefault()
      setBanner('Copying content from this page is restricted by your Fixora administrator.')
      reportRef.current('copy_attempt', { kind: e.type })
    }
    const drag = (e) => { if (!isField(e.target)) e.preventDefault() }
    const keydown = (e) => {
      const k = (e.key || '').toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      if (on('print_restriction') && mod && k === 'p') {
        e.preventDefault()
        setBanner('Browser printing is restricted. Use the Print button on the document instead.')
        reportRef.current('print_attempt', { via: 'shortcut' })
      }
      if (on('screenshot_deterrence') && ((e.metaKey && e.shiftKey && ['3', '4', '5'].includes(k)) || (e.shiftKey && (e.metaKey || e.getModifierState?.('OS')) && k === 's'))) {
        flashOverlay('Screen capture is restricted on this page.')
        reportRef.current('screenshot_attempt', { via: 'shortcut' })
      }
      const inspect = k === 'f12' || (mod && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (mod && k === 'u')
      if (inspect && (on('devtools_detection') || on('browser_inspection_warning'))) {
        if (mod && k === 'u') e.preventDefault() // view-source only; F12 is left alone
        if (on('browser_inspection_warning')) setBanner('Inspecting this application is monitored. Activity may be logged for security review.')
        reportRef.current('inspection_shortcut', { key: e.key })
      }
    }
    const keyup = (e) => {
      if (on('screenshot_deterrence') && e.key === 'PrintScreen') {
        flashOverlay('Screenshots are restricted on this page.')
        navigator.clipboard?.writeText?.('').catch(() => {})
        reportRef.current('screenshot_attempt', { via: 'printscreen' })
      }
    }
    if (on('right_click_restriction')) document.addEventListener('contextmenu', ctx)
    if (on('copy_paste_restriction')) { document.addEventListener('copy', copy); document.addEventListener('cut', copy) }
    if (on('drag_drop_restriction')) document.addEventListener('dragstart', drag)
    document.addEventListener('keydown', keydown, true)
    document.addEventListener('keyup', keyup, true)
    return () => {
      document.removeEventListener('contextmenu', ctx)
      document.removeEventListener('copy', copy)
      document.removeEventListener('cut', copy)
      document.removeEventListener('dragstart', drag)
      document.removeEventListener('keydown', keydown, true)
      document.removeEventListener('keyup', keyup, true)
    }
  }, [sig])

  // ---- print: app's own Print buttons stay allowed
  useEffect(() => {
    if (!on('print_restriction')) return
    const orig = window.print
    const root = document.documentElement
    window.print = (...a) => {
      root.classList.remove('sec-print-block')
      const restore = () => { root.classList.add('sec-print-block'); window.removeEventListener('afterprint', restore) }
      window.addEventListener('afterprint', restore)
      setTimeout(restore, 60000)
      return orig.apply(window, a)
    }
    const before = () => { if (root.classList.contains('sec-print-block')) reportRef.current('print_attempt', { via: 'browser' }) }
    window.addEventListener('beforeprint', before)
    return () => { window.print = orig; window.removeEventListener('beforeprint', before) }
  }, [sig])

  // ---- screen recording via the browser capture API
  useEffect(() => {
    const md = navigator.mediaDevices
    if (!on('screen_recording_deterrence') || !md?.getDisplayMedia) return
    const orig = md.getDisplayMedia.bind(md)
    md.getDisplayMedia = async (...a) => {
      const stream = await orig(...a)
      setOverlay('Screen recording detected — protected content is hidden while capture is active.')
      reportRef.current('screen_capture_started')
      stream.getTracks().forEach((t) => t.addEventListener('ended', () => setOverlay('')))
      return stream
    }
    return () => { md.getDisplayMedia = orig }
  }, [sig])

  // ---- devtools heuristic (docked panels only; never a debugger trap)
  useEffect(() => {
    if (!on('devtools_detection') && !on('browser_inspection_warning')) return
    let open = false
    const check = () => {
      const isOpen = window.outerWidth - window.innerWidth > 170 || window.outerHeight - window.innerHeight > 170
      if (isOpen && !open) {
        if (on('devtools_detection')) reportRef.current('devtools_opened')
        if (on('browser_inspection_warning')) setBanner('Developer tools detected. Activity in this application may be logged for security review.')
      }
      open = isOpen
    }
    const t = setInterval(check, 2000)
    check()
    return () => clearInterval(t)
  }, [sig])

  // ---- watermark clock
  useEffect(() => {
    if (!on('dynamic_watermark')) return
    const t = setInterval(() => setNow(new Date()), (cfg?.watermark?.refreshSeconds || 60) * 1000)
    return () => clearInterval(t)
  }, [sig])

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(''), 6000)
    return () => clearTimeout(t)
  }, [banner])

  if (!cfg) return null
  const id = cfg.identity
  const wmLines = ['Fixora ERP',
    id ? `${id.name || id.email}${id.companyId ? ` · Tenant ${id.companyId.slice(0, 8)}` : ' · Platform admin'}` : 'Protected content',
    `${now.toLocaleString()}${id?.sessionTag ? ` · S-${id.sessionTag}` : ''}`]

  return (
    <>
      {on('dynamic_watermark') && <div className="sec-shield-wm" aria-hidden="true" style={watermarkStyle(cfg.watermark, wmLines)} />}
      {overlay && <div className="sec-shield-overlay" role="alert">{overlay}</div>}
      {banner && (
        <div className="sec-shield-banner" role="status">
          <span style={{ flex: 1 }}>{banner}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setBanner('')}>×</button>
        </div>
      )}
    </>
  )
}

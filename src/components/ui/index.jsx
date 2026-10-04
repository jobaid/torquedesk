import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, Star, X } from 'lucide-react'
import { useApp, useToast, toast } from '../../store/useApp'

/* ---------- Toasts ---------- */
const TOAST_ICON = { success: CheckCircle2, error: OctagonAlert, warning: AlertTriangle, info: Info }
export function ToastRegion() {
  const { toasts, dismiss } = useToast()
  return (
    <div className="toast-region" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => {
        const Icon = TOAST_ICON[t.type] || Info
        return (
          <div key={t.id} className={`toast ${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
            <Icon size={20} />
            <div className="grow">
              <div className="toast-title">{t.title}</div>
              {t.body && <div className="toast-body">{t.body}</div>}
            </div>
            <button className="icon-btn sm" onClick={() => dismiss(t.id)} aria-label="Dismiss notification"><X size={16} /></button>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Empty state ---------- */
export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && <div className="empty-icon"><Icon size={30} strokeWidth={1.7} /></div>}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  )
}

/* ---------- Skeletons ---------- */
export function Skeleton({ w = '100%', h = 14, r, style }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card card-pad stack gap-12" aria-busy="true" aria-label="Loading">
      <Skeleton w="60%" h={18} />
      {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} w={`${90 - i * 18}%`} />)}
    </div>
  )
}

export function SkeletonList({ rows = 5 }) {
  return (
    <div className="stack gap-12" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="row gap-12">
          <Skeleton w={40} h={40} r={11} />
          <div className="grow stack gap-6"><Skeleton w={`${70 - (i % 3) * 12}%`} h={14} /><Skeleton w={`${45 - (i % 2) * 10}%`} h={11} /></div>
        </div>
      ))}
    </div>
  )
}

/** Shows skeletons briefly when `key` changes, emulating data fetch. */
export function useLoading(key, ms = 380) {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => setLoading(false), ms)
    return () => clearTimeout(t)
  }, [key, ms])
  return loading
}

/* ---------- Field ---------- */
export function Field({ label, required, hint, error, ok, children, className = '', htmlFor }) {
  return (
    <div className={`field ${className}`}>
      {label && <label className="field-label" htmlFor={htmlFor}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>}
      {children}
      {error ? <span className="field-error" role="alert"><OctagonAlert size={13} />{error}</span>
        : ok ? <span className="field-ok"><CheckCircle2 size={13} />{ok}</span>
        : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

/* ---------- Severity ---------- */
export const SEVERITY = {
  high: { label: 'High severity', short: 'High', cls: 'badge-danger', tile: 'danger' },
  medium: { label: 'Repair soon', short: 'Medium', cls: 'badge-warning', tile: 'warning' },
  low: { label: 'Low severity', short: 'Low', cls: 'badge-info', tile: 'info' },
}
export function SeverityBadge({ level }) {
  const s = SEVERITY[level] || SEVERITY.low
  return <span className={`badge ${s.cls}`}><span aria-hidden="true">●</span> {s.label}</span>
}

/* ---------- Favorite toggle ---------- */
export function FavoriteButton({ type, refId, title, subtitle, path, size = 'md' }) {
  const isFav = useApp((s) => s.favorites.some((f) => f.type === type && f.refId === refId))
  const toggle = useApp((s) => s.toggleFavorite)
  return (
    <button
      className={`btn ${size === 'sm' ? 'btn-sm' : ''} btn-secondary`}
      aria-pressed={isFav}
      onClick={() => {
        const added = toggle({ type, refId, title, subtitle, path })
        toast[added ? 'success' : 'info'](added ? 'Added to favorites' : 'Removed from favorites', title)
      }}
    >
      <Star size={16} fill={isFav ? 'currentColor' : 'none'} style={{ color: isFav ? '#f59e0b' : undefined }} />
      {isFav ? 'Saved' : 'Save'}
    </button>
  )
}

/* ---------- Outside click ---------- */
export function useOutside(open, onClose) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, onClose])
  return ref
}

/* ---------- Tabs ---------- */
export function Tabs({ tabs, value, onChange, label }) {
  const onKey = (e) => {
    const idx = tabs.findIndex((t) => t.id === value)
    if (e.key === 'ArrowRight') onChange(tabs[(idx + 1) % tabs.length].id)
    if (e.key === 'ArrowLeft') onChange(tabs[(idx - 1 + tabs.length) % tabs.length].id)
  }
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1} onClick={() => onChange(t.id)}>
          {t.icon && <t.icon size={15} />}{t.label}{t.count != null && <span className="badge" style={{ height: 18 }}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label, id }) {
  return (
    <label className="switch">
      <input type="checkbox" id={id} checked={!!checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  )
}

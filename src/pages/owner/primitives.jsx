// Dark-themed owner-portal primitives, kept here so the SaaS admin UI looks
// deliberately different from the automobile store customer app.

export const Card = ({ children, style, ...rest }) => (
  <div style={{ background: '#111a2b', border: '1px solid #1e2a44', borderRadius: 12, padding: 20, ...style }} {...rest}>{children}</div>
)

export const Btn = ({ variant = 'primary', style, children, ...rest }) => {
  const base = { padding: '8px 14px', borderRadius: 8, border: '1px solid transparent', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }
  const variants = {
    primary: { background: 'linear-gradient(90deg,#2a6cf0,#5b8def)', color: '#fff' },
    secondary: { background: 'transparent', color: '#8da2bf', borderColor: '#2a3650' },
    danger: { background: '#2a0d10', color: '#ffb3b8', borderColor: '#51232a' },
    ghost: { background: 'transparent', color: '#8da2bf' },
  }
  return <button style={{ ...base, ...variants[variant], ...style }} {...rest}>{children}</button>
}

export const Field = ({ label, hint, error, children }) => (
  <label style={{ display: 'block' }}>
    <div style={{ fontSize: 12, color: '#8da2bf', marginBottom: 4 }}>{label}</div>
    {children}
    {hint && !error && <div style={{ fontSize: 11, color: '#5c6c86', marginTop: 4 }}>{hint}</div>}
    {error && <div style={{ fontSize: 11, color: '#ffb3b8', marginTop: 4 }}>{error}</div>}
  </label>
)

export const Input = (props) => (
  <input
    {...props}
    style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #2a3650', background: '#0b1220', color: '#e5edf5', fontSize: 13, outline: 'none', ...(props.style || {}) }}
  />
)

export const Select = (props) => (
  <select
    {...props}
    style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #2a3650', background: '#0b1220', color: '#e5edf5', fontSize: 13, outline: 'none', ...(props.style || {}) }}
  />
)

export const StatusPill = ({ status }) => {
  const colors = {
    active: { bg: '#0d2a1b', fg: '#86efac' },
    trial: { bg: '#102236', fg: '#93c5fd' },
    suspended: { bg: '#3a0d12', fg: '#fda4af' },
    expired: { bg: '#2a1a0d', fg: '#fdba74' },
    cancelled: { bg: '#1f1f1f', fg: '#a1a1aa' },
    pending: { bg: '#1a1a2e', fg: '#c4b5fd' },
    disabled: { bg: '#1f1f1f', fg: '#a1a1aa' },
  }
  const c = colors[status] || { bg: '#1a2237', fg: '#8da2bf' }
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: c.bg, color: c.fg, fontSize: 11, fontWeight: 600, textTransform: 'capitalize', letterSpacing: '.02em' }}>
      {status || '—'}
    </span>
  )
}

export const PageHeader = ({ title, subtitle, actions }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-.01em' }}>{title}</h1>
      {subtitle && <div style={{ color: '#8da2bf', fontSize: 13, marginTop: 4 }}>{subtitle}</div>}
    </div>
    {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
  </div>
)

export function money(n) {
  return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export const Th = ({ children, right }) => (
  <th style={{ textAlign: right ? 'right' : 'left', padding: '10px 12px', fontSize: 11, fontWeight: 600, color: '#8da2bf', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #1e2a44' }}>{children}</th>
)
export const Td = ({ children, right, bold, style }) => (
  <td style={{ textAlign: right ? 'right' : 'left', padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #1e2a44', fontWeight: bold ? 600 : 400, ...style }}>{children}</td>
)

// Light-themed owner-portal primitives. Repainted to white/slate so the SaaS
// admin UI matches the main app and marketing site.

export const Card = ({ children, style, ...rest }) => (
  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', ...style }} {...rest}>{children}</div>
)

export const Btn = ({ variant = 'primary', style, children, ...rest }) => {
  const base = { padding: '8px 14px', borderRadius: 8, border: '1px solid transparent', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }
  const variants = {
    primary:   { background: 'linear-gradient(90deg,#3c6dff,#2554f5)', color: '#fff' },
    secondary: { background: '#fff', color: '#000000', borderColor: '#cbd5e1' },
    danger:    { background: '#fff', color: '#b91c1c', borderColor: '#fecaca' },
    ghost:     { background: 'transparent', color: '#000000' },
  }
  return <button style={{ ...base, ...variants[variant], ...style }} {...rest}>{children}</button>
}

export const Field = ({ label, hint, error, children }) => (
  <label style={{ display: 'block' }}>
    <div style={{ fontSize: 12, color: '#000000', marginBottom: 4, fontWeight: 500 }}>{label}</div>
    {children}
    {hint && !error && <div style={{ fontSize: 11, color: '#000000', marginTop: 4 }}>{hint}</div>}
    {error && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{error}</div>}
  </label>
)

export const Input = (props) => (
  <input
    {...props}
    style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#000000', fontSize: 13, outline: 'none', ...(props.style || {}) }}
  />
)

export const Select = (props) => (
  <select
    {...props}
    style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#000000', fontSize: 13, outline: 'none', ...(props.style || {}) }}
  />
)

export const StatusPill = ({ status }) => {
  const colors = {
    active:    { bg: '#d1fae5', fg: '#047857' },
    trial:     { bg: '#dbeafe', fg: '#1d4ed8' },
    suspended: { bg: '#fee2e2', fg: '#b91c1c' },
    expired:   { bg: '#ffedd5', fg: '#c2410c' },
    cancelled: { bg: '#e2e8f0', fg: '#000000' },
    pending:   { bg: '#ede9fe', fg: '#6d28d9' },
    disabled:  { bg: '#e2e8f0', fg: '#000000' },
  }
  const c = colors[status] || { bg: '#e2e8f0', fg: '#000000' }
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, background: c.bg, color: c.fg, fontSize: 11, fontWeight: 600, textTransform: 'capitalize', letterSpacing: '.02em' }}>
      {status || '—'}
    </span>
  )
}

export const PageHeader = ({ title, subtitle, actions }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-.01em', color: '#000000' }}>{title}</h1>
      {subtitle && <div style={{ color: '#000000', fontSize: 13, marginTop: 4 }}>{subtitle}</div>}
    </div>
    {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
  </div>
)

export function money(n) {
  return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export const Th = ({ children, right }) => (
  <th style={{ textAlign: right ? 'right' : 'left', padding: '10px 12px', fontSize: 11, fontWeight: 600, color: '#000000', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>{children}</th>
)
export const Td = ({ children, right, bold, style }) => (
  <td style={{ textAlign: right ? 'right' : 'left', padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e2e8f0', fontWeight: bold ? 600 : 400, color: '#000000', ...style }}>{children}</td>
)

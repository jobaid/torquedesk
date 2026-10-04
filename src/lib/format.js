export const money = (n) =>
  (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export const num2 = (n) => (Number(n) || 0).toFixed(2)

export function relTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const m = Math.round(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24 && new Date(ts).getDate() === new Date().getDate()) return 'Today'
  const d = Math.floor(diff / 86400000)
  if (d <= 1) return 'Yesterday'
  if (d < 7) return `${d} days ago`
  return new Date(ts).toLocaleDateString()
}

export const dateTime = (ts) =>
  ts ? new Date(ts).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit', hour: 'numeric', minute: '2-digit' }) : ''

export const shortTime = (ts) =>
  ts ? new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('') || '?'
}

export function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function formatPhone(v = '') {
  const d = v.replace(/\D/g, '').slice(0, 10)
  if (d.length < 4) return d
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

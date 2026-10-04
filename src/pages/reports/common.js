import { api } from '../../lib/api'
import { money } from '../../lib/format'

const pad = (n) => String(n).padStart(2, '0')
export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function presetRange(preset) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d = (y, m, day) => new Date(y, m, day)
  switch (preset) {
    case 'today': return { from: start, to: start }
    case 'yesterday': { const y = new Date(start); y.setDate(y.getDate() - 1); return { from: y, to: y } }
    case 'thisWeek': { const s = new Date(start); s.setDate(s.getDate() - s.getDay()); return { from: s, to: start } }
    case 'lastWeek': { const s = new Date(start); s.setDate(s.getDate() - s.getDay() - 7); const e = new Date(s); e.setDate(e.getDate() + 6); return { from: s, to: e } }
    case 'thisMonth': return { from: d(now.getFullYear(), now.getMonth(), 1), to: start }
    case 'lastMonth': { const s = d(now.getFullYear(), now.getMonth() - 1, 1); const e = d(now.getFullYear(), now.getMonth(), 0); return { from: s, to: e } }
    case 'thisQuarter': { const q = Math.floor(now.getMonth() / 3); return { from: d(now.getFullYear(), q * 3, 1), to: start } }
    case 'lastQuarter': { const q = Math.floor(now.getMonth() / 3) - 1; const y = q < 0 ? now.getFullYear() - 1 : now.getFullYear(); const m = (q + 4) % 4; return { from: d(y, m * 3, 1), to: d(y, m * 3 + 3, 0) } }
    case 'thisYear': return { from: d(now.getFullYear(), 0, 1), to: start }
    case 'lastYear': return { from: d(now.getFullYear() - 1, 0, 1), to: d(now.getFullYear() - 1, 11, 31) }
    default: return { from: d(now.getFullYear(), now.getMonth(), 1), to: start }
  }
}

export function buildQuery(filters) {
  const params = new URLSearchParams()
  if (filters.from) params.set('from', toDateStr(filters.from))
  if (filters.to) params.set('to', toDateStr(filters.to))
  for (const k of ['customer_id', 'technician_id', 'service_writer_id', 'payment_method', 'invoice_status', 'tax_type', 'part_number']) {
    if (filters[k]) params.set(k, filters[k])
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

export async function fetchReport(path, filters) {
  return api(path + buildQuery(filters))
}

export async function logExport(report, format, filters) {
  try {
    await api('/reports/export-log', {
      method: 'POST',
      body: {
        report,
        format,
        from: filters.from ? toDateStr(filters.from) : '',
        to: filters.to ? toDateStr(filters.to) : '',
        filters: JSON.stringify(filters || {}),
      },
    })
  } catch { /* audit is best-effort */ }
}

export function downloadCSV(filename, rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map((c) => esc(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')).join('\n')
  const blob = new Blob([`﻿${header}\n${body}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function printReport() { window.print() }

export const COLORS = ['#2a6cf0', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b']

export const fmtMoney = (v) => money(Number(v) || 0)
export const fmtCompact = (v) => {
  const n = Number(v) || 0
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}
export const pct = (a, b) => {
  const prev = Number(b) || 0
  const cur = Number(a) || 0
  if (prev === 0) return cur === 0 ? 0 : 100
  return ((cur - prev) / prev) * 100
}

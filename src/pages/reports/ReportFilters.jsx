import { useState } from 'react'
import { Calendar, Download, Printer } from 'lucide-react'
import { presetRange, toDateStr, downloadCSV, printReport, logExport } from './common'

const PRESETS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'],
  ['thisWeek', 'This Week'], ['lastWeek', 'Last Week'],
  ['thisMonth', 'This Month'], ['lastMonth', 'Last Month'],
  ['thisQuarter', 'This Quarter'], ['lastQuarter', 'Last Quarter'],
  ['thisYear', 'This Year'], ['lastYear', 'Last Year'],
  ['custom', 'Custom'],
]

export default function ReportFilters({ filters, onChange, onExport, exports = [] }) {
  const [preset, setPreset] = useState('thisMonth')
  const apply = (p) => {
    setPreset(p)
    if (p === 'custom') return
    const r = presetRange(p)
    onChange({ ...filters, from: r.from, to: r.to })
  }
  const setDate = (k, v) => {
    const d = v ? new Date(v + 'T00:00:00') : null
    onChange({ ...filters, [k]: d })
    setPreset('custom')
  }
  return (
    <div className="card report-filters" style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="label" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Date range</label>
        <select className="input" value={preset} onChange={(e) => apply(e.target.value)} style={{ minWidth: 160 }}>
          {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="label" style={{ fontSize: 12, color: 'var(--text-muted)' }}>From</label>
        <input type="date" className="input" value={filters.from ? toDateStr(filters.from) : ''} onChange={(e) => setDate('from', e.target.value)} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="label" style={{ fontSize: 12, color: 'var(--text-muted)' }}>To</label>
        <input type="date" className="input" value={filters.to ? toDateStr(filters.to) : ''} onChange={(e) => setDate('to', e.target.value)} />
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        {exports.map((ex) => (
          <button key={ex.label} className="btn" onClick={() => { ex.run(); onExport?.(ex.format) }}>
            {ex.format === 'print' ? <Printer size={16} /> : <Download size={16} />} {ex.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function doCSVExport(report, filename, rows, columns, filters) {
  logExport(report, 'csv', filters)
  downloadCSV(filename, rows, columns)
}

export function doPrint(report, filters) {
  logExport(report, 'print', filters)
  printReport()
}

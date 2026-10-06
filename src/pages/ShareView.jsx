import { useEffect, useState } from 'react'
import { Printer, Phone, Mail, MapPin, Globe, CheckCircle2, AlertTriangle, X, MinusCircle, ClipboardCheck, FileText } from 'lucide-react'

// Public, no-auth customer-facing share view. Reads /api/public/share/{token}.
// Never shows any field the shop didn't choose to show; display only — no
// edit buttons, no PII beyond customer_name/vehicle on the doc the shop owns.
//
// Session B: shows document (invoice / RO / estimate) and the attached
// inspection report when the shop has it enabled. Later sessions enhance the
// print view (C) and add inspection photos (D).

export default function ShareView() {
  const token = typeof window !== 'undefined' ? window.location.pathname.replace(/^\/share\/doc\//, '') : ''
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!token) { setErr('Invalid link.'); setLoading(false); return }
    (async () => {
      try {
        const res = await fetch(`/api/public/share/${encodeURIComponent(token)}`)
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'This link is no longer available.')
        setData(await res.json())
      } catch (e) { setErr(e.message) }
      finally { setLoading(false) }
    })()
  }, [token])

  if (loading) return <PublicShell><div className="muted" style={{ textAlign: 'center' }}>Loading…</div></PublicShell>
  if (err || !data) return <PublicShell><div style={{ textAlign: 'center' }}><X size={28} color="#dc2626" /><h2 style={{ marginTop: 8 }}>Link unavailable</h2><p className="muted">{err || 'This link has been revoked or does not exist.'}</p></div></PublicShell>

  const { document: doc, shop, inspection, inspectionItems, includeInspection } = data
  const t = totalsOf(doc)
  const typeLabel = { invoice: 'Invoice', repair_order: 'Repair Order', estimate: 'Estimate', statement: 'Statement' }[doc.type] || 'Document'
  const customer = doc.customerSnapshot || {}
  const vehicle = doc.vehicleSnapshot || {}

  return (
    <PublicShell>
      <div className="row between wrap" style={{ gap: 20, alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>{shop?.name || 'Our Shop'}</h1>
          {shop?.address && <div className="muted" style={{ fontSize: 13, whiteSpace: 'pre-line', marginTop: 4 }}>{shop.address}</div>}
          <div className="muted" style={{ fontSize: 13, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {shop?.phone && <span><Phone size={13} /> {shop.phone}</span>}
            {shop?.email && <span><Mail size={13} /> {shop.email}</span>}
            {shop?.website && <span><Globe size={13} /> {shop.website}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 12, color: '#6b7280' }}>{typeLabel}</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>#{doc.number}</div>
          <div className="muted" style={{ fontSize: 12 }}>{new Date(doc.updatedAt).toLocaleDateString()}</div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => window.print()}><Printer size={13} />Print / Save PDF</button>
        </div>
      </div>

      <section style={cardStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <div>
            <div style={labelStyle}>Customer</div>
            <div style={{ fontWeight: 500 }}>{customer.name || '—'}</div>
            {customer.phone && <div className="muted">{customer.phone}</div>}
            {customer.email && <div className="muted">{customer.email}</div>}
          </div>
          <div>
            <div style={labelStyle}>Vehicle</div>
            <div style={{ fontWeight: 500 }}>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || '—'}</div>
            {vehicle.vin && <div className="muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>VIN {vehicle.vin}</div>}
            {vehicle.plate && <div className="muted">Plate {vehicle.plate}</div>}
          </div>
          {doc.mileageIn && <div><div style={labelStyle}>Mileage</div><div>{doc.mileageIn}</div></div>}
          {doc.technician && <div><div style={labelStyle}>Technician</div><div>{doc.technician}</div></div>}
        </div>
      </section>

      <section style={cardStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, textAlign: 'right', width: 90 }}>Qty / Hours</th>
              <th style={{ ...thStyle, textAlign: 'right', width: 110 }}>Rate</th>
              <th style={{ ...thStyle, textAlign: 'right', width: 110 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(itemsOf(doc) || []).map((it, i) => (
              <tr key={i}>
                <td style={tdStyle}>
                  <div>{it.description || it.name || it.label || '—'}</div>
                  {it.partNumber && <div className="muted" style={{ fontSize: 11 }}>P/N {it.partNumber}</div>}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{it.quantity || it.hours || ''}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{money(it.rate || it.unitPrice)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{money(it.amount || it.total || (it.quantity * (it.rate || it.unitPrice)) || (it.hours * (it.rate || it.unitPrice)))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'right' }}>Subtotal</td><td style={{ ...tdStyle, textAlign: 'right' }}>{money(t.subtotal)}</td></tr>
            {Number(t.tax) > 0 && <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'right' }}>Tax</td><td style={{ ...tdStyle, textAlign: 'right' }}>{money(t.tax)}</td></tr>}
            {Number(t.shopFees) > 0 && <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'right' }}>Fees</td><td style={{ ...tdStyle, textAlign: 'right' }}>{money(t.shopFees)}</td></tr>}
            <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>Total</td><td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{money(t.total)}</td></tr>
            {Number(t.paid) > 0 && <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'right' }}>Paid</td><td style={{ ...tdStyle, textAlign: 'right' }}>−{money(t.paid)}</td></tr>}
            {Number(t.balance) !== Number(t.total) && (
              <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontSize: 15 }}>Balance due</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontSize: 15, color: Number(t.balance) > 0 ? '#dc2626' : '#059669' }}>{money(t.balance)}</td></tr>
            )}
          </tfoot>
        </table>
      </section>

      {includeInspection && inspection && (
        <section style={{ ...cardStyle, breakBefore: 'page', pageBreakBefore: 'always' }}>
          <div style={{ borderBottom: '2px solid #111', paddingBottom: 10, marginBottom: 14 }}>
            <div style={{ textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 11, color: '#6b7280' }}><ClipboardCheck size={12} style={{ verticalAlign: -2 }} /> Vehicle Inspection Report</div>
            <h2 style={{ margin: '4px 0 0', fontSize: 20 }}>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}</h2>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {inspection.performedAt && <>Inspected {new Date(inspection.performedAt).toLocaleDateString()}</>}
              {inspection.performedBy && <> · by {inspection.performedBy}</>}
              {inspection.mileage > 0 && <> · {inspection.mileage.toLocaleString()} mi</>}
            </div>
          </div>

          <div className="row gap-8 wrap" style={{ marginBottom: 14 }}>
            {inspection.passCount > 0 && <span style={pillStyle('#d1fae5', '#065f46')}><CheckCircle2 size={11} /> {inspection.passCount} pass</span>}
            {inspection.attentionCount > 0 && <span style={pillStyle('#fef3c7', '#92400e')}><AlertTriangle size={11} /> {inspection.attentionCount} needs attention</span>}
            {inspection.failCount > 0 && <span style={pillStyle('#fee2e2', '#991b1b')}><X size={11} /> {inspection.failCount} fail</span>}
            {inspection.naCount > 0 && <span style={pillStyle('#f3f4f6', '#4b5563')}><MinusCircle size={11} /> {inspection.naCount} N/A</span>}
          </div>

          {groupedItems(inspectionItems || []).map((g) => (
            <div key={g.category} style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 14, textTransform: 'uppercase', letterSpacing: '.04em', color: '#374151' }}>{g.category}</h3>
              {g.items.map((it, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '6px 0', borderTop: '1px solid #e5e7eb', alignItems: 'baseline' }}>
                  <span style={{ ...statusChip(it.status), minWidth: 86, textAlign: 'center' }}>{statusLabel(it.status)}</span>
                  <div style={{ flex: 1 }}>
                    <div>{it.label}</div>
                    {(it.measurement || it.note) && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {it.measurement && <strong>{it.measurement}</strong>}
                        {it.measurement && it.note && ' · '}
                        {it.note}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {inspection.notes && (
            <div style={{ marginTop: 16, padding: 10, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6 }}>
              <div style={labelStyle}>Technician notes</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{inspection.notes}</div>
            </div>
          )}
        </section>
      )}

      {includeInspection && !inspection && (
        <section style={{ ...cardStyle, color: '#6b7280', textAlign: 'center' }}>
          <ClipboardCheck size={20} />
          <div style={{ marginTop: 4, fontSize: 13 }}>No completed inspection report is attached to this {typeLabel.toLowerCase()} yet.</div>
        </section>
      )}

      <footer style={{ marginTop: 24, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>
        <FileText size={11} style={{ verticalAlign: -1 }} /> This is a read-only copy. Contact the shop if anything looks wrong.
      </footer>
    </PublicShell>
  )
}

// ---------- helpers ----------

function PublicShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif', color: '#111' }}>
      <style>{`
        @media print {
          body, html { background: #fff !important; }
          .no-print { display: none !important; }
          section { break-inside: avoid; page-break-inside: avoid; }
        }
        .muted { color: #6b7280; }
      `}</style>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>{children}</div>
    </div>
  )
}

const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginTop: 16 }
const labelStyle = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#6b7280', marginBottom: 4 }
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const thStyle = { textAlign: 'left', padding: '8px 6px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }
const tdStyle = { padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }
const pillStyle = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 600 })

function money(v) { const n = Number(v); if (!isFinite(n)) return '—'; return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' }) }

function itemsOf(doc) {
  const raw = doc.items
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') return Array.isArray(raw) ? raw : []
  return []
}
function totalsOf(doc) {
  return doc.totals || { subtotal: 0, tax: 0, shopFees: 0, total: 0, paid: 0, balance: 0 }
}
function statusLabel(s) { return s === 'na' ? 'N/A' : (s[0].toUpperCase() + s.slice(1)) }
function statusChip(s) {
  const map = { pass: ['#d1fae5', '#065f46'], attention: ['#fef3c7', '#92400e'], fail: ['#fee2e2', '#991b1b'], na: ['#f3f4f6', '#4b5563'] }
  const [bg, fg] = map[s] || map.na
  return { background: bg, color: fg, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }
}
function groupedItems(items) {
  const out = []
  const idx = new Map()
  for (const it of items) {
    if (!idx.has(it.category)) { idx.set(it.category, out.length); out.push({ category: it.category, items: [] }) }
    out[idx.get(it.category)].items.push(it)
  }
  return out
}

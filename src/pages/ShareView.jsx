import { useEffect, useState } from 'react'
import { Printer, Phone, Mail, Globe, CheckCircle2, AlertTriangle, X, MinusCircle, ClipboardCheck, FileText, ThumbsUp, ThumbsDown, MessageCircle, ShieldCheck } from 'lucide-react'
import { ChatThread } from '../components/chat/FloatingChat'

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
  // All hooks must run on every render — kept above the early-return guards
  // below to avoid React error #310 ("more hooks rendered than previous").
  const [auth, setAuth] = useState(undefined) // undefined = loading, null = none, object = exists
  const [tab, setTab] = useState('auth')      // 'auth' | 'chat'
  const [lightbox, setLightbox] = useState(null) // { photos, index } | null

  // Poll both the document and the authorization every 5 seconds so when
  // the shop adds a line, revises the authorization, or sends a message the
  // customer sees it without reloading. Chat polling runs on its own cycle
  // (2 s) inside ChatThread; the two together give the customer a live view.
  useEffect(() => {
    if (!token) { setErr('Invalid link.'); setLoading(false); return }
    let cancelled = false
    const loadDoc = async () => {
      try {
        const res = await fetch(`/api/public/share/${encodeURIComponent(token)}`)
        if (!res.ok) {
          if (!cancelled && !data) setErr((await res.json().catch(() => ({}))).error || 'This link is no longer available.')
          return
        }
        if (!cancelled) setData(await res.json())
      } catch (e) {
        if (!cancelled && !data) setErr(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const loadAuth = () => {
      fetch(`/api/public/share/${encodeURIComponent(token)}/authorization`)
        .then((r) => r.ok ? r.json() : null)
        .then((v) => { if (!cancelled) setAuth(v) })
        .catch(() => { if (!cancelled) setAuth(null) })
    }
    loadDoc(); loadAuth()
    const t = setInterval(() => { loadDoc(); loadAuth() }, 5000)
    return () => { cancelled = true; clearInterval(t) }
  }, [token]) // eslint-disable-line

  if (loading) return <PublicShell><div className="muted" style={{ textAlign: 'center' }}>Loading…</div></PublicShell>
  if (err || !data) return <PublicShell><div style={{ textAlign: 'center' }}><X size={28} color="#dc2626" /><h2 style={{ marginTop: 8 }}>Link unavailable</h2><p className="muted">{err || 'This link has been revoked or does not exist.'}</p></div></PublicShell>

  const { document: doc, shop, inspection, inspectionItems, includeInspection } = data
  const t = totalsOf(doc)
  const typeLabel = { invoice: 'Invoice', repair_order: 'Repair Order', estimate: 'Estimate', statement: 'Statement' }[doc.type] || 'Document'
  const customer = doc.customerSnapshot || {}
  const vehicle = doc.vehicleSnapshot || {}

  if (tab === 'chat') {
    return (
      <CustomerChatView
        token={token}
        shopName={shop?.name}
        docLabel={`${typeLabel} #${doc.number}`}
        onBack={() => setTab('auth')}
      />
    )
  }

  return (
    <PublicShell>
      {/* Tab bar — sits inside the regular Shell on screen; hidden in print. */}
      <div className="no-print" style={{ display: 'flex', gap: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 999, padding: 4, marginBottom: 10, maxWidth: 320 }}>
        <button onClick={() => setTab('auth')}
          style={{ flex: 1, padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                   background: tab === 'auth' ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : 'transparent',
                   color: tab === 'auth' ? '#fff' : '#374151' }}>
          <ShieldCheck size={14} style={{ verticalAlign: -2 }} /> Authorization
        </button>
        <button onClick={() => setTab('chat')}
          style={{ flex: 1, padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                   background: 'transparent', color: '#374151' }}>
          <MessageCircle size={14} style={{ verticalAlign: -2 }} /> Chat
        </button>
      </div>
      {/* On-screen action bar (hidden in print) */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="btn btn-primary" onClick={() => window.print()}><Printer size={14} />Print / Save as PDF</button>
      </div>

      {auth !== undefined && auth && (
        <AuthorizationPanel token={token} auth={auth} onChanged={setAuth} docLabel={doc && ({ invoice: 'invoice', repair_order: 'repair order', estimate: 'estimate' }[doc.type] || 'document')} />
      )}

      {/* Shop + document header (acts as the cover block on page 1) */}
      <header className="share-section cover-divider" style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between' }}>
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
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em' }}>#{doc.number}</div>
          <div className="muted" style={{ fontSize: 12 }}>Dated {new Date(doc.updatedAt).toLocaleDateString()}</div>
          {Number(t.total) > 0 && (
            <div style={{ marginTop: 6, padding: '6px 10px', background: '#111', color: '#fff', borderRadius: 6, display: 'inline-block', fontSize: 13 }}>
              {Number(t.balance) > 0.004 ? `Balance due: ${money(t.balance)}` : `Total: ${money(t.total)}`}
            </div>
          )}
        </div>
      </header>

      <section className="share-section share-card" style={cardStyle}>
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

      <section className="share-section share-card" style={cardStyle}>
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
        <>
          {/* Print-only divider page so the inspection starts fresh on its own sheet */}
          <div className="insp-divider-page">
            <ClipboardCheck size={56} color="#111" />
            <div style={{ marginTop: 20, textTransform: 'uppercase', letterSpacing: '.2em', fontSize: 11, color: '#6b7280' }}>Attached report</div>
            <h2 style={{ margin: '6pt 0 0', fontSize: '28pt', fontWeight: 700 }}>Vehicle Inspection Report</h2>
            <div style={{ marginTop: 10, color: '#374151' }}>
              {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 20 }}>Prepared by {shop?.name || 'the shop'}</div>
          </div>

          <InspectionReport
            inspection={inspection}
            inspectionItems={inspectionItems}
            vehicle={vehicle}
            onOpenPhotos={(photos, index, label) => setLightbox({ photos, index, label })}
          />
        </>
      )}

      {includeInspection && !inspection && (
        <section className="share-section share-card no-print" style={{ ...cardStyle, color: '#6b7280', textAlign: 'center' }}>
          <ClipboardCheck size={20} />
          <div style={{ marginTop: 4, fontSize: 13 }}>No completed inspection report is attached to this {typeLabel.toLowerCase()} yet.</div>
        </section>
      )}

      <footer className="share-section" style={{ marginTop: 24, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>
        <FileText size={11} style={{ verticalAlign: -1 }} /> This is a read-only copy. Contact the shop if anything looks wrong.
      </footer>
      {lightbox && <Lightbox photos={lightbox.photos} index={lightbox.index} label={lightbox.label} onClose={() => setLightbox(null)} />}
    </PublicShell>
  )
}

// ---------- inspection report (print-ready, DVI-style) ----------

const CONDITION_MAP = {
  pass:      { code: 'OK', label: 'Checked Okay', bg: '#dcfce7', fg: '#166534', dot: '#16a34a' },
  attention: { code: '!',  label: 'Service Soon', bg: '#fef3c7', fg: '#92400e', dot: '#f59e0b', icon: AlertTriangle },
  fail:      { code: '!',  label: 'Service Now',  bg: '#fee2e2', fg: '#991b1b', dot: '#dc2626', icon: X },
  na:        { code: 'NC', label: 'Not Checked',  bg: '#f3f4f6', fg: '#6b7280', dot: '#9ca3af' },
}

function ConditionBadge({ status }) {
  const c = CONDITION_MAP[status] || CONDITION_MAP.na
  const Icon = c.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 26, height: 22, padding: '0 7px',
      borderRadius: 6, background: c.bg, color: c.fg,
      fontSize: 10, fontWeight: 800, letterSpacing: '.04em',
      border: '1px solid ' + c.dot + '55',
    }}>
      {Icon ? <Icon size={13} strokeWidth={3} /> : c.code}
    </span>
  )
}

function InspectionReport({ inspection, inspectionItems, vehicle, onOpenPhotos }) {
  const groups = groupedItems(inspectionItems || [])
  const allPhotos = (inspectionItems || []).flatMap((it) => (it.photos || []).map((p) => ({ ...p, _label: it.label })))

  return (
    <>
      {/* Divider cover page before the report (print only) */}
      <section className="insp-section share-section share-card" style={{ ...cardStyle, marginTop: 32, padding: 0, overflow: 'hidden' }}>
        {/* Header strip */}
        <div style={{ background: '#111', color: '#fff', padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.14em', opacity: 0.7 }}>
                <ClipboardCheck size={11} style={{ verticalAlign: -2 }} /> Multi-point Vehicle Inspection
              </div>
              <h2 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700 }}>
                {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
              </h2>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, opacity: 0.9 }}>
              {inspection.performedAt && <div>Inspected {new Date(inspection.performedAt).toLocaleString()}</div>}
              {inspection.performedBy && <div>By {inspection.performedBy}</div>}
              {inspection.mileage > 0 && <div>{inspection.mileage.toLocaleString()} miles</div>}
            </div>
          </div>
        </div>

        <div style={{ padding: 18 }}>
          {/* Summary tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { k: 'pass',      n: inspection.passCount,      label: 'Checked Okay' },
              { k: 'attention', n: inspection.attentionCount, label: 'Service Soon' },
              { k: 'fail',      n: inspection.failCount,      label: 'Service Now'  },
              { k: 'na',        n: inspection.naCount,        label: 'Not Checked'  },
            ].map((t) => {
              const c = CONDITION_MAP[t.k]
              return (
                <div key={t.k} style={{ background: c.bg, border: `1px solid ${c.dot}44`, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: c.fg, lineHeight: 1 }}>{t.n}</div>
                  <div style={{ fontSize: 10, color: c.fg, marginTop: 4, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{t.label}</div>
                </div>
              )
            })}
          </div>

          {/* Recommended attention block */}
          {(inspection.failCount + inspection.attentionCount > 0) && (
            <div className="share-section" style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 12, marginBottom: 14 }}>
              <div style={{ textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 10, color: '#9a3412', fontWeight: 800, marginBottom: 6 }}>Recommended attention</div>
              <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13, color: '#1f2937' }}>
                {(inspectionItems || []).filter((it) => it.status === 'fail' || it.status === 'attention').map((it, i) => (
                  <li key={i} style={{ marginTop: 3 }}>
                    <strong style={{ color: it.status === 'fail' ? '#991b1b' : '#92400e' }}>{it.status === 'fail' ? 'Service Now' : 'Service Soon'}:</strong>{' '}
                    {it.label}
                    {it.measurement && <> — <em>{it.measurement}</em></>}
                    {it.note && <> — {it.note}</>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sections — DVI-style 3-column grid of items per category */}
          {groups.map((g) => (
            <div key={g.category} className="share-section" style={{ marginBottom: 18, breakInside: 'avoid', pageBreakInside: 'avoid' }}>
              <h3 style={{
                margin: '0 0 8px', paddingBottom: 6, borderBottom: '2px solid #111',
                fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: '#111',
              }}>
                {g.category}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1, background: '#e5e7eb', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                {g.items.map((it) => (
                  <div key={it.id || it.label} className="insp-item" style={{ background: '#fff', padding: '8px 10px', display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#111', lineHeight: 1.3 }}>{it.label}</div>
                      {(it.measurement || it.note) && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 1.3 }}>
                          {it.measurement && <strong>{it.measurement}</strong>}
                          {it.measurement && it.note && ' · '}
                          {it.note}
                        </div>
                      )}
                      {(it.photos || []).length > 0 && (
                        <div className="no-print" style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                          {it.photos.slice(0, 3).map((p, i) => (
                            <button key={p.id} type="button" onClick={() => onOpenPhotos(it.photos, i, it.label)}
                              style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
                              aria-label={`Open photo ${i + 1} of ${it.photos.length}`}>
                              <img src={p.url} alt={it.label} loading="lazy" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, border: '1px solid #e5e7eb', display: 'block' }} />
                            </button>
                          ))}
                          {it.photos.length > 3 && <span style={{ alignSelf: 'center', fontSize: 11, color: '#6b7280' }}>+{it.photos.length - 3}</span>}
                        </div>
                      )}
                    </div>
                    <ConditionBadge status={it.status} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Condition legend */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '12px 0 4px', borderTop: '1px solid #e5e7eb', fontSize: 11, color: '#374151' }}>
            <div style={{ textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, color: '#6b7280' }}>Condition codes</div>
            {['na', 'pass', 'attention', 'fail'].map((k) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ConditionBadge status={k} />
                {CONDITION_MAP[k].label}
              </div>
            ))}
          </div>

          {inspection.notes && (
            <div className="share-section" style={{ marginTop: 14, padding: 12, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6 }}>
              <div style={labelStyle}>Technician notes</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{inspection.notes}</div>
            </div>
          )}
        </div>
      </section>

      {/* Photo gallery — screen only; per-item photos already print inline next to the finding above */}
      {allPhotos.length > 0 && (
        <section className="insp-section share-section share-card no-print" style={{ ...cardStyle, marginTop: 16 }}>
          <h3 style={{ margin: 0, marginBottom: 10, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: '#374151' }}>Inspection photos</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            {allPhotos.map((p, i) => (
              <button key={p.id} type="button" onClick={() => onOpenPhotos(allPhotos, i, p._label)}
                style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
                aria-label={`Open photo ${i + 1} of ${allPhotos.length}`}>
                <img src={p.url} alt={p._label} loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', display: 'block' }} />
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4, textAlign: 'left' }}>{p._label}</div>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

// ---------- photo lightbox ----------

function Lightbox({ photos, index: start, label, onClose }) {
  const [i, setI] = useState(start || 0)
  const prev = () => setI((n) => (n - 1 + photos.length) % photos.length)
  const next = () => setI((n) => (n + 1) % photos.length)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const p = photos[i]
  if (!p) return null
  return (
    <div onClick={onClose} role="dialog" aria-label="Photo"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
        zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, cursor: 'zoom-out',
      }}>
      <button onClick={(e) => { e.stopPropagation(); onClose() }} aria-label="Close"
        style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
        <X size={22} />
      </button>
      {photos.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); prev() }} aria-label="Previous"
            style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', fontSize: 22 }}>‹</button>
          <button onClick={(e) => { e.stopPropagation(); next() }} aria-label="Next"
            style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', fontSize: 22 }}>›</button>
        </>
      )}
      <div onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: '100%', maxHeight: '100%' }}>
        <img src={p.url} alt={label} style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8 }} />
        <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
          {label}{photos.length > 1 && <> · <span style={{ opacity: 0.7 }}>{i + 1} of {photos.length}</span></>}
        </div>
      </div>
    </div>
  )
}

// ---------- customer chat view (full screen on mobile) ----------

function CustomerChatView({ token, shopName, docLabel, onBack }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#fff', zIndex: 10,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'linear-gradient(90deg,#1e40af,#2563eb)', color: '#fff' }}>
        <button onClick={onBack} aria-label="Back" style={{ width: 32, height: 32, borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Chat with {shopName || 'the shop'}</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>{docLabel}</div>
        </div>
      </header>
      <ChatThread isPublic publicToken={token} shopName={shopName} />
    </div>
  )
}

// ---------- chat panel (legacy; unused once tab layout is active) ----------

function ChatPanel({ token, customerName }) {
  const [data, setData] = useState({ messages: [], unread: 0 })
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState(customerName || '')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    try {
      const res = await fetch(`/api/public/share/${encodeURIComponent(token)}/messages`)
      if (!res.ok) throw new Error('Could not load chat.')
      setData(await res.json())
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t) }, [token])

  const send = async (e) => {
    e?.preventDefault()
    if (!body.trim()) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/public/share/${encodeURIComponent(token)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), body: body.trim() }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed')
      setBody('')
      setData(await res.json())
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <section className="share-section share-card no-print">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <MessageCircle size={18} />
        <div style={{ fontWeight: 600 }}>Chat with the shop</div>
      </div>
      <div style={{ maxHeight: 340, overflowY: 'auto', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
        {loading ? <div className="muted" style={{ textAlign: 'center' }}>Loading…</div>
         : data.messages.length === 0 ? <div className="muted" style={{ textAlign: 'center', padding: 20 }}>No messages yet. Say hi — the shop will reply here.</div>
         : data.messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: m.senderRole === 'customer' ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
            <div style={{
              maxWidth: '75%',
              padding: '6px 10px', borderRadius: 10, fontSize: 13,
              background: m.senderRole === 'customer' ? '#dbeafe' : '#fff',
              border: '1px solid ' + (m.senderRole === 'customer' ? '#bfdbfe' : '#e5e7eb'),
            }}>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>
                {m.senderName || (m.senderRole === 'shop' ? 'Shop' : 'Customer')} · {new Date(m.at).toLocaleString()}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={send} style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea className="input" style={{ flex: 1, minHeight: 60 }} placeholder="Type a message to the shop…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
          <button className="btn btn-primary" type="submit" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
        {err && <div style={{ color: '#dc2626', fontSize: 12 }}>{err}</div>}
      </form>
    </section>
  )
}

// ---------- authorization panel ----------

function AuthorizationPanel({ token, auth, onChanged, docLabel }) {
  const [open, setOpen] = useState(null) // null | 'approve' | 'deny' | 'changes'
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [itemSel, setItemSel] = useState({}) // key -> 'approved' | 'denied' | 'pending'
  const [itemBusy, setItemBusy] = useState(false)

  useEffect(() => {
    if (!auth?.items) return
    const next = {}
    for (const it of auth.items) next[it.key] = it.status
    setItemSel(next)
  }, [auth?.id, auth?.respondedAt])

  const saveItems = async () => {
    if (!name.trim()) { setErr('Enter your name below before saving line-item choices.'); return }
    setItemBusy(true); setErr('')
    try {
      const res = await fetch(`/api/public/share/${encodeURIComponent(token)}/authorization/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), items: (auth.items || []).map((it) => ({ key: it.key, status: itemSel[it.key] || 'pending', note: '' })) }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed')
      const next = await fetch(`/api/public/share/${encodeURIComponent(token)}/authorization`).then((r) => r.ok ? r.json() : null)
      onChanged(next)
    } catch (e) { setErr(e.message) }
    finally { setItemBusy(false) }
  }

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/public/share/${encodeURIComponent(token)}/authorization/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: open === 'approve' ? 'approve' : open === 'deny' ? 'deny' : 'request_changes',
          name: name.trim(),
          reason: reason.trim(),
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed')
      // Reload the auth status.
      const next = await fetch(`/api/public/share/${encodeURIComponent(token)}/authorization`).then((r) => r.ok ? r.json() : null)
      onChanged(next); setOpen(null); setReason(''); setName('')
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const terminal = ['approved', 'denied', 'changes_requested', 'cancelled', 'expired', 'revised_required'].includes(auth.status)
  const banner = {
    pending:            ['#eff6ff', '#1e40af', 'The shop would like your authorization.'],
    viewed:             ['#eff6ff', '#1e40af', 'The shop would like your authorization.'],
    approved:           ['#f0fdf4', '#166534', 'You approved this ' + docLabel + '.'],
    denied:             ['#fef2f2', '#991b1b', 'You denied this ' + docLabel + '.'],
    changes_requested:  ['#fff7ed', '#9a3412', 'You requested changes to this ' + docLabel + '.'],
    cancelled:          ['#f3f4f6', '#4b5563', 'This authorization request was cancelled by the shop.'],
    expired:            ['#f3f4f6', '#4b5563', 'This authorization request expired.'],
    revised_required:   ['#fff7ed', '#9a3412', 'The shop has revised this ' + docLabel + '. A new authorization is required.'],
  }[auth.status] || ['#f3f4f6', '#4b5563', 'Status: ' + auth.status]

  return (
    <section className="share-section share-card" style={{ background: banner[0], borderColor: 'transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ShieldCheck size={20} color={banner[1]} />
        <div style={{ fontWeight: 600, color: banner[1] }}>{banner[2]}</div>
      </div>
      {auth.respondedAt && (
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          {auth.respondedName && <>Signed by <strong>{auth.respondedName}</strong> · </>}
          {new Date(auth.respondedAt).toLocaleString()}
          {auth.responseReason && <div style={{ marginTop: 4, color: '#374151' }}>“{auth.responseReason}”</div>}
        </div>
      )}

      {Array.isArray(auth.items) && auth.items.length > 0 && (
        <div className="no-print" style={{ marginTop: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Approve or deny individual items</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Optional. Set each line, then either click Save selections below, or finish with the overall Approve / Deny / Request changes.</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {auth.items.map((it) => {
              const sel = itemSel[it.key] || it.status
              const dis = terminal
              return (
                <div key={it.key} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 8px', borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}>{it.label}</div>
                    {it.amount > 0 && <div className="muted" style={{ fontSize: 11 }}>{money(it.amount)}</div>}
                  </div>
                  {['pending', 'approved', 'denied'].map((s) => (
                    <button key={s} type="button" onClick={() => !dis && setItemSel({ ...itemSel, [it.key]: s })} disabled={dis}
                      style={{
                        padding: '4px 10px', borderRadius: 999, border: '1px solid',
                        fontSize: 11, fontWeight: 600, cursor: dis ? 'not-allowed' : 'pointer',
                        ...(sel === s
                          ? (s === 'approved' ? { background: '#d1fae5', borderColor: '#86efac', color: '#065f46' } :
                             s === 'denied'   ? { background: '#fee2e2', borderColor: '#fecaca', color: '#991b1b' } :
                                                { background: '#f3f4f6', borderColor: '#e5e7eb', color: '#4b5563' })
                          : { background: 'transparent', borderColor: '#e5e7eb', color: '#9ca3af' }),
                      }}>{s === 'pending' ? 'Pending' : (s === 'approved' ? 'Approve' : 'Deny')}</button>
                  ))}
                </div>
              )
            })}
          </div>
          {!terminal && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 180px', minWidth: 160, maxWidth: 260 }} />
              <button className="btn btn-secondary btn-sm" onClick={saveItems} disabled={itemBusy || !name.trim()}>{itemBusy ? 'Saving…' : 'Save line-item choices'}</button>
            </div>
          )}
        </div>
      )}

      {!terminal && (
        <>
          {!open && (
            <div className="row gap-8 no-print" style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" style={{ background: '#16a34a', color: '#fff' }} onClick={() => setOpen('approve')}><ThumbsUp size={14} /> Approve all</button>
              <button className="btn" style={{ background: '#f59e0b', color: '#fff' }} onClick={() => setOpen('changes')}><MessageCircle size={14} /> Request changes</button>
              <button className="btn" style={{ background: '#dc2626', color: '#fff' }} onClick={() => setOpen('deny')}><ThumbsDown size={14} /> Deny all</button>
            </div>
          )}
          {open && (
            <div className="no-print" style={{ marginTop: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                {open === 'approve' ? 'Confirm approval' : open === 'deny' ? 'Deny this ' + docLabel : 'Request changes'}
              </div>
              <label style={{ display: 'block', marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Your name <span style={{ color: '#dc2626' }}>*</span></div>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Smith" />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                  {open === 'approve' ? 'Notes (optional)' : (open === 'deny' ? 'Reason for denial' : 'What changes do you want?')}
                  {open !== 'approve' && <span style={{ color: '#dc2626' }}> *</span>}
                </div>
                <textarea className="input" style={{ minHeight: 80 }} value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder={open === 'approve' ? 'Any note for the shop' : open === 'deny' ? 'Tell the shop why you are not approving the work' : 'Describe the changes you want'} />
              </label>
              <div style={{ marginBottom: 10, fontSize: 11, color: '#6b7280' }}>
                By submitting you confirm you are authorized to make decisions for this {docLabel}. Your name, time of response and the shop will see this exactly as entered.
              </div>
              {err && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 10 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => { setOpen(null); setErr(''); setReason('') }} disabled={busy}>Cancel</button>
                <button className="btn btn-primary" onClick={submit} disabled={busy || !name.trim() || (open !== 'approve' && !reason.trim())}>
                  {busy ? 'Submitting…' : (open === 'approve' ? 'Confirm approval' : open === 'deny' ? 'Submit denial' : 'Send changes')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ---------- helpers ----------

function PublicShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif', color: '#111' }}>
      <style>{`
        @page {
          size: Letter;
          margin: 0.6in 0.55in 0.75in 0.55in;
          @bottom-center {
            content: "Page " counter(page) " of " counter(pages);
            color: #6b7280;
            font-size: 9pt;
          }
        }
        @media print {
          html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print, .no-print * { display: none !important; }
          .share-container { max-width: none !important; padding: 0 !important; }
          .share-card { box-shadow: none !important; border: 1px solid #e5e7eb !important; margin-top: 10pt !important; padding: 12pt 14pt !important; }
          .share-section { break-inside: avoid; page-break-inside: avoid; }
          .insp-item { break-inside: avoid; page-break-inside: avoid; }
          .insp-section { break-before: page; page-break-before: always; }
          .cover-divider { border-top: 2px solid #111 !important; margin-top: 10pt !important; padding-top: 10pt !important; }
          a[href]:after { content: ""; }
          h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
          table { font-size: 10pt; }
          .insp-divider-page {
            break-before: page; page-break-before: always;
            display: flex !important; flex-direction: column; align-items: center; justify-content: center;
            min-height: 7in;
            text-align: center;
            color: #111;
          }
        }
        @media screen {
          .insp-divider-page { display: none !important; }
          .only-print { display: none !important; }
        }
        @media print {
          .only-print { display: flex !important; }
        }
        .muted { color: #6b7280; }
      `}</style>
      <div className="share-container" style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>{children}</div>
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

import { useEffect, useState } from 'react'
import { Printer, Phone, Mail, Globe, CheckCircle2, AlertTriangle, X, MinusCircle, ClipboardCheck, FileText, ThumbsUp, ThumbsDown, MessageCircle, ShieldCheck } from 'lucide-react'

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
  const [auth, setAuth] = useState(undefined) // undefined = loading, null = none, object = exists
  useEffect(() => {
    if (!token) return
    fetch(`/api/public/share/${encodeURIComponent(token)}/authorization`)
      .then((r) => r.ok ? r.json() : null).then(setAuth).catch(() => setAuth(null))
  }, [token])
  const t = totalsOf(doc)
  const typeLabel = { invoice: 'Invoice', repair_order: 'Repair Order', estimate: 'Estimate', statement: 'Statement' }[doc.type] || 'Document'
  const customer = doc.customerSnapshot || {}
  const vehicle = doc.vehicleSnapshot || {}

  return (
    <PublicShell>
      {/* On-screen action bar (hidden in print) */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="btn btn-primary" onClick={() => window.print()}><Printer size={14} />Print / Save as PDF</button>
      </div>

      {auth !== undefined && auth && (
        <AuthorizationPanel token={token} auth={auth} onChanged={setAuth} docLabel={doc && ({ invoice: 'invoice', repair_order: 'repair order', estimate: 'estimate' }[doc.type] || 'document')} />
      )}
      <ChatPanel token={token} customerName={(doc.customerSnapshot || {}).name} />

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

          <section className="insp-section share-section share-card" style={{ ...cardStyle, marginTop: 32 }}>
            <div style={{ borderBottom: '2px solid #111', paddingBottom: 10, marginBottom: 14 }}>
              <div style={{ textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 11, color: '#6b7280' }}><ClipboardCheck size={12} style={{ verticalAlign: -2 }} /> Vehicle Inspection Report</div>
              <h2 style={{ margin: '4px 0 0', fontSize: 20 }}>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}</h2>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {inspection.performedAt && <>Inspected {new Date(inspection.performedAt).toLocaleDateString()}</>}
                {inspection.performedBy && <> · by {inspection.performedBy}</>}
                {inspection.mileage > 0 && <> · {inspection.mileage.toLocaleString()} mi</>}
              </div>
            </div>

            <div className="row gap-8 wrap" style={{ marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {inspection.passCount > 0 && <span style={pillStyle('#d1fae5', '#065f46')}><CheckCircle2 size={11} /> {inspection.passCount} pass</span>}
              {inspection.attentionCount > 0 && <span style={pillStyle('#fef3c7', '#92400e')}><AlertTriangle size={11} /> {inspection.attentionCount} needs attention</span>}
              {inspection.failCount > 0 && <span style={pillStyle('#fee2e2', '#991b1b')}><X size={11} /> {inspection.failCount} fail</span>}
              {inspection.naCount > 0 && <span style={pillStyle('#f3f4f6', '#4b5563')}><MinusCircle size={11} /> {inspection.naCount} N/A</span>}
            </div>

            {/* Priority block: show failed + attention items first so a customer scanning the PDF sees the real recommendations immediately. */}
            {(inspection.failCount + inspection.attentionCount > 0) && (
              <div className="share-section" style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <div style={{ textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 10, color: '#9a3412', fontWeight: 700 }}>Recommended attention</div>
                <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 13, color: '#1f2937' }}>
                  {(inspectionItems || []).filter((it) => it.status === 'fail' || it.status === 'attention').map((it, i) => (
                    <li key={i} style={{ marginTop: 3 }}>
                      <strong style={{ color: it.status === 'fail' ? '#991b1b' : '#92400e' }}>{statusLabel(it.status)}:</strong>{' '}
                      {it.label}
                      {it.measurement && <> — <em>{it.measurement}</em></>}
                      {it.note && <> — {it.note}</>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {groupedItems(inspectionItems || []).map((g) => (
              <div key={g.category} className="share-section" style={{ marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: 14, textTransform: 'uppercase', letterSpacing: '.04em', color: '#374151' }}>{g.category}</h3>
                {g.items.map((it, i) => (
                  <div key={i} className="insp-item" style={{ padding: '6px 0', borderTop: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
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
                    {Array.isArray(it.photos) && it.photos.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, marginLeft: 98 }}>
                        {it.photos.map((p) => (
                          <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block' }}>
                            <img src={p.url} alt={it.label} loading="lazy" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {inspection.notes && (
              <div className="share-section" style={{ marginTop: 16, padding: 10, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <div style={labelStyle}>Technician notes</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{inspection.notes}</div>
              </div>
            )}
          </section>
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
    </PublicShell>
  )
}

// ---------- chat panel ----------

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

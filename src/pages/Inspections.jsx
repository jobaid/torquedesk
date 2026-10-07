import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Stethoscope, Plus, Car, Check, AlertTriangle, X, MinusCircle, ArrowLeft, Save, CheckCircle2, Trash2, Camera } from 'lucide-react'
import { api } from '../lib/api'
import { useApp as _useAppForToken } from '../store/useApp'
import { useShop } from '../store/useShop'
import { useApp, toast } from '../store/useApp'
import { EmptyState, Field } from '../components/ui'

// Session A — Vehicle Inspection module. Tech-facing checklist UI backed by
// /api/inspections. Later sessions add photo upload, public share link and
// combined-PDF integration.

// ------------------------------- list page ----------------------------------

export default function InspectionsPage() {
  const { id } = useParams()
  if (id === 'new') return <NewInspection />
  if (id) return <InspectionEditor id={id} />
  return <InspectionList />
}

function InspectionList() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const customers = useShop((s) => s.customers)

  const load = async () => {
    setLoading(true); setErr('')
    try { setRows((await api('/inspections')) || []) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const findCustomer = (cid) => customers.find((c) => c.id === cid)
  const findVehicle = (c, vid) => c?.vehicles?.find((v) => v.id === vid)

  if (loading && rows.length === 0) return <div className="page"><div className="card card-pad muted">Loading inspections…</div></div>

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Vehicle Inspections</h1>
          <p>Digital multi-point inspections (DVI) you've started for your customers' vehicles.</p>
        </div>
        <Link to="/inspections/new" className="btn btn-primary"><Plus size={16} />New inspection</Link>
      </div>
      {err && <div className="callout callout-danger" role="alert">{err}</div>}
      {rows.length === 0 ? (
        <div className="card card-pad">
          <EmptyState
            icon={Stethoscope}
            title="No inspections yet"
            action={<Link to="/inspections/new" className="btn btn-primary"><Plus size={16} />Start the first one</Link>}
          >
            Record pass/fail for a standard DVI checklist, attach to a repair order, and share with the customer later.
          </EmptyState>
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Updated</th>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th>Findings</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = findCustomer(r.customerId)
                const v = findVehicle(c, r.vehicleId)
                return (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => (window.location.href = `/inspections/${r.id}`)}>
                    <td>{new Date(r.updatedAt).toLocaleDateString()}</td>
                    <td>{c?.name || <span className="muted">—</span>}</td>
                    <td>{v ? `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() : <span className="muted">—</span>}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td className="row gap-8" style={{ fontSize: 12 }}>
                      {r.passCount > 0 && <span className="badge" style={{ background: '#d1fae5', color: '#065f46' }}><Check size={11} />{r.passCount}</span>}
                      {r.attentionCount > 0 && <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}><AlertTriangle size={11} />{r.attentionCount}</span>}
                      {r.failCount > 0 && <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}><X size={11} />{r.failCount}</span>}
                      {r.naCount > 0 && <span className="badge"><MinusCircle size={11} />{r.naCount}</span>}
                    </td>
                    <td><Link to={`/inspections/${r.id}`} className="btn btn-ghost btn-sm">Open</Link></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }) {
  const map = {
    in_progress: { label: 'In progress', bg: '#dbeafe', fg: '#1e40af' },
    completed:   { label: 'Completed',   bg: '#d1fae5', fg: '#065f46' },
    cancelled:   { label: 'Cancelled',   bg: '#f3f4f6', fg: '#4b5563' },
  }
  const c = map[status] || map.in_progress
  return <span className="badge" style={{ background: c.bg, color: c.fg }}>{c.label}</span>
}

// ----------------------------- new inspection -------------------------------

function NewInspection() {
  const customers = useShop((s) => s.customers)
  const documents = useShop((s) => s.documents)
  const user = useApp((s) => s.user)
  const navigate = useNavigate()
  const [customerId, setCustomerId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [mileage, setMileage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const customer = customers.find((c) => c.id === customerId)
  const vehicles = customer?.vehicles || []
  const customerDocs = useMemo(() => documents.filter((d) => d.customerId === customerId), [documents, customerId])

  const create = async (e) => {
    e.preventDefault()
    if (!customerId) { setErr('Pick a customer first.'); return }
    if (!vehicleId) { setErr('Pick a vehicle.'); return }
    setBusy(true); setErr('')
    try {
      const created = await api('/inspections', {
        method: 'POST',
        body: {
          customerId, vehicleId, documentId,
          mileage: Number(mileage) || 0,
          performedBy: user?.name || '',
        },
      })
      toast.success('Inspection started')
      navigate(`/inspections/${created.id}`)
    } catch (e) {
      setErr(e.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="page">
      <div className="row gap-8" style={{ marginBottom: 12 }}>
        <Link to="/inspections" className="btn btn-ghost btn-sm"><ArrowLeft size={14} />Back</Link>
      </div>
      <div className="card card-pad" style={{ maxWidth: 640 }}>
        <h1>New vehicle inspection</h1>
        <p className="muted">Pick a customer and vehicle to seed the default DVI checklist. You can attach a repair order now or later.</p>
        <form className="stack gap-12 mt-16" onSubmit={create}>
          <Field label="Customer" required>
            <select className="select" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setVehicleId(''); setDocumentId('') }}>
              <option value="">— Select a customer —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Vehicle" required>
            <select className="select" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={!customerId}>
              <option value="">— Select a vehicle —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{[v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin || 'Vehicle'}</option>)}
            </select>
          </Field>
          <Field label="Repair order / invoice (optional)" hint="You can attach the inspection to a document now, or do it later from the inspection detail page.">
            <select className="select" value={documentId} onChange={(e) => setDocumentId(e.target.value)} disabled={!customerId}>
              <option value="">— None —</option>
              {customerDocs.map((d) => <option key={d.id} value={d.id}>{(d.type || 'document').replace('_', ' ')} #{d.number || d.displayNumber}</option>)}
            </select>
          </Field>
          <Field label="Current mileage">
            <input className="input" type="number" inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="e.g. 68 400" />
          </Field>
          {err && <div className="callout callout-danger" role="alert">{err}</div>}
          <div className="row gap-8" style={{ justifyContent: 'flex-end' }}>
            <Link to="/inspections" className="btn btn-ghost">Cancel</Link>
            <button className="btn btn-primary" disabled={busy || !customerId || !vehicleId}><Plus size={14} />{busy ? 'Starting…' : 'Start inspection'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --------------------------- inspection editor ------------------------------

function InspectionEditor({ id }) {
  const navigate = useNavigate()
  const customers = useShop((s) => s.customers)
  const documents = useShop((s) => s.documents)
  const [insp, setInsp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [savingItem, setSavingItem] = useState(null)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const r = await api(`/inspections/${id}`)
      setInsp(r); setNotes(r.notes || '')
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  const customer = customers.find((c) => c.id === insp?.customerId)
  const vehicle = customer?.vehicles?.find((v) => v.id === insp?.vehicleId)
  const doc = documents.find((d) => d.id === insp?.documentId)

  const updateItem = async (itemId, patch) => {
    setSavingItem(itemId)
    try {
      const updated = await api(`/inspections/${id}/items/${itemId}`, { method: 'PATCH', body: patch })
      setInsp(updated)
    } catch (e) { toast.error('Could not save', e.message) }
    finally { setSavingItem(null) }
  }

  const saveNotes = async () => {
    setSavingNotes(true)
    try {
      const updated = await api(`/inspections/${id}`, { method: 'PATCH', body: { notes } })
      setInsp(updated); toast.success('Notes saved')
    } catch (e) { toast.error('Could not save notes', e.message) }
    finally { setSavingNotes(false) }
  }

  const complete = async () => {
    if (!confirm('Mark this inspection as completed? You can still edit items after.')) return
    try {
      const updated = await api(`/inspections/${id}/complete`, { method: 'POST' })
      setInsp(updated); toast.success('Inspection completed')
    } catch (e) { toast.error('Could not complete', e.message) }
  }

  const remove = async () => {
    if (!confirm('Delete this inspection? This cannot be undone.')) return
    try {
      await api(`/inspections/${id}`, { method: 'DELETE' })
      toast.success('Inspection deleted'); navigate('/inspections')
    } catch (e) { toast.error('Could not delete', e.message) }
  }

  if (loading && !insp) return <div className="page"><div className="card card-pad muted">Loading inspection…</div></div>
  if (err || !insp) return <div className="page"><div className="card card-pad callout callout-danger">{err || 'Not found'}</div></div>

  // Group items by category, preserving the order the server returns.
  const grouped = []
  const seen = new Map()
  for (const it of (insp.items || [])) {
    if (!seen.has(it.category)) { seen.set(it.category, grouped.length); grouped.push({ category: it.category, items: [] }) }
    grouped[seen.get(it.category)].items.push(it)
  }
  const total = (insp.items || []).length
  const scored = insp.passCount + insp.attentionCount + insp.failCount
  const progress = total ? Math.round((scored / total) * 100) : 0

  return (
    <div className="page">
      <div className="row gap-8 wrap between" style={{ marginBottom: 12 }}>
        <Link to="/inspections" className="btn btn-ghost btn-sm"><ArrowLeft size={14} />Back</Link>
        <div className="row gap-8">
          <button className="btn btn-ghost" onClick={remove}><Trash2 size={14} />Delete</button>
          {insp.status !== 'completed' && <button className="btn btn-primary" onClick={complete}><CheckCircle2 size={15} />Complete inspection</button>}
        </div>
      </div>

      <div className="card card-pad stack gap-8">
        <div className="row between wrap">
          <div>
            <div className="section-title">Inspection</div>
            <h1 className="mt-4">{customer?.name || 'Unknown customer'}</h1>
            <div className="muted mt-4">
              <Car size={14} style={{ verticalAlign: -2 }} />{' '}
              {vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') : 'No vehicle'}
              {insp.mileage ? ` · ${insp.mileage.toLocaleString()} mi` : ''}
            </div>
            {doc && <div className="muted mt-4">Attached to: {(doc.type || 'document').replace('_', ' ')} #{doc.number || doc.displayNumber}</div>}
          </div>
          <div className="stack gap-8" style={{ minWidth: 220, textAlign: 'right' }}>
            <StatusPill status={insp.status} />
            <div className="row gap-8" style={{ justifyContent: 'flex-end', fontSize: 12 }}>
              {insp.passCount > 0 && <span className="badge" style={{ background: '#d1fae5', color: '#065f46' }}><Check size={11} />{insp.passCount} pass</span>}
              {insp.attentionCount > 0 && <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}><AlertTriangle size={11} />{insp.attentionCount} attention</span>}
              {insp.failCount > 0 && <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}><X size={11} />{insp.failCount} fail</span>}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{scored} / {total} items scored ({progress}%)</div>
          </div>
        </div>
      </div>

      {grouped.map((g) => (
        <div key={g.category} className="card card-pad mt-16">
          <h2 style={{ margin: 0, fontSize: 15, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-2)' }}>{g.category}</h2>
          <div className="stack gap-8 mt-12">
            {g.items.map((it) => (
              <ItemRow key={it.id} item={it} saving={savingItem === it.id} inspectionId={id} onChange={(patch) => updateItem(it.id, patch)} onPhotosChanged={load} />
            ))}
          </div>
        </div>
      ))}

      <div className="card card-pad mt-16">
        <h2 style={{ margin: 0, fontSize: 15 }}>Technician notes</h2>
        <textarea className="input" style={{ marginTop: 8, minHeight: 100 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Overall notes about this inspection…" />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-secondary" onClick={saveNotes} disabled={savingNotes || notes === (insp.notes || '')}><Save size={14} />{savingNotes ? 'Saving…' : 'Save notes'}</button>
        </div>
      </div>

      <div className="muted" style={{ marginTop: 16, fontSize: 12 }}>
        Session A: tech-facing checklist. Customer-facing share link, photo upload per item, and combined-with-invoice PDF arrive in later sessions.
      </div>
    </div>
  )
}

function ItemRow({ item, saving, inspectionId, onChange, onPhotosChanged }) {
  const [note, setNote] = useState(item.note || '')
  const [measurement, setMeasurement] = useState(item.measurement || '')
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  useEffect(() => { setNote(item.note || ''); setMeasurement(item.measurement || '') }, [item.id, item.note, item.measurement])

  const setStatus = (s) => onChange({ status: s })
  const commit = () => {
    if (note !== (item.note || '') || measurement !== (item.measurement || '')) {
      onChange({ note, measurement })
    }
  }

  const uploadFiles = async (files) => {
    if (!files || !files.length) return
    setUploading(true)
    try {
      const token = _useAppForToken.getState().user?.token
      for (const f of files) {
        const fd = new FormData()
        fd.append('photo', f)
        const res = await fetch(`/api/inspections/${inspectionId}/items/${item.id}/photos`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          toast.error('Upload failed', data.error || `Request failed (${res.status})`)
          continue
        }
      }
      onPhotosChanged?.()
    } finally { setUploading(false) }
  }

  const removePhoto = async (photoId) => {
    if (!confirm('Delete this photo?')) return
    try {
      await api(`/inspections/${inspectionId}/items/${item.id}/photos/${photoId}`, { method: 'DELETE' })
      onPhotosChanged?.()
    } catch (e) { toast.error('Could not delete', e.message) }
  }

  const photos = item.photos || []

  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid var(--border, #e5e7eb)' }}>
      <div className="row gap-12 wrap" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 220, flex: '1 1 220px' }}>
          <div style={{ fontWeight: 500 }}>{item.label}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            {item.status !== 'na' && <>Last set: <span style={{ textTransform: 'capitalize' }}>{item.status}</span></>}
            {saving && ' · saving…'}
          </div>
        </div>
        <div className="row gap-4">
          <StatusBtn label="Pass"      active={item.status === 'pass'}       bg="#d1fae5" fg="#065f46" icon={Check}         onClick={() => setStatus('pass')} />
          <StatusBtn label="Attention" active={item.status === 'attention'}  bg="#fef3c7" fg="#92400e" icon={AlertTriangle} onClick={() => setStatus('attention')} />
          <StatusBtn label="Fail"      active={item.status === 'fail'}       bg="#fee2e2" fg="#991b1b" icon={X}             onClick={() => setStatus('fail')} />
          <StatusBtn label="N/A"       active={item.status === 'na'}         bg="#f3f4f6" fg="#4b5563" icon={MinusCircle}   onClick={() => setStatus('na')} />
        </div>
        <input className="input" placeholder="Measurement (e.g. 7/32 in, 11.6 V)" value={measurement} onChange={(e) => setMeasurement(e.target.value)} onBlur={commit} style={{ minWidth: 180, flex: '0 1 220px' }} />
        <input className="input" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} onBlur={commit} style={{ minWidth: 220, flex: '2 1 300px' }} />
        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }} title="Add photo">
          <Camera size={14} />{uploading ? 'Uploading…' : 'Photo'}
          <input type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={(e) => { uploadFiles([...e.target.files]); e.target.value = '' }} />
        </label>
      </div>
      {photos.length > 0 && (
        <div className="row gap-8 wrap" style={{ marginTop: 8 }}>
          {photos.map((p, i) => (
            <div key={p.id} style={{ position: 'relative' }}>
              <button type="button" onClick={() => setLightbox({ photos, index: i, label: item.label })}
                style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
                aria-label={`Open photo ${i + 1} of ${photos.length}`}>
                <img src={p.url} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border, #e5e7eb)', display: 'block' }} />
              </button>
              <button type="button" onClick={() => removePhoto(p.id)} className="icon-btn sm" style={{ position: 'absolute', top: -6, right: -6, background: '#fff', border: '1px solid var(--border, #e5e7eb)', borderRadius: '50%' }} aria-label="Delete photo"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
      {lightbox && <InspLightbox photos={lightbox.photos} index={lightbox.index} label={lightbox.label} onClose={() => setLightbox(null)} />}
    </div>
  )
}

function StatusBtn({ label, active, bg, fg, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-sm"
      style={{
        background: active ? bg : 'transparent',
        color: active ? fg : 'var(--text-2)',
        border: `1px solid ${active ? bg : 'var(--border, #e5e7eb)'}`,
        fontWeight: active ? 600 : 400,
      }}
      aria-pressed={active}
      title={label}
    >
      <Icon size={14} />
      <span className="only-wide">{label}</span>
    </button>
  )
}

function InspLightbox({ photos, index: start, label, onClose }) {
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}>
      <button onClick={(e) => { e.stopPropagation(); onClose() }} aria-label="Close"
        style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={22} /></button>
      {photos.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); prev() }} aria-label="Previous"
            style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', fontSize: 22 }}>&lsaquo;</button>
          <button onClick={(e) => { e.stopPropagation(); next() }} aria-label="Next"
            style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', fontSize: 22 }}>&rsaquo;</button>
        </>
      )}
      <div onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: '100%', maxHeight: '100%' }}>
        <img src={p.url} alt={label || ''} style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8 }} />
        <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
          {label}{photos.length > 1 && <> &middot; <span style={{ opacity: 0.7 }}>{i + 1} of {photos.length}</span></>}
        </div>
      </div>
    </div>
  )
}

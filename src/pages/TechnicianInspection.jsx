import { useEffect, useRef, useState } from 'react'
import { Camera, Check, AlertTriangle, X, MinusCircle, ArrowLeft, Loader2, Plus, Trash2, Car, Phone, Send, Save } from 'lucide-react'

// Public mobile technician inspection page. No login — token in URL is the
// only credential. Fetches /api/technician/inspection/{token} which strictly
// omits pricing. All writes go through token-scoped endpoints.

const CONDITIONS = [
  { v: 'pass',      label: 'Good',          bg: '#d1fae5', fg: '#065f46', icon: Check },
  { v: 'attention', label: 'Needs attn.',   bg: '#fef3c7', fg: '#92400e', icon: AlertTriangle },
  { v: 'fail',      label: 'Bad / Failed',  bg: '#fee2e2', fg: '#991b1b', icon: X },
  { v: 'na',        label: 'N/A',           bg: '#f3f4f6', fg: '#4b5563', icon: MinusCircle },
]
const RECOMMENDATIONS = [
  { v: 'none',              label: 'No action' },
  { v: 'inspect_further',   label: 'Inspect further' },
  { v: 'repair',            label: 'Repair' },
  { v: 'replace',           label: 'Replace' },
  { v: 'service',           label: 'Service' },
  { v: 'monitor',           label: 'Monitor' },
  { v: 'customer_declined', label: 'Customer declined' },
  { v: 'other',             label: 'Other' },
]

export default function TechnicianInspection() {
  const token = typeof window !== 'undefined' ? window.location.pathname.replace(/^\/technician\/inspection\//, '') : ''
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState(null) // active category key
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const api = async (path, opts = {}) => {
    const headers = {}
    if (opts.body !== undefined && !opts.form) headers['Content-Type'] = 'application/json'
    const res = await fetch(`/api/technician/inspection/${encodeURIComponent(token)}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.form || (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Request failed') }
    return res.status === 204 ? null : res.json()
  }

  const load = async () => {
    try { setData(await api('')) }
    catch (e) { setErr(e.message) }
  }
  useEffect(() => { if (token) load() }, [token])

  if (err) return (
    <Shell>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <X size={32} color="#dc2626" />
        <h2 style={{ marginTop: 10 }}>Link unavailable</h2>
        <p style={{ color: '#6b7280' }}>{err}</p>
      </div>
    </Shell>
  )
  if (!data) return <Shell><div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={28} /></div></Shell>

  // Group items by category.
  const groups = []
  const idx = new Map()
  for (const it of (data.items || [])) {
    if (!idx.has(it.category)) { idx.set(it.category, groups.length); groups.push({ category: it.category, items: [] }) }
    groups[idx.get(it.category)].items.push(it)
  }
  const activeGroup = groups.find((g) => g.category === tab) || groups[0]
  const done = (data.passCount + data.attentionCount + data.failCount)
  const total = (data.items || []).length

  const patchItem = async (itemId, patch) => {
    setSaving(true)
    try { await api(`/items/${itemId}`, { method: 'PATCH', body: patch }); await load() }
    catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }
  const addItem = async (category) => {
    const label = window.prompt('What inspection item do you want to add?')
    if (!label || !label.trim()) return
    setSaving(true)
    try { await api('/items', { method: 'POST', body: { category, label: label.trim() } }); await load() }
    catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }
  const removeItem = async (itemId) => {
    if (!confirm('Remove this item from the inspection?')) return
    try { await api(`/items/${itemId}`, { method: 'DELETE' }); await load() } catch (e) { alert(e.message) }
  }
  const uploadPhoto = async (itemId, file) => {
    const fd = new FormData()
    fd.append('photo', file)
    try {
      const res = await fetch(`/api/technician/inspection/${encodeURIComponent(token)}/items/${itemId}/photos`, { method: 'POST', body: fd })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Upload failed') }
      await load()
    } catch (e) { alert(`Photo upload failed — ${e.message}`) }
  }
  const removePhoto = async (itemId, photoId) => {
    if (!confirm('Remove this photo?')) return
    try { await api(`/items/${itemId}/photos/${photoId}`, { method: 'DELETE' }); await load() } catch (e) { alert(e.message) }
  }
  const submit = async () => {
    if (!confirm('Submit this inspection for manager review?')) return
    setSubmitting(true)
    try { await api('/submit', { method: 'POST' }); await load() }
    catch (e) { alert(e.message) }
    finally { setSubmitting(false) }
  }

  const terminal = data.status === 'submitted' || data.status === 'manager_review' || data.status === 'completed'
  const v = data.customer?.vehicle || {}

  return (
    <Shell>
      {/* Header card */}
      <div style={{ background: 'linear-gradient(135deg,#1e40af,#2563eb)', color: '#fff', padding: '14px 16px', borderRadius: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', opacity: 0.8 }}>
          {data.shop?.name || 'Vehicle inspection'}
          {data.document?.label && <> · {data.document.label}</>}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
          {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
        </div>
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
          {v.vin && <>VIN {v.vin}</>}
          {v.plate && <> · Plate {v.plate}</>}
          {data.mileage > 0 && <> · {data.mileage.toLocaleString()} mi</>}
        </div>
        {data.customer?.name && (
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>Customer: {data.customer.name}</div>
        )}
        <StatusChip status={data.status} />
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 10, fontSize: 12, color: '#374151' }}>
        {done} / {total} items checked
        <div style={{ height: 6, borderRadius: 3, background: '#e5e7eb', marginTop: 6, overflow: 'hidden' }}>
          <div style={{ width: total ? `${(done / total) * 100}%` : 0, height: '100%', background: 'linear-gradient(90deg,#2563eb,#1d4ed8)', transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, marginBottom: 10 }}>
        {groups.map((g) => {
          const active = g.category === (activeGroup?.category)
          return (
            <button key={g.category} onClick={() => setTab(g.category)}
              style={{
                padding: '8px 14px', borderRadius: 999, border: '1px solid',
                background: active ? '#2563eb' : '#fff',
                color: active ? '#fff' : '#374151',
                borderColor: active ? '#2563eb' : '#e5e7eb',
                fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer',
              }}>{g.category}</button>
          )
        })}
      </div>

      {/* Items in active group */}
      {activeGroup && activeGroup.items.map((it) => (
        <ItemCard key={it.id} item={it} disabled={terminal}
          onChange={(patch) => patchItem(it.id, patch)}
          onRemove={() => removeItem(it.id)}
          onUpload={(f) => uploadPhoto(it.id, f)}
          onRemovePhoto={(pid) => removePhoto(it.id, pid)}
          tokenURL={(id) => `/api/technician/inspection/${encodeURIComponent(token)}/photos/${id}`} />
      ))}

      {!terminal && activeGroup && (
        <button onClick={() => addItem(activeGroup.category)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center',
                   padding: 12, borderRadius: 10, border: '2px dashed #cbd5e1', background: '#f9fafb',
                   color: '#475569', fontWeight: 600, cursor: 'pointer', marginTop: 8 }}>
          <Plus size={16} />Add item to {activeGroup.category}
        </button>
      )}

      {/* Submit bar */}
      {!terminal && (
        <div style={{
          position: 'sticky', bottom: 0, marginTop: 20,
          background: '#fff', padding: '12px 0', borderTop: '1px solid #e5e7eb',
        }}>
          <button onClick={submit} disabled={submitting}
            style={{
              width: '100%', padding: 14, borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>
            {submitting ? 'Submitting…' : <><Send size={16} style={{ verticalAlign: -2 }} /> Submit for manager review</>}
          </button>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#6b7280', marginTop: 6 }}>
            {saving ? <Save size={11} style={{ verticalAlign: -1 }} /> : null} Your changes are saved automatically.
          </div>
        </div>
      )}
    </Shell>
  )
}

function ItemCard({ item, disabled, onChange, onRemove, onUpload, onRemovePhoto, tokenURL }) {
  const [note, setNote] = useState(item.note || '')
  const [measurement, setMeasurement] = useState(item.measurement || '')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  useEffect(() => { setNote(item.note || ''); setMeasurement(item.measurement || '') }, [item.id, item.note, item.measurement])

  const commit = () => {
    if (note !== (item.note || '') || measurement !== (item.measurement || '')) onChange({ note, measurement })
  }
  const takePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try { await onUpload(file) } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, marginBottom: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{item.label}</div>
        {!disabled && (
          <button onClick={onRemove} aria-label="Remove item" style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 4 }}>
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Condition pills */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
        {CONDITIONS.map((c) => {
          const active = item.status === c.v
          const Icon = c.icon
          return (
            <button key={c.v} disabled={disabled} onClick={() => onChange({ status: c.v })}
              style={{
                padding: '10px 4px', borderRadius: 10,
                background: active ? c.bg : '#fff',
                border: `2px solid ${active ? c.fg : '#e5e7eb'}`,
                color: active ? c.fg : '#6b7280',
                fontSize: 11, fontWeight: 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
              <Icon size={16} />{c.label}
            </button>
          )
        })}
      </div>

      {/* Recommendation */}
      <label style={{ display: 'block', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Recommendation</div>
        <select disabled={disabled} value={item.recommendation || 'none'} onChange={(e) => onChange({ recommendation: e.target.value })}
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, background: '#fff' }}>
          {RECOMMENDATIONS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
        </select>
      </label>

      {/* Measurement + note */}
      <input disabled={disabled} className="input" placeholder="Measurement (e.g. 2mm, 11.6V)" value={measurement}
        onChange={(e) => setMeasurement(e.target.value)} onBlur={commit}
        style={inputStyle} />
      <textarea disabled={disabled} className="input" placeholder="Note" value={note}
        onChange={(e) => setNote(e.target.value)} onBlur={commit}
        style={{ ...inputStyle, marginTop: 8, minHeight: 56, resize: 'vertical' }} />

      {/* Photos */}
      {(item.photos || []).length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {item.photos.map((p) => (
            <div key={p.id} style={{ position: 'relative' }}>
              <img src={tokenURL(p.id)} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
              {!disabled && (
                <button onClick={() => onRemovePhoto(p.id)} aria-label="Delete photo"
                  style={{ position: 'absolute', top: -6, right: -6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!disabled && (
        <label style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginTop: 10, padding: 12, borderRadius: 10,
          border: '2px dashed #93c5fd', background: '#eff6ff', color: '#1d4ed8',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          <Camera size={18} />{uploading ? 'Uploading…' : 'Take photo'}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={takePhoto} style={{ display: 'none' }} />
        </label>
      )}
    </div>
  )
}

function StatusChip({ status }) {
  const map = {
    not_started:    { bg: '#f3f4f6', fg: '#4b5563', label: 'Not started' },
    in_progress:    { bg: '#dbeafe', fg: '#1e40af', label: 'In progress' },
    submitted:      { bg: '#dcfce7', fg: '#166534', label: 'Submitted' },
    manager_review: { bg: '#fef3c7', fg: '#92400e', label: 'Manager review' },
    completed:      { bg: '#d1fae5', fg: '#065f46', label: 'Completed' },
    cancelled:      { bg: '#f3f4f6', fg: '#4b5563', label: 'Cancelled' },
  }
  const c = map[status] || map.in_progress
  return <span style={{ display: 'inline-block', marginTop: 8, padding: '3px 10px', borderRadius: 999, background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700 }}>{c.label}</span>
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'Inter, system-ui, sans-serif', color: '#111' }}>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: 12 }}>{children}</div>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #e5e7eb', fontSize: 14, background: '#fff',
}

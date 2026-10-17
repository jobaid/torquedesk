import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../store/useApp'
import { Send, ImagePlus, Users, Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react'

// Shop Manager → Customer Broadcast
// Compose one email + optional photo and send to every customer with an
// email on file. Photo is uploaded to a server dir with 24h TTL.
export default function CustomerBroadcast() {
  const features = useApp(s => s.features)
  const enabled = !features || features.customer_broadcast

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [count, setCount] = useState(null)
  const [image, setImage] = useState(null)   // { url, absolute, expiresAt }
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(null)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  const loadCount = async () => {
    try {
      const r = await api('/customer-broadcast/preview')
      setCount(r?.count ?? 0)
    } catch { setCount(null) }
  }
  useEffect(() => { if (enabled) loadCount() }, [enabled])

  if (!enabled) {
    return (
      <div className="page full">
        <div className="card stack gap-8" style={{ maxWidth: 560, padding: 24 }}>
          <h2>Customer broadcast email</h2>
          <p className="muted">This add-on is not enabled for your shop. Contact your Fixora administrator to enable it.</p>
        </div>
      </div>
    )
  }

  const onPickImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setErr('Image must be under 10 MB.'); return }
    setUploading(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const token = useApp.getState().user?.token
      const res = await fetch('/api/customer-broadcast/upload', {
        method: 'POST',
        headers: token ? { Authorization: 'Bearer ' + token } : {},
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Upload failed')
      setImage(data)
    } catch (e) { setErr(e?.message || 'Upload failed') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const removeImage = () => setImage(null)

  const send = async () => {
    if (!subject.trim() || !body.trim()) { setErr('Subject and body are required.'); return }
    if (!window.confirm(`Send this email to ${count ?? '?'} customer${count === 1 ? '' : 's'}?`)) return
    setBusy(true); setErr(''); setSent(null)
    try {
      const r = await api('/customer-broadcast', {
        method: 'POST',
        body: { subject: subject.trim(), body: body.trim(), imageUrl: image?.url || '' },
      })
      setSent(r)
      // Clear form after a successful send so the staff don't send twice.
      setSubject(''); setBody(''); setImage(null)
    } catch (e) { setErr(e?.message || 'Send failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="page full">
      <div className="stack gap-16" style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
        <div>
          <h1>Customer broadcast email</h1>
          <p className="muted">Send a deal, update, or announcement to every customer with an email on file.</p>
        </div>

        <div className="row gap-6" style={{ color: '#64748b', alignItems: 'center' }}>
          <Users size={14} /> <span className="xs">{count === null ? '…' : `${count} customer${count === 1 ? '' : 's'} will receive this`}</span>
        </div>

        <label className="stack gap-4">
          <span className="xs">Subject</span>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. 20% off oil changes this week" />
        </label>

        <label className="stack gap-4">
          <span className="xs">Message</span>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={10}
            placeholder="Write your message. Blank lines become paragraphs."
            style={{ fontFamily: 'inherit' }}
          />
        </label>

        <div className="stack gap-6">
          <span className="xs">Photo (optional)</span>
          {!image && (
            <div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onPickImage} style={{ display: 'none' }} />
              <button className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 size={14} className="spin" /> : <ImagePlus size={14} />} Attach image
              </button>
              <div className="xs muted" style={{ marginTop: 4 }}>JPEG / PNG / WebP / GIF, max 10 MB. Images are kept on the server for 24 hours only.</div>
            </div>
          )}
          {image && (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img src={image.url} alt="attachment preview" style={{ maxHeight: 160, borderRadius: 6, border: '1px solid #e2e8f0' }} />
              <button className="icon-btn sm" onClick={removeImage}
                style={{ position: 'absolute', top: 4, right: 4, background: '#fff', border: '1px solid #e2e8f0' }}
                aria-label="Remove image"><X size={14} /></button>
              <div className="xs muted" style={{ marginTop: 4 }}>Expires {new Date(image.expiresAt).toLocaleString()}</div>
            </div>
          )}
        </div>

        {err && <div className="row gap-6" style={{ color: '#dc2626' }}><AlertTriangle size={16} />{err}</div>}
        {sent && (
          <div className="row gap-6" style={{ color: '#16a34a' }}>
            <CheckCircle2 size={16} /> Queued {sent.recipients} email{sent.recipients === 1 ? '' : 's'} (batch {sent.batch}).
          </div>
        )}

        <div className="row gap-8">
          <button className="btn btn-primary" onClick={send} disabled={busy || uploading}>
            {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
            Send to {count ?? '?'} customer{count === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}

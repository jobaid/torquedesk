import { useEffect, useState } from 'react'
import { ownerApi } from '../../store/useOwner'
import { Send, Users, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'

// SaaS Owner → Broadcast — one custom email to every shop owner.
// Common uses: maintenance window, new release note, outage status.
export default function Broadcast() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('active')
  const [count, setCount] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(null)
  const [err, setErr] = useState('')

  const preview = async (aud = audience) => {
    try {
      const r = await ownerApi('/broadcast/preview?audience=' + aud)
      setCount(r?.count ?? 0)
    } catch { setCount(null) }
  }
  useEffect(() => { preview(audience) }, [audience])

  const send = async () => {
    if (!subject.trim() || !body.trim()) { setErr('Subject and body are required.'); return }
    if (!window.confirm(`Send this email to ${count ?? '?'} shop owners?`)) return
    setBusy(true); setErr(''); setSent(null)
    try {
      const r = await ownerApi('/broadcast', {
        method: 'POST',
        body: { subject: subject.trim(), body: body.trim(), audience },
      })
      setSent(r)
    } catch (e) { setErr(e?.message || 'Send failed') }
    finally { setBusy(false) }
  }

  const useTemplate = (kind) => {
    if (kind === 'maintenance') {
      setSubject('TorqueDesk scheduled maintenance')
      setBody(`Hi,

We'll be performing scheduled maintenance on TorqueDesk from <strong>10:00 PM EST tonight</strong> to <strong>11:00 PM EST</strong>. During this window the app may be briefly unavailable while we deploy updates.

No action is required on your part. If you have any questions, reply to this email.

Thanks,
The TorqueDesk team`)
    } else if (kind === 'outage') {
      setSubject('TorqueDesk service update')
      setBody(`Hi,

We're currently investigating a service issue affecting some TorqueDesk shops. Our team is actively working on a fix.

We'll send a follow-up email once the issue is fully resolved. Thanks for your patience.

— The TorqueDesk team`)
    } else if (kind === 'update') {
      setSubject("What's new on TorqueDesk")
      setBody(`Hi,

A quick note on what shipped this week:

- …

Log in to try it out, and reply if you have questions.

— The TorqueDesk team`)
    }
  }

  return (
    <div className="stack gap-24" style={{ maxWidth: 760 }}>
      <div>
        <h1>Broadcast email</h1>
        <p className="muted">Send a custom email to every shop owner on the platform.</p>
      </div>

      <div className="row gap-8">
        <button className="btn btn-ghost xs" onClick={() => useTemplate('maintenance')}>Maintenance template</button>
        <button className="btn btn-ghost xs" onClick={() => useTemplate('outage')}>Outage template</button>
        <button className="btn btn-ghost xs" onClick={() => useTemplate('update')}>Product update template</button>
      </div>

      <label className="stack gap-4">
        <span className="xs">Audience</span>
        <select value={audience} onChange={e => setAudience(e.target.value)} style={{ maxWidth: 360 }}>
          <option value="active">Active shops only (status=active or trial)</option>
          <option value="all">All shop owners (incl. suspended / expired)</option>
        </select>
        <span className="xs row gap-6" style={{ color: '#64748b' }}>
          <Users size={14} /> {count === null ? '…' : `${count} recipient${count === 1 ? '' : 's'}`}
        </span>
      </label>

      <label className="stack gap-4">
        <span className="xs">Subject</span>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Scheduled maintenance tonight" />
      </label>

      <label className="stack gap-4">
        <span className="xs">Body (plain text or HTML)</span>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={14}
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
          placeholder="Write your message. Blank lines become paragraphs; <strong>, <a>, <br>, <ul>/<li> are preserved."
        />
      </label>

      {err && <div className="row gap-6" style={{ color: '#dc2626' }}><AlertTriangle size={16} />{err}</div>}
      {sent && (
        <div className="row gap-6" style={{ color: '#16a34a' }}>
          <CheckCircle2 size={16} /> Queued {sent.recipients} email{sent.recipients === 1 ? '' : 's'} (batch {sent.batch}).
        </div>
      )}

      <div className="row gap-8">
        <button className="btn btn-primary" onClick={send} disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
          Send to {count ?? '?'} recipient{count === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  )
}

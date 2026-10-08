import { useEffect, useState } from 'react'
import { Mail, Save, Send, Power, LogOut } from 'lucide-react'
import { Card, PageHeader, Btn, Field, Input, Select } from './primitives'
import { ownerApi } from '../../store/useOwner'

// Platform-level outbound email configuration (SaaS owner's own noreply /
// support address). This is used by TorqueDesk to email SHOP OWNERS about
// platform events — new shop welcome, status changes, subscription updates.
// It is NOT the per-shop mailer that shops use to email their customers.

const PRESETS = [
  { label: 'SendGrid',  host: 'smtp.sendgrid.net',    port: 587, tls: true, hint: 'Username is the literal word "apikey"; password is your API key.' },
  { label: 'Postmark',  host: 'smtp.postmarkapp.com', port: 587, tls: true, hint: 'Username and password are both your Postmark server token.' },
  { label: 'Mailgun',   host: 'smtp.mailgun.org',     port: 587, tls: true, hint: 'Username is postmaster@yourdomain; password is your SMTP password.' },
  { label: 'Amazon SES',host: 'email-smtp.us-east-1.amazonaws.com', port: 587, tls: true, hint: 'Use SMTP credentials from SES, not your IAM key.' },
  { label: 'Gmail SMTP',host: 'smtp.gmail.com',       port: 587, tls: true, hint: 'Use a Google Workspace account with an app password.' },
  { label: 'Custom',    host: '',                     port: 587, tls: true, hint: '' },
]

export default function PlatformEmail() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [host, setHost] = useState('')
  const [port, setPort] = useState(587)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [clearPassword, setClearPassword] = useState(false)
  const [useTls, setUseTls] = useState(true)
  const [fromEmail, setFromEmail] = useState('')
  const [fromName, setFromName] = useState('TorqueDesk')
  const [replyTo, setReplyTo] = useState('')
  const [notifyNewCompany, setNotifyNewCompany] = useState(true)
  const [notifyStatusChange, setNotifyStatusChange] = useState(true)
  const [notifySubscription, setNotifySubscription] = useState(true)
  const [hint, setHint] = useState('')
  const [testTo, setTestTo] = useState('')

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const d = await ownerApi('/mail')
      setData(d)
      setEnabled(d.enabled)
      setHost(d.smtpHost || '')
      setPort(d.smtpPort || 587)
      setUser(d.smtpUser || '')
      setUseTls(d.smtpUseTLS)
      setFromEmail(d.fromEmail || '')
      setFromName(d.fromName || 'TorqueDesk')
      setReplyTo(d.replyTo || '')
      setNotifyNewCompany(d.notifyNewCompany)
      setNotifyStatusChange(d.notifyStatusChange)
      setNotifySubscription(d.notifySubscription)
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const applyPreset = (p) => {
    setHost(p.host); setPort(p.port); setUseTls(p.tls); setHint(p.hint || '')
  }

  const save = async () => {
    setBusy(true); setErr(''); setOk('')
    try {
      await ownerApi('/mail', {
        method: 'PUT',
        body: {
          enabled,
          smtpHost: host.trim(), smtpPort: Number(port) || 587,
          smtpUser: user.trim(), smtpPassword: password, clearPassword,
          smtpUseTLS: useTls,
          fromEmail: fromEmail.trim(), fromName: fromName.trim(), replyTo: replyTo.trim(),
          notifyNewCompany, notifyStatusChange, notifySubscription,
        },
      })
      setPassword(''); setClearPassword(false)
      setOk('Platform email settings saved.')
      load()
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const signOut = async () => {
    if (!confirm('Disconnect the platform mailer? Platform notifications to shop owners will stop until you reconfigure it.')) return
    setBusy(true); setErr(''); setOk('')
    try {
      await ownerApi('/mail', {
        method: 'PUT',
        body: {
          enabled: false,
          smtpHost: '', smtpUser: '', smtpPassword: '', clearPassword: true,
          fromEmail: '', replyTo: '',
        },
      })
      setPassword(''); setClearPassword(false)
      setOk('Platform mailer disconnected.')
      load()
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const sendTest = async () => {
    if (!testTo.trim()) return
    setBusy(true); setErr(''); setOk('')
    try {
      await ownerApi('/mail/test', { method: 'POST', body: { to: testTo.trim() } })
      setOk('Test email sent to ' + testTo + '.')
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  if (loading) return <div><PageHeader title="Platform Email" /><div style={{ color: '#8da2bf' }}>Loading…</div></div>

  const connected = (data?.smtpHost || data?.hasPassword)

  return (
    <div>
      <PageHeader
        title="Platform Email"
        subtitle="Outbound sender for emails the TorqueDesk platform sends to shop owners — new shop welcome, status changes, subscription updates. Separate from each shop's own mailer."
        actions={connected && <Btn variant="danger" onClick={signOut} disabled={busy}><LogOut size={14} /> Disconnect</Btn>}
      />
      {err && <div style={banner('danger')}>{err}</div>}
      {ok && <div style={banner('ok')}>{ok}</div>}

      <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Mail size={16} color="#8da2bf" />
            <div style={{ fontSize: 15, fontWeight: 600 }}>Sender identity</div>
            <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <Power size={14} color={enabled ? '#86efac' : '#8da2bf'} />
              <label style={{ color: '#c5d2e1' }}>
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ marginRight: 6 }} />
                Enabled
              </label>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="From email" hint="noreply@yourdomain.com (use a verified sender).">
              <Input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="noreply@torquedesk.com" />
            </Field>
            <Field label="From name" hint="Shown as the sender name in inboxes.">
              <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="TorqueDesk" />
            </Field>
            <Field label="Reply-to (optional)">
              <Input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="support@torquedesk.com" />
            </Field>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>SMTP server</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => applyPreset(p)}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #2a3650', background: 'transparent', color: '#c5d2e1', cursor: 'pointer', fontSize: 12 }}>
                {p.label}
              </button>
            ))}
          </div>
          {hint && <div style={{ fontSize: 11, color: '#8da2bf', marginBottom: 10 }}>{hint}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Field label="Host">
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.sendgrid.net" />
            </Field>
            <Field label="Port">
              <Input type="number" value={port} onChange={(e) => setPort(e.target.value)} />
            </Field>
            <Field label="Username">
              <Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="apikey or SMTP user" autoComplete="off" />
            </Field>
            <Field label={`Password ${data?.hasPassword ? '(stored)' : ''}`}
              hint={data?.hasPassword ? 'Leave blank to keep the saved password.' : ''}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={data?.hasPassword ? '•••• (keep saved)' : 'SMTP password / API key'} autoComplete="new-password" />
              {data?.hasPassword && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: '#8da2bf' }}>
                  <input type="checkbox" checked={clearPassword} onChange={(e) => setClearPassword(e.target.checked)} />
                  Clear stored password
                </label>
              )}
            </Field>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, color: '#c5d2e1' }}>
            <input type="checkbox" checked={useTls} onChange={(e) => setUseTls(e.target.checked)} />
            Use STARTTLS (recommended)
          </label>
        </Card>

        <Card>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Which events send email</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <Toggle label="New shop welcome" sub="Sent when you create a new company." checked={notifyNewCompany} onChange={setNotifyNewCompany} />
            <Toggle label="Status change" sub="Sent when you suspend, reactivate, expire, or cancel a shop." checked={notifyStatusChange} onChange={setNotifyStatusChange} />
            <Toggle label="Subscription updates" sub="Sent when you extend, renew, change plan, or expire a subscription." checked={notifySubscription} onChange={setNotifySubscription} />
          </div>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Btn onClick={save} disabled={busy}><Save size={14} /> {busy ? 'Saving…' : 'Save settings'}</Btn>
        </div>

        <Card>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Send a test email</div>
          <div style={{ fontSize: 12, color: '#8da2bf', marginBottom: 10 }}>
            Verifies the SMTP settings above. The platform mailer must be enabled and saved first.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
            <div style={{ flex: 1 }}>
              <Field label="Send test to">
                <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
              </Field>
            </div>
            <Btn variant="secondary" onClick={sendTest} disabled={busy || !testTo.trim()}><Send size={14} /> Send test</Btn>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Toggle({ label, sub, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} />
      <div>
        <div style={{ fontSize: 13, color: '#e5edf5' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#8da2bf' }}>{sub}</div>
      </div>
    </label>
  )
}

const banner = (kind) => ({
  padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13,
  background: kind === 'ok' ? 'rgba(40,167,69,0.12)' : 'rgba(220,53,69,0.12)',
  border: '1px solid ' + (kind === 'ok' ? 'rgba(40,167,69,0.35)' : 'rgba(220,53,69,0.35)'),
  color: kind === 'ok' ? '#95eab0' : '#fda1aa',
})

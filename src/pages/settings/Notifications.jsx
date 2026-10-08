import { useEffect, useState } from 'react'
import { Mail, Save, Send, AlertCircle, CheckCircle2 } from 'lucide-react'
import { SectionHead } from './kit'
import { api } from '../../lib/api'
import { toast } from '../../store/useApp'

// Provider presets. Each one sets the SMTP host/port/TLS and includes a link
// to that provider's app-password docs. Gmail / Outlook / AOL all require an
// 'app password' (not the regular login password) for third-party clients.
const EMAIL_PRESETS = [
  { id: 'gmail',   label: 'Gmail',    emoji: '📧', host: 'smtp.gmail.com',       port: 587, tls: true,
    help: 'https://support.google.com/accounts/answer/185833' },
  { id: 'outlook', label: 'Outlook',  emoji: '📨', host: 'smtp-mail.outlook.com', port: 587, tls: true,
    help: 'https://support.microsoft.com/en-us/account-billing/5896ed9b-4263-e681-128a-a6f2979a7944' },
  { id: 'aol',     label: 'AOL',      emoji: '📬', host: 'smtp.aol.com',          port: 587, tls: true,
    help: 'https://help.aol.com/articles/Create-and-manage-app-password' },
  { id: 'yahoo',   label: 'Yahoo',    emoji: '📥', host: 'smtp.mail.yahoo.com',   port: 587, tls: true,
    help: 'https://help.yahoo.com/kb/SLN15241.html' },
  { id: 'icloud',  label: 'iCloud',   emoji: '☁️',  host: 'smtp.mail.me.com',      port: 587, tls: true,
    help: 'https://support.apple.com/en-us/102654' },
  { id: 'custom',  label: 'Other SMTP', emoji: '⚙️', host: '',                      port: 587, tls: true, help: '' },
]

// Settings → General → Notifications. SMTP + reminder config so the ticker
// can send customer reminders when an authorization sits unanswered.

export function NotificationSettings() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testBusy, setTestBusy] = useState(false)

  // Draft state for the fields that need to be POSTed back.
  const [host, setHost] = useState('')
  const [port, setPort] = useState(587)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [clearPassword, setClearPassword] = useState(false)
  const [useTls, setUseTls] = useState(true)
  const [fromEmail, setFromEmail] = useState('')
  const [fromName, setFromName] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [remindersEnabled, setRemindersEnabled] = useState(false)
  const [reminderDays, setReminderDays] = useState(2)
  const [helpUrl, setHelpUrl] = useState('')

  const applyPreset = (p) => {
    setHost(p.host); setPort(p.port); setUseTls(p.tls); setHelpUrl(p.help || '')
    toast.success(`${p.label} selected`, p.host ? `Server set to ${p.host}. Enter your email and app password below.` : 'Enter your custom SMTP server below.')
  }

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const d = await api('/settings/notifications')
      setData(d)
      setHost(d.smtpHost || '')
      setPort(d.smtpPort || 587)
      setUser(d.smtpUser || '')
      setUseTls(d.smtpUseTLS)
      setFromEmail(d.fromEmail || '')
      setFromName(d.fromName || '')
      setReplyTo(d.replyTo || '')
      setRemindersEnabled(d.remindersEnabled)
      setReminderDays(d.reminderDays || 2)
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    setBusy(true); setErr('')
    try {
      await api('/settings/notifications', {
        method: 'PUT',
        body: {
          smtpHost: host.trim(), smtpPort: Number(port) || 587, smtpUser: user.trim(),
          smtpPassword: password, clearPassword,
          smtpUseTLS: useTls,
          fromEmail: fromEmail.trim(), fromName: fromName.trim(), replyTo: replyTo.trim(),
          remindersEnabled, reminderDays: Number(reminderDays) || 2,
        },
      })
      setPassword(''); setClearPassword(false)
      toast.success('Notification settings saved')
      load()
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const sendTest = async () => {
    if (!testTo.trim()) return
    setTestBusy(true); setErr('')
    try {
      await api('/settings/notifications/test', { method: 'POST', body: { to: testTo.trim() } })
      toast.success('Test sent', 'Check the inbox at ' + testTo)
    } catch (e) { setErr(e.message) }
    finally { setTestBusy(false) }
  }

  return (
    <div>
      <SectionHead
        title="Notifications"
        description="Configure outbound email (SMTP) so your shop can send automatic reminder emails to customers who haven't responded to an authorization request. Password is stored encrypted and never returned to this screen."
        perm="shop.edit"
      />
      {err && <div className="callout callout-danger" role="alert"><AlertCircle size={18} /><div>{err}</div></div>}
      {loading ? <div className="muted">Loading…</div> : (
        <>
          <section className="card card-pad stack gap-12">
            <h2 style={{ margin: 0, fontSize: 15 }}><Mail size={16} style={{ verticalAlign: -2 }} /> Connect your email account</h2>
            <div className="muted" style={{ fontSize: 12 }}>
              Pick your provider to pre-fill the server. Then enter your email and <strong>app password</strong>
              {' '}(not your regular password — Gmail / Outlook / AOL all require a one-time app password for third-party apps).
            </div>
            <div className="row gap-6 wrap">
              {EMAIL_PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => applyPreset(p)}
                  style={{
                    padding: '8px 14px', borderRadius: 8,
                    background: '#fff', border: '1px solid #e5e7eb',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    cursor: 'pointer', fontSize: 13,
                  }}>
                  <span style={{ fontSize: 16 }}>{p.emoji}</span>{p.label}
                </button>
              ))}
            </div>
            {helpUrl && (
              <a href={helpUrl} target="_blank" rel="noreferrer" className="small" style={{ color: 'var(--brand-text, #2563eb)' }}>
                How to generate an app password →
              </a>
            )}
          </section>

          <section className="card card-pad stack gap-12" style={{ marginTop: 16 }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>SMTP details</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Host</div>
                <input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.sendgrid.net" />
              </label>
              <label>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Port</div>
                <input className="input" type="number" value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" />
              </label>
              <label>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Username</div>
                <input className="input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="apikey or your SMTP user" autoComplete="off" />
              </label>
              <label>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Password {data?.hasPassword && <span style={{ color: '#059669' }}>stored</span>}
                </div>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={data?.hasPassword ? 'Leave blank to keep saved password' : 'SMTP password / API key'} autoComplete="new-password" />
                {data?.hasPassword && (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12 }}>
                    <input type="checkbox" checked={clearPassword} onChange={(e) => setClearPassword(e.target.checked)} />
                    Clear stored password
                  </label>
                )}
              </label>
              <label className="row gap-8" style={{ alignItems: 'center' }}>
                <input type="checkbox" checked={useTls} onChange={(e) => setUseTls(e.target.checked)} />
                Use STARTTLS (recommended)
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>From email</div>
                <input className="input" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="shop@yourdomain.com" />
              </label>
              <label>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>From name</div>
                <input className="input" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your Shop" />
              </label>
              <label>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Reply-to (optional)</div>
                <input className="input" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="service@yourdomain.com" />
              </label>
            </div>
          </section>

          <section className="card card-pad stack gap-12" style={{ marginTop: 16 }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Reminder emails</h2>
            <label className="row gap-8" style={{ alignItems: 'center' }}>
              <input type="checkbox" checked={remindersEnabled} onChange={(e) => setRemindersEnabled(e.target.checked)} />
              Enable automatic reminder emails for pending authorizations
            </label>
            <label style={{ maxWidth: 240 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Send reminder after (days)</div>
              <input className="input" type="number" min={1} max={60} value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} />
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>One reminder per request. Checked every 5 minutes by the server.</div>
            </label>
          </section>

          <div className="row gap-8" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-primary" onClick={save} disabled={busy}><Save size={14} />{busy ? 'Saving…' : 'Save'}</button>
          </div>

          <section className="card card-pad stack gap-8" style={{ marginTop: 16 }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Send test email</h2>
            <div className="muted" style={{ fontSize: 12 }}>Verifies the SMTP settings above with a live send to any address.</div>
            <div className="row gap-8" style={{ alignItems: 'center' }}>
              <input className="input" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" style={{ maxWidth: 300 }} />
              <button className="btn btn-secondary" onClick={sendTest} disabled={testBusy || !testTo.trim()}><Send size={14} />{testBusy ? 'Sending…' : 'Send test'}</button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

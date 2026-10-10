import { useState } from 'react'
import { Eye, EyeOff, LogIn, ShieldCheck, Zap, Wrench } from 'lucide-react'
import { useApp, ROLES, toast } from '../store/useApp'
import { api } from '../lib/api'
import { Field, ToastRegion } from '../components/ui'
import Logo from '../components/layout/Logo'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function ForgotPasswordLink({ email }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div style={{ textAlign: 'center' }}>
        <button type="button" onClick={() => setOpen(true)} className="btn btn-link xs" style={{ color: 'var(--text-3)' }}>
          Forgot password?
        </button>
      </div>
      {open && <ForgotPasswordModal initialEmail={email} onClose={() => setOpen(false)} />}
    </>
  )
}

function ForgotPasswordModal({ initialEmail, onClose }) {
  const [email, setEmail] = useState(initialEmail || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')

  const submit = async (e) => {
    e?.preventDefault()
    setErr(''); setSuccess('')
    const addr = email.trim().toLowerCase()
    if (!EMAIL_RE.test(addr)) { setErr('Enter a valid email address.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/password-reset/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr, kind: 'shop' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(body?.error || 'That email is not registered. Check the address and try again.')
        return
      }
      setSuccess(body?.message || 'A reset link has been sent to ' + addr + '.')
    } catch { setErr('Could not reach the server. Please try again.') }
    finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 400, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Reset your password</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          Enter your shop account email. If it's in our system we'll send you a link to reset your password.
        </div>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>Email address</div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus
            placeholder="you@yourshop.com"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }} />
        </label>
        {err && <div style={{ padding: 10, background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 6, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        {success && <div style={{ padding: 10, background: '#dcfce7', border: '1px solid #86efac', color: '#065f46', borderRadius: 6, fontSize: 13, marginBottom: 10 }}>{success}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">{success ? 'Close' : 'Cancel'}</button>
          {!success && (
            <button type="submit" disabled={busy || !email.trim()} className="btn btn-primary">
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

export default function Login() {
  const login = useApp((s) => s.login)
  const [mode, setMode] = useState('shop') // 'shop' = real company_owners login; 'demo' = legacy demo-tenant login
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'technician' })
  const [touched, setTouched] = useState({})
  const [show, setShow] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverErr, setServerErr] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaCode, setMfaCode] = useState('')

  const signIn = async (payload, extra = {}) => {
    setBusy(true)
    setServerErr('')
    try {
      const res = await api('/auth/login', { method: 'POST', body: payload })
      login({ ...res.user, ...extra, token: res.token, permissions: res.permissions, since: Date.now() })
      toast.success(`Welcome, ${res.user.name.split(' ')[0]}`, 'You are signed in.')
    } catch (e) {
      setServerErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Real shop-tenant sign-in: email + password against company_owners,
  // Argon2id-hashed. The token carries company_id so every subsequent API
  // call is scoped to that tenant.
  const signInShop = async () => {
    setBusy(true)
    setServerErr('')
    try {
      const res = await api('/auth/company-login', { method: 'POST', body: { email: form.email.trim(), password: form.password, mfaCode } })
      login({ ...res.user, token: res.token, permissions: res.permissions, since: Date.now() })
      setMfaRequired(false); setMfaCode('')
      toast.success(`Welcome, ${res.user.name.split(' ')[0]}`, 'You are signed in.')
    } catch (e) {
      if (e.mfaRequired) {
        setMfaRequired(true)
        setServerErr(e.message)
      } else {
        setServerErr(e.message)
      }
    } finally {
      setBusy(false)
    }
  }

  const errors = {
    name: !form.name.trim() ? 'Enter your name.' : '',
    email: !form.email ? 'Enter your email address.' : !EMAIL_RE.test(form.email) ? 'Enter a valid email, like tech@shop.com.' : '',
    password: form.password.length < 6 ? 'Password must be at least 6 characters.' : '',
  }
  const err = (k) => (touched[k] || submitted) && errors[k]
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const blur = (k) => () => setTouched({ ...touched, [k]: true })

  const submit = (e) => {
    e.preventDefault()
    setSubmitted(true)
    if (mode === 'shop') {
      // Only email + password needed for a real shop sign-in.
      if (!form.email || !EMAIL_RE.test(form.email) || !form.password) return
      signInShop()
      return
    }
    if (Object.values(errors).some(Boolean)) return
    signIn({ name: form.name.trim(), email: form.email.trim(), role: form.role }, { phone: '' })
  }

  const demo = () => {
    signIn({ name: 'Alex Morgan', email: 'alex.morgan@northsideauto.com', role: 'admin' }, { phone: '(410) 555-0199' })
  }

  return (
    <div className="login">
      <div className="login-aside">
        <div className="row gap-12">
          <Logo size={40} />
          <span className="brand-name" style={{ fontSize: 22, color: '#fff' }}>Torque<span style={{ color: 'var(--nav-accent)' }}>Desk</span></span>
        </div>
        <div className="stack gap-24 login-pitch">
          <h1>Repair information and shop workflow, built for the bay.</h1>
          <ul className="stack gap-16">
            <li><span className="icon-tile"><Zap size={18} /></span><div><strong>Find it fast.</strong> One search across procedures, DTCs, wiring and specs.</div></li>
            <li><span className="icon-tile"><Wrench size={18} /></span><div><strong>Step-by-step.</strong> Procedures with torque values, warnings and parts.</div></li>
            <li><span className="icon-tile"><ShieldCheck size={18} /></span><div><strong>Write it up.</strong> Estimates, repair orders and invoices in one flow.</div></li>
          </ul>
        </div>
        <p className="xs" style={{ color: '#6f7c8a' }}>Sample data for demonstration. Verify against OEM service information.</p>
      </div>

      <div className="login-main">
        <form className="login-card stack gap-16" onSubmit={submit} noValidate>
          <div>
            <h1>Sign in</h1>
            <p className="muted mt-4">
              {mode === 'shop'
                ? 'Shop account — email and password issued by your CuraNex administrator.'
                : 'Legacy demo mode — any name and role, no password required.'}
            </p>
          </div>

          <div className="row gap-8" style={{ padding: 2, background: 'rgba(127,127,127,0.08)', borderRadius: 10 }}>
            <button type="button" onClick={() => setMode('shop')} className="btn btn-block" style={{ background: mode === 'shop' ? 'var(--surface-raised, #fff)' : 'transparent', boxShadow: mode === 'shop' ? 'var(--shadow-sm)' : 'none', fontWeight: mode === 'shop' ? 600 : 400 }}>Shop sign-in</button>
            <button type="button" onClick={() => setMode('demo')} className="btn btn-block" style={{ background: mode === 'demo' ? 'var(--surface-raised, #fff)' : 'transparent', boxShadow: mode === 'demo' ? 'var(--shadow-sm)' : 'none', fontWeight: mode === 'demo' ? 600 : 400 }}>Demo mode</button>
          </div>

          {mode === 'demo' && (
            <Field label="Full name" required htmlFor="l-name" error={err('name')}>
              <input id="l-name" className={`input ${err('name') ? 'invalid' : ''}`} value={form.name} onChange={set('name')} onBlur={blur('name')} placeholder="Jordan Lee" autoComplete="name" />
            </Field>
          )}
          <Field label="Email" required htmlFor="l-email" error={err('email')}>
            <input id="l-email" type="email" className={`input ${err('email') ? 'invalid' : ''}`} value={form.email} onChange={set('email')} onBlur={blur('email')} placeholder={mode === 'shop' ? 'jane@yourshop.com' : 'tech@yourshop.com'} autoComplete="email" />
          </Field>
          <Field label="Password" required htmlFor="l-pass" error={mode === 'demo' ? err('password') : null}>
            <div className="input-wrap">
              <input id="l-pass" type={show ? 'text' : 'password'} className={`input ${(mode === 'demo' && err('password')) ? 'invalid' : ''}`} style={{ paddingLeft: 12, paddingRight: 44 }} value={form.password} onChange={set('password')} onBlur={blur('password')} placeholder="••••••••" autoComplete="current-password" />
              <button type="button" className="icon-btn sm" style={{ position: 'absolute', right: 4 }} onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </Field>
          {mode === 'demo' && (
            <Field label="Role" htmlFor="l-role" hint="Roles control permissions such as deleting documents and editing shop rates.">
              <select id="l-role" className="select" value={form.role} onChange={set('role')}>
                {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
              </select>
            </Field>
          )}
          {mode === 'shop' && mfaRequired && (
            <Field label="Authenticator code" required htmlFor="l-mfa" hint="6-digit code from your authenticator app.">
              <input id="l-mfa" className="input" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6} inputMode="numeric" placeholder="123456" autoFocus
                style={{ letterSpacing: 4, textAlign: 'center', fontSize: 18 }} />
            </Field>
          )}
          {serverErr && <div className="callout callout-danger" role="alert"><LogIn size={18} /><div>{serverErr}</div></div>}
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}><LogIn size={18} />{busy ? 'Signing in…' : 'Sign in'}</button>
          {mode === 'shop' && (
            <ForgotPasswordLink email={form.email} />
          )}
          {mode === 'demo' && (
            <>
              <div className="row gap-12" style={{ color: 'var(--text-3)' }}><div className="divider grow" /><span className="xs">or</span><div className="divider grow" /></div>
              <button className="btn btn-secondary btn-lg btn-block" type="button" onClick={demo} disabled={busy}>Continue with demo account</button>
            </>
          )}
        </form>
      </div>
      <ToastRegion />
    </div>
  )
}

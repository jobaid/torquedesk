import { useState } from 'react'
import { Eye, EyeOff, LogIn, ShieldCheck, Zap, Wrench } from 'lucide-react'
import { useApp, ROLES, toast } from '../store/useApp'
import { api } from '../lib/api'
import { Field, ToastRegion } from '../components/ui'
import Logo from '../components/layout/Logo'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function Login() {
  const login = useApp((s) => s.login)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'technician' })
  const [touched, setTouched] = useState({})
  const [show, setShow] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverErr, setServerErr] = useState('')

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
            <p className="muted mt-4">Use any email and a password of 6+ characters.</p>
          </div>
          <Field label="Full name" required htmlFor="l-name" error={err('name')}>
            <input id="l-name" className={`input ${err('name') ? 'invalid' : ''}`} value={form.name} onChange={set('name')} onBlur={blur('name')} placeholder="Jordan Lee" autoComplete="name" />
          </Field>
          <Field label="Email" required htmlFor="l-email" error={err('email')}>
            <input id="l-email" type="email" className={`input ${err('email') ? 'invalid' : ''}`} value={form.email} onChange={set('email')} onBlur={blur('email')} placeholder="tech@yourshop.com" autoComplete="email" />
          </Field>
          <Field label="Password" required htmlFor="l-pass" error={err('password')}>
            <div className="input-wrap">
              <input id="l-pass" type={show ? 'text' : 'password'} className={`input ${err('password') ? 'invalid' : ''}`} style={{ paddingLeft: 12, paddingRight: 44 }} value={form.password} onChange={set('password')} onBlur={blur('password')} placeholder="••••••••" autoComplete="current-password" />
              <button type="button" className="icon-btn sm" style={{ position: 'absolute', right: 4 }} onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </Field>
          <Field label="Role" htmlFor="l-role" hint="Roles control permissions such as deleting documents and editing shop rates.">
            <select id="l-role" className="select" value={form.role} onChange={set('role')}>
              {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
            </select>
          </Field>
          {serverErr && <div className="callout callout-danger" role="alert"><LogIn size={18} /><div>{serverErr}</div></div>}
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}><LogIn size={18} />{busy ? 'Signing in…' : 'Sign in'}</button>
          <div className="row gap-12" style={{ color: 'var(--text-3)' }}><div className="divider grow" /><span className="xs">or</span><div className="divider grow" /></div>
          <button className="btn btn-secondary btn-lg btn-block" type="button" onClick={demo} disabled={busy}>Continue with demo account</button>
        </form>
      </div>
      <ToastRegion />
    </div>
  )
}

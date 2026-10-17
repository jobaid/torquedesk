import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Check, Loader2, Eye, EyeOff, AlertCircle, ShieldCheck, Zap, CreditCard, Lock, Building2, Mail, Phone, MapPin, UserRound, KeyRound, ArrowRight } from 'lucide-react'
import Logo from '../components/layout/Logo'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Premium signup experience. Three-section form on the left, sticky plan
// summary on the right. New signups automatically appear in the SaaS owner's
// Companies list (status=pending until Stripe confirms payment).
export default function Signup() {
  const [params] = useSearchParams()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [planKey, setPlanKey] = useState(params.get('plan') || 'professional')
  const [cycle, setCycle] = useState(params.get('cycle') || 'monthly')
  const [cancelled] = useState(params.get('cancelled') === '1')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [fieldErrs, setFieldErrs] = useState({})
  const [show, setShow] = useState(false)
  const [form, setForm] = useState({
    businessName: '', businessEmail: '', businessPhone: '',
    street: '', city: '', state: '', zip: '', country: 'US',
    ownerFirstName: '', ownerLastName: '', ownerEmail: '', ownerPhone: '',
    password: '', passwordConfirm: '',
  })
  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    fetch('/api/public/signup/plans').then((r) => r.json()).then((d) => {
      setPlans(Array.isArray(d) ? d : [])
      if (d && !d.find((p) => p.key === planKey)) setPlanKey(d[0]?.key || '')
    }).finally(() => setLoading(false))
  }, [])

  const plan = plans.find((p) => p.key === planKey)

  const strength = passwordStrength(form.password)

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setFieldErrs({})
    const ve = {}
    if (!form.businessName.trim())                 ve['business.name']   = 'Enter your shop name.'
    if (!EMAIL_RE.test(form.businessEmail.trim())) ve['business.email']  = 'Enter a valid business email.'
    if (!EMAIL_RE.test(form.ownerEmail.trim()))    ve['owner.email']     = 'Enter a valid owner email.'
    if (!form.ownerFirstName.trim())               ve['owner.firstName'] = 'Enter the owner first name.'
    if (form.password.length < 8)                  ve['owner.password']  = 'At least 8 characters.'
    if (form.password !== form.passwordConfirm)    ve['owner.password']  = 'Passwords do not match.'
    if (Object.keys(ve).length) { setFieldErrs(ve); return }

    setBusy(true)
    try {
      const r = await fetch('/api/public/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: planKey, billingCycle: cycle,
          business: {
            name: form.businessName, email: form.businessEmail, phone: form.businessPhone,
            street: form.street, city: form.city, state: form.state, zip: form.zip, country: form.country,
          },
          owner: {
            firstName: form.ownerFirstName, lastName: form.ownerLastName,
            email: form.ownerEmail, phone: form.ownerPhone, password: form.password,
          },
        }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErr(body?.error || 'Signup failed.')
        if (body?.fields) setFieldErrs(body.fields)
        setBusy(false); return
      }
      if (body?.url) window.location.href = body.url
      else { setErr('Checkout URL missing.'); setBusy(false) }
    } catch (e) { setErr(e.message || 'Could not start signup.'); setBusy(false) }
  }

  if (loading) return (
    <div style={shellBg}>
      <TopBar />
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: 60, textAlign: 'center', color: '#6b7280' }}>
        <Loader2 className="spin" size={22} /> Loading plans…
      </div>
    </div>
  )

  return (
    <div style={shellBg}>
      <TopBar />
      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 20px 80px' }}>
        {/* Hero */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Create your Fixora shop account
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: 16, color: '#64748b' }}>
            Start a {plan?.trialDays || 7}-day free trial. No charge today — cancel anytime from Settings.
          </p>
        </div>

        {cancelled && (
          <div style={banner('amber')}>
            <AlertCircle size={16} /> You cancelled checkout — nothing was charged. Review your details and try again when you're ready.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
          {/* Form */}
          <form onSubmit={submit} style={{ display: 'grid', gap: 18 }}>
            {/* Shop info */}
            <section style={card}>
              <SectionHeader icon={<Building2 size={18} />} index={1} title="Shop information" sub="Tell us about your repair shop." />
              <div style={grid2}>
                <Input2 label="Shop name" required value={form.businessName} onChange={update('businessName')} err={fieldErrs['business.name']} placeholder="Mike's Auto Repair" />
                <Input2 label="Business email" required type="email" value={form.businessEmail} onChange={update('businessEmail')} err={fieldErrs['business.email']} placeholder="info@mikesauto.com" icon={<Mail size={14} />} />
                <Input2 label="Phone" type="tel" value={form.businessPhone} onChange={update('businessPhone')} placeholder="(555) 123-4567" icon={<Phone size={14} />} />
                <Input2 label="Country" value={form.country} onChange={update('country')} placeholder="US" />
                <Input2 label="Street" value={form.street} onChange={update('street')} placeholder="123 Main St" icon={<MapPin size={14} />} />
                <Input2 label="City" value={form.city} onChange={update('city')} placeholder="Austin" />
                <Input2 label="State" value={form.state} onChange={update('state')} placeholder="TX" />
                <Input2 label="ZIP" value={form.zip} onChange={update('zip')} placeholder="78701" />
              </div>
            </section>

            {/* Owner account */}
            <section style={card}>
              <SectionHeader icon={<UserRound size={18} />} index={2} title="Your account" sub="You'll use this email + password to sign in." />
              <div style={grid2}>
                <Input2 label="First name" required value={form.ownerFirstName} onChange={update('ownerFirstName')} err={fieldErrs['owner.firstName']} placeholder="Mike" />
                <Input2 label="Last name" value={form.ownerLastName} onChange={update('ownerLastName')} placeholder="Rodriguez" />
                <Input2 label="Your email (sign-in)" required type="email" value={form.ownerEmail} onChange={update('ownerEmail')} err={fieldErrs['owner.email']} placeholder="mike@mikesauto.com" icon={<Mail size={14} />} />
                <Input2 label="Phone" type="tel" value={form.ownerPhone} onChange={update('ownerPhone')} placeholder="(555) 987-6543" icon={<Phone size={14} />} />
                <Input2 label="Password" required type={show ? 'text' : 'password'} value={form.password} onChange={update('password')} err={fieldErrs['owner.password']} icon={<Lock size={14} />}
                  suffix={<button type="button" onClick={() => setShow((v) => !v)} style={eyeBtn}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>} />
                <Input2 label="Confirm password" required type={show ? 'text' : 'password'} value={form.passwordConfirm} onChange={update('passwordConfirm')} icon={<KeyRound size={14} />} />
              </div>
              {form.password && <PasswordMeter strength={strength} />}
            </section>

            {/* Trust strip */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: '14px 18px', background: '#eff6ff', borderRadius: 12, border: '1px solid #dbeafe', color: '#1e40af', fontSize: 13 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ShieldCheck size={14} /> Bank-grade encryption</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={14} /> {plan?.trialDays || 7}-day free trial</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CreditCard size={14} /> Cancel any time</span>
            </div>

            {err && <div style={banner('red')}><AlertCircle size={16} /> {err}</div>}

            <button type="submit" disabled={busy} style={ctaBtn(busy)}>
              {busy ? (<><Loader2 size={16} className="spin" /> Starting secure checkout…</>) : (<>Continue to Stripe — start free trial <ArrowRight size={16} /></>)}
            </button>
            <p style={{ margin: '-4px 0 0', fontSize: 12, color: '#64748b', textAlign: 'center' }}>
              After checkout, your trial starts immediately. No charge until the trial ends.
              By continuing you agree to our <Link to="/terms" style={{ color: '#2563eb' }}>Terms</Link> and <Link to="/privacy" style={{ color: '#2563eb' }}>Privacy Policy</Link>.
            </p>
          </form>

          {/* Plan summary (sticky on wide screens) */}
          <aside style={{ position: 'sticky', top: 20 }}>
            <PlanSummary plans={plans} planKey={planKey} setPlanKey={setPlanKey} cycle={cycle} setCycle={setCycle} />
            <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: '#64748b' }}>
              Already have an account? <Link to="/" style={{ color: '#2563eb', fontWeight: 600 }}>Sign in →</Link>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
      <style>{`
        .spin { animation: spin 1s linear infinite }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

const shellBg = { minHeight: '100vh', background: 'radial-gradient(ellipse at top, #eff6ff, transparent 60%), #f8fafc' }

function TopBar() {
  return (
    <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 20px', height: 64, display: 'flex', alignItems: 'center' }}>
        <Logo />
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b' }}>Create your Fixora account</div>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid #e5e7eb', background: '#fff' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '18px 20px', color: '#64748b', fontSize: 12, display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <span>© {new Date().getFullYear()} Fixora · Modern shop management for independent auto repair shops.</span>
        <span>
          <Link to="/terms" style={{ color: '#64748b', marginRight: 14 }}>Terms</Link>
          <Link to="/privacy" style={{ color: '#64748b' }}>Privacy</Link>
        </span>
      </div>
    </footer>
  )
}

function SectionHeader({ icon, index, title, sub }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#3c6dff,#2554f5)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 4px 10px rgba(37,84,245,.25)' }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 11, color: '#2554f5', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>Step {index}</div>
        <h2 style={{ margin: '2px 0 0', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{title}</h2>
        {sub && <div style={{ marginTop: 2, fontSize: 12.5, color: '#64748b' }}>{sub}</div>}
      </div>
    </div>
  )
}

const card = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 22,
  boxShadow: '0 1px 2px rgba(0,0,0,.03)',
}
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }

function Input2({ label, required, type = 'text', err, suffix, icon, ...rest }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#ef4444' }}>*</span>}
      </div>
      <div style={{ position: 'relative' }}>
        {icon && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>{icon}</span>}
        <input type={type} {...rest}
          style={{
            width: '100%', padding: icon ? '10px 10px 10px 32px' : '10px 12px',
            paddingRight: suffix ? 36 : undefined,
            background: '#fff',
            border: err ? '1px solid #ef4444' : '1px solid #cbd5e1',
            borderRadius: 10, fontSize: 14, outline: 'none',
            boxShadow: err ? '0 0 0 3px rgba(239,68,68,.1)' : undefined,
            transition: 'border-color .15s, box-shadow .15s',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => { if (!err) { e.target.style.borderColor = '#2554f5'; e.target.style.boxShadow = '0 0 0 3px rgba(37,84,245,.12)' } }}
          onBlur={(e) => { if (!err) { e.target.style.borderColor = '#cbd5e1'; e.target.style.boxShadow = 'none' } }} />
        {suffix && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>{suffix}</span>}
      </div>
      {err && <div style={{ marginTop: 4, fontSize: 11.5, color: '#dc2626' }}>{err}</div>}
    </label>
  )
}

const eyeBtn = { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 2, display: 'flex' }

function passwordStrength(p) {
  if (!p) return 0
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 12) s++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
  if (/\d/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  return Math.min(s, 4)
}
function PasswordMeter({ strength }) {
  const label = ['Too weak', 'Weak', 'OK', 'Strong', 'Excellent'][strength]
  const color = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#059669'][strength]
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < strength ? color : '#e5e7eb', transition: 'background .15s' }} />
        ))}
      </div>
      <div style={{ fontSize: 11, color }}>Password strength: <strong>{label}</strong></div>
    </div>
  )
}

function PlanSummary({ plans, planKey, setPlanKey, cycle, setCycle }) {
  const plan = plans.find((p) => p.key === planKey)
  const price = plan ? (cycle === 'annual' ? plan.annualPrice / 12 : plan.monthlyPrice) : 0
  const total = plan ? (cycle === 'annual' ? plan.annualPrice : plan.monthlyPrice) : 0

  return (
    <div style={{
      background: 'linear-gradient(165deg,#1e293b,#0f172a)', color: '#fff',
      borderRadius: 16, padding: 24, boxShadow: '0 20px 50px rgba(15,23,42,0.15)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#93c5fd', fontWeight: 700 }}>Your plan</div>
      <select value={planKey} onChange={(e) => setPlanKey(e.target.value)}
        style={{ marginTop: 6, width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, fontSize: 14, fontWeight: 600 }}>
        {plans.map((p) => <option key={p.key} value={p.key} style={{ color: '#111' }}>{p.name}</option>)}
      </select>
      <div style={{ marginTop: 14, display: 'inline-flex', padding: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 999, width: '100%' }}>
        <button type="button" onClick={() => setCycle('monthly')} style={cycleBtn(cycle === 'monthly')}>Monthly</button>
        <button type="button" onClick={() => setCycle('annual')}  style={cycleBtn(cycle === 'annual')}>Annual · save ~20%</button>
      </div>

      {plan && (
        <>
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em' }}>${price.toFixed(0)}</span>
            <span style={{ color: '#cbd5e1' }}>/mo</span>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{cycle === 'annual' ? `Billed $${total}/year` : 'Billed monthly'}</div>
          {plan.trialDays > 0 && (
            <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(34,197,94,0.15)', color: '#86efac', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Zap size={11} /> {plan.trialDays}-day free trial
            </div>
          )}
          {plan.tagline && <div style={{ marginTop: 14, fontSize: 13, color: '#cbd5e1' }}>{plan.tagline}</div>}
          <ul style={{ margin: '18px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {(plan.features || []).slice(0, 12).map((f) => (
              <li key={f} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#e2e8f0' }}>
                <Check size={14} color="#86efac" style={{ marginTop: 2, flexShrink: 0 }} />
                {f.replace(/_/g, ' ')}
              </li>
            ))}
            {plan.features?.length > 12 && (
              <li style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginLeft: 22 }}>
                + {plan.features.length - 12} more features
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  )
}

const cycleBtn = (active) => ({
  flex: 1, padding: '7px 12px', borderRadius: 999, border: 'none',
  background: active ? '#fff' : 'transparent',
  color: active ? '#0f172a' : '#cbd5e1',
  fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'background .15s',
})

const ctaBtn = (busy) => ({
  padding: '16px 24px', borderRadius: 12, border: 'none',
  background: busy ? '#94a3b8' : 'linear-gradient(90deg,#2554f5,#1d4fd9)', color: '#fff',
  fontSize: 16, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
  boxShadow: busy ? 'none' : '0 10px 25px rgba(37,84,245,.3)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  transition: 'filter .15s, box-shadow .15s',
})

function banner(kind) {
  const colors = {
    red:   { bg: '#fef2f2', border: '#fecaca', color: '#991b1b' },
    amber: { bg: '#fffbeb', border: '#fde68a', color: '#92400e' },
  }[kind] || { bg: '#f3f4f6', border: '#e5e7eb', color: '#374151' }
  return {
    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10,
    background: colors.bg, border: `1px solid ${colors.border}`, color: colors.color, fontSize: 13,
  }
}

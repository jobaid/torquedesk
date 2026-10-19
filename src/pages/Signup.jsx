import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Check, Loader2, Eye, EyeOff, AlertCircle, ShieldCheck, Zap, CreditCard, Lock, Building2, Mail, Phone, MapPin, UserRound, KeyRound, ArrowRight, Sparkles, Star } from 'lucide-react'
import Logo from '../components/layout/Logo'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Signup — mobile-first redesign. Plan picker is a row of visual cards
// (not a dropdown) that collapses to a single column on phones. The
// 2-column form+summary layout collapses the summary under the form on
// narrow screens so nothing is cut off.
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
    <div className="su-shell">
      <TopBar />
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '60px 20px', textAlign: 'center', color: '#6b7280' }}>
        <Loader2 className="spin" size={22} /> Loading plans…
      </div>
      <SignupStyles />
    </div>
  )

  return (
    <div className="su-shell">
      <TopBar />
      <main className="su-main">
        {/* Hero */}
        <div className="su-hero">
          <div className="su-chip"><Sparkles size={14} /> Start free · no credit card charges today</div>
          <h1>Launch your shop with Fixora</h1>
          <p>Everything you need — repair orders, invoices, customer management, and reports — in one modern app.</p>
        </div>

        {cancelled && (
          <div className="su-banner su-banner-amber">
            <AlertCircle size={16} /> You cancelled checkout — nothing was charged. Review and try again when you're ready.
          </div>
        )}

        {/* Plan picker (visual cards, not a dropdown) */}
        <div className="su-plans-head">
          <h2>Pick your plan</h2>
          <div className="su-cycle">
            <button type="button" className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
            <button type="button" className={cycle === 'annual' ? 'on' : ''} onClick={() => setCycle('annual')}>Annual <span className="su-save">save ~20%</span></button>
          </div>
        </div>
        <PlanCards plans={plans} planKey={planKey} setPlanKey={setPlanKey} cycle={cycle} />

        {/* Grid: form + sticky summary (collapses on mobile) */}
        <div className="su-grid">
          <form onSubmit={submit} className="su-form">
            <section className="su-card">
              <SectionHeader icon={<Building2 size={18} />} index={1} title="Shop information" sub="Tell us about your repair shop." />
              <div className="su-grid2">
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

            <section className="su-card">
              <SectionHeader icon={<UserRound size={18} />} index={2} title="Your account" sub="You'll use this email + password to sign in." />
              <div className="su-grid2">
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

            <div className="su-trust">
              <span><ShieldCheck size={14} /> Bank-grade encryption</span>
              <span><Zap size={14} /> {plan?.trialDays || 7}-day free trial</span>
              <span><CreditCard size={14} /> Cancel any time</span>
            </div>

            {err && <div className="su-banner su-banner-red"><AlertCircle size={16} /> {err}</div>}

            <button type="submit" disabled={busy} className="su-cta">
              {busy ? (<><Loader2 size={16} className="spin" /> Starting secure checkout…</>) : (<>Continue to Stripe — start free trial <ArrowRight size={16} /></>)}
            </button>
            <p className="su-fine">
              After checkout, your trial starts immediately. No charge until the trial ends.
              By continuing you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
            </p>
          </form>

          <aside className="su-aside">
            <PlanSummary plan={plan} cycle={cycle} />
            <div className="su-signin">
              Already have an account? <Link to="/">Sign in →</Link>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
      <SignupStyles />
    </div>
  )
}

// ---------------------------------------------------------------- Plan cards

function PlanCards({ plans, planKey, setPlanKey, cycle }) {
  // Heuristic for "most popular" tag — pick the middle plan if 3+, else none.
  const popularKey = plans.length >= 3 ? plans[Math.floor(plans.length / 2)]?.key : null
  return (
    <div className="su-plan-cards">
      {plans.map((p) => {
        const price = cycle === 'annual' ? p.annualPrice / 12 : p.monthlyPrice
        const annualTotal = p.annualPrice
        const selected = p.key === planKey
        const popular = p.key === popularKey
        return (
          <button
            type="button"
            key={p.key}
            onClick={() => setPlanKey(p.key)}
            className={`su-plan ${selected ? 'selected' : ''} ${popular ? 'popular' : ''}`}
            aria-pressed={selected}
          >
            {popular && <div className="su-plan-badge"><Star size={11} /> Most popular</div>}
            <div className="su-plan-name">{p.name}</div>
            {p.tagline && <div className="su-plan-tag">{p.tagline}</div>}
            <div className="su-plan-price">
              <span className="num">${price.toFixed(0)}</span>
              <span className="per">/mo</span>
            </div>
            <div className="su-plan-cycle">
              {cycle === 'annual' ? `$${annualTotal}/yr · billed yearly` : 'Billed monthly'}
            </div>
            {p.trialDays > 0 && (
              <div className="su-plan-trial"><Zap size={11} /> {p.trialDays}-day free trial</div>
            )}
            <ul className="su-plan-features">
              {(p.features || []).slice(0, 6).map((f) => (
                <li key={f}><Check size={13} /> {f.replace(/_/g, ' ')}</li>
              ))}
              {p.features?.length > 6 && (
                <li className="more">+ {p.features.length - 6} more</li>
              )}
            </ul>
            <div className={`su-plan-radio ${selected ? 'on' : ''}`}>
              {selected ? <><Check size={14} /> Selected</> : 'Choose this plan'}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------- Plan summary

function PlanSummary({ plan, cycle }) {
  if (!plan) return null
  const price = cycle === 'annual' ? plan.annualPrice / 12 : plan.monthlyPrice
  const total = cycle === 'annual' ? plan.annualPrice : plan.monthlyPrice
  return (
    <div className="su-summary">
      <div className="su-summary-head">Your plan</div>
      <div className="su-summary-name">{plan.name}</div>
      <div className="su-summary-price">
        <span className="num">${price.toFixed(0)}</span><span className="per">/mo</span>
      </div>
      <div className="su-summary-cycle">{cycle === 'annual' ? `Billed $${total}/year` : 'Billed monthly'}</div>
      {plan.trialDays > 0 && (
        <div className="su-summary-trial"><Zap size={12} /> {plan.trialDays}-day free trial</div>
      )}
      {plan.tagline && <div className="su-summary-tag">{plan.tagline}</div>}
      <ul className="su-summary-features">
        {(plan.features || []).slice(0, 8).map((f) => (
          <li key={f}><Check size={14} /> {f.replace(/_/g, ' ')}</li>
        ))}
        {plan.features?.length > 8 && <li className="more">+ {plan.features.length - 8} more</li>}
      </ul>
    </div>
  )
}

// ------------------------------------------------------------------ Chrome

function TopBar() {
  return (
    <header className="su-top">
      <div className="su-top-inner">
        <Logo />
        <div className="su-top-right">Create your Fixora account</div>
      </div>
    </header>
  )
}
function Footer() {
  return (
    <footer className="su-foot">
      <div className="su-foot-inner">
        <span>© {new Date().getFullYear()} Fixora · Modern shop management for independent auto repair shops.</span>
        <span>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </span>
      </div>
    </footer>
  )
}

function SectionHeader({ icon, index, title, sub }) {
  return (
    <div className="su-sec-head">
      <div className="su-sec-icon">{icon}</div>
      <div>
        <div className="su-sec-step">Step {index}</div>
        <h2>{title}</h2>
        {sub && <div className="su-sec-sub">{sub}</div>}
      </div>
    </div>
  )
}

function Input2({ label, required, type = 'text', err, suffix, icon, ...rest }) {
  return (
    <label className="su-field">
      <div className="su-field-label">
        {label}{required && <span className="req">*</span>}
      </div>
      <div className={`su-field-wrap ${err ? 'invalid' : ''}`}>
        {icon && <span className="su-field-icon">{icon}</span>}
        <input type={type} {...rest} />
        {suffix}
      </div>
      {err && <div className="su-field-err">{err}</div>}
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

// -------------------------------------------------------------------- Styles

function SignupStyles() {
  return (
    <style>{`
      .spin { animation: spin 1s linear infinite }
      @keyframes spin { to { transform: rotate(360deg) } }

      .su-shell { min-height:100vh; background:
        radial-gradient(ellipse at top, #eef2ff, transparent 60%),
        radial-gradient(ellipse at bottom right, #fff7ed, transparent 55%),
        #f8fafc;
        color:#0f172a; }
      .su-top { background:#fff; border-bottom:1px solid #e5e7eb; }
      .su-top-inner { max-width:1120px; margin:0 auto; padding:0 20px; height:64px; display:flex; align-items:center; }
      .su-top-right { margin-left:auto; font-size:13px; color:#64748b; }
      .su-main { max-width:1120px; margin:0 auto; padding:32px 20px 80px; }

      .su-hero { text-align:center; margin-bottom:28px; }
      .su-hero .su-chip {
        display:inline-flex; align-items:center; gap:6px;
        background:linear-gradient(90deg,#eff6ff,#f0f9ff); color:#1e40af;
        border:1px solid #c7d7fe; padding:6px 14px; border-radius:999px;
        font-size:12.5px; font-weight:600; margin-bottom:14px;
      }
      .su-hero h1 { margin:0; font-size:42px; font-weight:800; letter-spacing:-0.025em; line-height:1.08; color:#0f172a; }
      .su-hero p { margin:12px auto 0; font-size:16.5px; color:#475569; max-width:620px; line-height:1.5; }

      .su-banner { display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:10px; font-size:13px; margin-bottom:18px; }
      .su-banner-red { background:#fef2f2; border:1px solid #fecaca; color:#991b1b; }
      .su-banner-amber { background:#fffbeb; border:1px solid #fde68a; color:#92400e; }

      .su-plans-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:28px 0 14px; }
      .su-plans-head h2 { margin:0; font-size:22px; font-weight:700; letter-spacing:-0.01em; }
      .su-cycle { display:inline-flex; padding:3px; background:#eef2ff; border:1px solid #e0e7ff; border-radius:999px; }
      .su-cycle button { padding:7px 14px; border:none; background:transparent; color:#475569; font-weight:600; font-size:13px; cursor:pointer; border-radius:999px; display:inline-flex; align-items:center; gap:6px; }
      .su-cycle button.on { background:#fff; color:#0f172a; box-shadow:0 1px 3px rgba(0,0,0,.08); }
      .su-save { font-size:10.5px; font-weight:700; color:#059669; background:#d1fae5; padding:2px 8px; border-radius:999px; }

      .su-plan-cards { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; margin-bottom:28px; }
      .su-plan {
        text-align:left; cursor:pointer; background:#fff; border:2px solid #e5e7eb; border-radius:16px;
        padding:22px 20px; position:relative; transition:border-color .15s, box-shadow .15s, transform .15s;
        font: inherit; color:inherit;
      }
      .su-plan:hover { border-color:#cbd5e1; box-shadow:0 10px 25px rgba(15,23,42,.08); }
      .su-plan.selected { border-color:#2554f5; box-shadow:0 10px 30px rgba(37,84,245,.18); }
      .su-plan.popular { border-color:#f59e0b; }
      .su-plan.popular.selected { border-color:#2554f5; }
      .su-plan-badge {
        position:absolute; top:-11px; left:20px;
        background:linear-gradient(90deg,#f59e0b,#ea580c); color:#fff;
        padding:4px 10px; border-radius:999px; font-size:10.5px; font-weight:700;
        display:inline-flex; align-items:center; gap:4px; box-shadow:0 4px 10px rgba(245,158,11,.3);
      }
      .su-plan-name { font-size:19px; font-weight:800; letter-spacing:-0.01em; }
      .su-plan-tag { margin-top:2px; font-size:12.5px; color:#64748b; line-height:1.4; }
      .su-plan-price { display:flex; align-items:baseline; gap:4px; margin-top:14px; }
      .su-plan-price .num { font-size:38px; font-weight:800; letter-spacing:-0.03em; color:#0f172a; }
      .su-plan-price .per { font-size:14px; color:#64748b; }
      .su-plan-cycle { font-size:12px; color:#64748b; }
      .su-plan-trial { margin-top:10px; display:inline-flex; align-items:center; gap:5px; background:#ecfdf5; color:#047857; padding:3px 9px; border-radius:999px; font-size:11px; font-weight:700; }
      .su-plan-features { list-style:none; margin:14px 0 0; padding:0; display:grid; gap:7px; }
      .su-plan-features li { display:flex; gap:7px; align-items:flex-start; font-size:12.5px; color:#334155; line-height:1.4; }
      .su-plan-features li svg { color:#10b981; flex-shrink:0; margin-top:2px; }
      .su-plan-features li.more { font-style:italic; color:#94a3b8; font-size:12px; margin-left:20px; }
      .su-plan-radio {
        margin-top:16px; padding:10px 12px; text-align:center;
        border-radius:10px; border:1px solid #e5e7eb;
        font-size:13px; font-weight:600; color:#475569;
        display:flex; align-items:center; justify-content:center; gap:6px;
        transition:all .15s;
      }
      .su-plan-radio.on { background:#2554f5; color:#fff; border-color:#2554f5; }

      .su-grid { display:grid; grid-template-columns:1fr 360px; gap:24px; align-items:start; }
      .su-form { display:grid; gap:18px; }
      .su-card { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:22px; box-shadow:0 1px 2px rgba(0,0,0,.03); }
      .su-grid2 { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; }

      .su-sec-head { display:flex; gap:14px; align-items:flex-start; margin-bottom:14px; }
      .su-sec-icon { width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg,#3c6dff,#2554f5); color:#fff; display:grid; place-items:center; box-shadow:0 4px 10px rgba(37,84,245,.25); flex-shrink:0; }
      .su-sec-step { font-size:11px; color:#2554f5; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
      .su-sec-head h2 { margin:2px 0 0; font-size:17px; font-weight:700; color:#0f172a; }
      .su-sec-sub { margin-top:2px; font-size:12.5px; color:#64748b; }

      .su-field { display:block; }
      .su-field-label { display:flex; align-items:center; gap:4px; font-size:12.5px; font-weight:600; color:#334155; margin-bottom:6px; }
      .su-field-label .req { color:#ef4444; }
      .su-field-wrap {
        display:flex; align-items:center; gap:8px; background:#fff;
        border:1.5px solid #e5e7eb; border-radius:10px; padding:0 12px; min-height:42px;
        transition:border-color .15s, box-shadow .15s;
      }
      .su-field-wrap:focus-within { border-color:#2554f5; box-shadow:0 0 0 3px rgba(37,84,245,.12); }
      .su-field-wrap.invalid { border-color:#ef4444; }
      .su-field-icon { color:#94a3b8; display:flex; }
      .su-field input { flex:1; border:none; outline:none; background:transparent; font-size:14px; color:#0f172a; padding:10px 0; min-width:0; }
      .su-field-err { margin-top:5px; font-size:11.5px; color:#ef4444; }

      .su-trust { display:flex; flex-wrap:wrap; gap:16px 20px; padding:14px 18px; background:#eff6ff; border-radius:12px; border:1px solid #dbeafe; color:#1e40af; font-size:13px; }
      .su-trust span { display:flex; align-items:center; gap:6px; }

      .su-cta {
        padding:16px 24px; border-radius:12px; border:none;
        background:linear-gradient(90deg,#2554f5,#1d4fd9); color:#fff;
        font-size:16px; font-weight:700; cursor:pointer;
        box-shadow:0 10px 25px rgba(37,84,245,.3);
        display:flex; align-items:center; justify-content:center; gap:8px;
        transition:filter .15s, box-shadow .15s, transform .1s;
      }
      .su-cta:hover:not(:disabled) { filter:brightness(1.05); }
      .su-cta:active:not(:disabled) { transform:translateY(1px); }
      .su-cta:disabled { background:#94a3b8; box-shadow:none; cursor:wait; }
      .su-fine { margin:-4px 0 0; font-size:12px; color:#64748b; text-align:center; line-height:1.5; }
      .su-fine a { color:#2554f5; }

      .su-aside { position:sticky; top:20px; }
      .su-summary {
        background:linear-gradient(165deg,#1e293b,#0f172a); color:#fff;
        border-radius:16px; padding:22px; box-shadow:0 20px 50px rgba(15,23,42,0.15);
        border:1px solid rgba(255,255,255,0.08);
      }
      .su-summary-head { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#93c5fd; font-weight:700; }
      .su-summary-name { font-size:22px; font-weight:800; margin-top:4px; letter-spacing:-0.01em; }
      .su-summary-price { display:flex; align-items:baseline; gap:4px; margin-top:12px; }
      .su-summary-price .num { font-size:38px; font-weight:800; letter-spacing:-0.03em; }
      .su-summary-price .per { color:#cbd5e1; }
      .su-summary-cycle { font-size:12px; color:#94a3b8; }
      .su-summary-trial { margin-top:10px; display:inline-flex; align-items:center; gap:6px; background:rgba(34,197,94,0.15); color:#86efac; padding:5px 10px; border-radius:999px; font-size:11px; font-weight:700; }
      .su-summary-tag { margin-top:14px; font-size:13px; color:#cbd5e1; line-height:1.4; }
      .su-summary-features { list-style:none; margin:16px 0 0; padding:0; display:grid; gap:8px; }
      .su-summary-features li { display:flex; gap:8px; font-size:12.5px; color:#e2e8f0; }
      .su-summary-features li svg { color:#86efac; margin-top:2px; flex-shrink:0; }
      .su-summary-features li.more { font-style:italic; color:#94a3b8; font-size:11px; margin-left:22px; }
      .su-signin { margin-top:14px; text-align:center; font-size:12.5px; color:#64748b; }
      .su-signin a { color:#2554f5; font-weight:600; }

      .su-foot { border-top:1px solid #e5e7eb; background:#fff; }
      .su-foot-inner { max-width:1120px; margin:0 auto; padding:18px 20px; color:#64748b; font-size:12px; display:flex; gap:16px; flex-wrap:wrap; justify-content:space-between; }
      .su-foot-inner a { color:#64748b; margin-right:14px; }

      /* ---------- Mobile ---------- */
      @media (max-width: 900px) {
        .su-hero h1 { font-size:30px; }
        .su-hero p { font-size:15px; }
        .su-plans-head { flex-direction:column; align-items:stretch; gap:12px; }
        .su-plans-head h2 { text-align:center; }
        .su-cycle { align-self:center; }
        .su-grid { grid-template-columns:1fr; }
        .su-aside { position:static; }
      }
      @media (max-width: 560px) {
        .su-main { padding:20px 14px 60px; }
        .su-top-right { display:none; }
        .su-hero h1 { font-size:26px; }
        .su-hero p { font-size:14.5px; }
        .su-card { padding:18px; border-radius:12px; }
        .su-grid2 { grid-template-columns:1fr; }
        .su-plan { padding:18px 16px; }
        .su-plan-price .num { font-size:32px; }
        .su-cta { padding:14px 20px; font-size:15px; }
        .su-trust { font-size:12px; padding:12px 14px; }
        .su-foot-inner { flex-direction:column; gap:6px; text-align:center; }
      }
    `}</style>
  )
}

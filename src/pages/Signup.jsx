import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Check, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react'
import Logo from '../components/layout/Logo'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function Signup() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
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
      if (d && !d.find((p) => p.key === planKey)) setPlanKey(d[0]?.key || 'starter')
    }).finally(() => setLoading(false))
  }, [])

  const plan = plans.find((p) => p.key === planKey)

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
        setBusy(false)
        return
      }
      if (body?.url) {
        // Hand off to Stripe Checkout. User comes back to /signup/complete.
        window.location.href = body.url
      } else {
        setErr('Checkout URL missing from response.')
        setBusy(false)
      }
    } catch (e) {
      setErr(e.message || 'Could not start signup.')
      setBusy(false)
    }
  }

  if (loading) return <SignupShell><div className="flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={18} /> Loading plans…</div></SignupShell>

  return (
    <SignupShell>
      <div className="grid lg:grid-cols-[1fr_380px] gap-10">
        {/* Form */}
        <form onSubmit={submit} className="space-y-6">
          {cancelled && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
              You cancelled checkout — nothing was charged. Review your details and try again when you're ready.
            </div>
          )}
          <section className="card">
            <h2 className="section-title">Shop information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Shop name"     required value={form.businessName}  onChange={update('businessName')}  err={fieldErrs['business.name']} />
              <Field label="Business email" required type="email" value={form.businessEmail} onChange={update('businessEmail')} err={fieldErrs['business.email']} />
              <Field label="Phone"         type="tel" value={form.businessPhone} onChange={update('businessPhone')} />
              <Field label="Street"        value={form.street} onChange={update('street')} />
              <Field label="City"          value={form.city}  onChange={update('city')} />
              <Field label="State"         value={form.state} onChange={update('state')} />
              <Field label="ZIP"           value={form.zip}   onChange={update('zip')} />
              <Field label="Country"       value={form.country} onChange={update('country')} />
            </div>
          </section>

          <section className="card">
            <h2 className="section-title">Owner account</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="First name" required value={form.ownerFirstName} onChange={update('ownerFirstName')} err={fieldErrs['owner.firstName']} />
              <Field label="Last name"  value={form.ownerLastName} onChange={update('ownerLastName')} />
              <Field label="Email (your sign-in)" required type="email" value={form.ownerEmail} onChange={update('ownerEmail')} err={fieldErrs['owner.email']} />
              <Field label="Phone"      type="tel" value={form.ownerPhone} onChange={update('ownerPhone')} />
              <Field label="Password" required type={show ? 'text' : 'password'} value={form.password} onChange={update('password')} err={fieldErrs['owner.password']}
                suffix={<button type="button" onClick={() => setShow((v) => !v)} className="text-slate-500 hover:text-slate-800">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>} />
              <Field label="Confirm password" required type={show ? 'text' : 'password'} value={form.passwordConfirm} onChange={update('passwordConfirm')} />
            </div>
          </section>

          {err && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {err}
            </div>
          )}
          <button type="submit" disabled={busy}
            className="w-full px-5 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:brightness-110 disabled:opacity-50">
            {busy ? 'Starting checkout…' : `Continue to Stripe — start ${plan?.trialDays || 7}-day trial`}
          </button>
          <p className="text-xs text-slate-500 text-center">
            After checkout, your trial starts immediately. No charge until the trial ends. Cancel from your account any time.
          </p>
        </form>

        {/* Plan summary */}
        <aside className="space-y-4 lg:sticky lg:top-6 self-start">
          <div className="card">
            <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Your plan</div>
            <select value={planKey} onChange={(e) => setPlanKey(e.target.value)} className="mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold">
              {plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
            <div className="mt-3 flex items-center gap-1 p-1 bg-slate-100 rounded-full">
              <button type="button" onClick={() => setCycle('monthly')} className={`flex-1 px-3 py-1 rounded-full text-xs font-semibold ${cycle === 'monthly' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}>Monthly</button>
              <button type="button" onClick={() => setCycle('annual')}  className={`flex-1 px-3 py-1 rounded-full text-xs font-semibold ${cycle === 'annual'  ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}>Annual</button>
            </div>
            {plan && (
              <>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold">${cycle === 'annual' ? (plan.annualPrice / 12).toFixed(0) : plan.monthlyPrice}</span>
                  <span className="text-slate-500 text-sm">/mo</span>
                </div>
                <div className="text-xs text-slate-500">{cycle === 'annual' ? `Billed $${plan.annualPrice}/year` : 'Billed monthly'}</div>
                <div className="mt-1 text-xs font-semibold text-blue-600">{plan.trialDays}-day free trial</div>
                <ul className="mt-4 space-y-1.5 text-xs text-slate-700">
                  {(plan.features || []).slice(0, 10).map((f) => (
                    <li key={f} className="flex gap-1.5"><Check size={13} className="text-emerald-500 mt-0.5 flex-shrink-0" /> {f.replaceAll('_', ' ')}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="text-xs text-slate-500 px-2">
            Already have an account? <Link to="/" className="text-blue-600 font-semibold">Sign in</Link>
          </div>
        </aside>
      </div>
    </SignupShell>
  )
}

function SignupShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center">
          <Logo />
          <div className="ml-auto text-sm text-slate-500">Create your TorqueDesk account</div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-10">
        {children}
      </main>
      <style>{`
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; }
        .section-title { font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
      `}</style>
    </div>
  )
}

function Field({ label, required, err, suffix, type = 'text', ...rest }) {
  return (
    <label className="block">
      <div className="flex items-center gap-1 text-xs font-medium text-slate-700 mb-1">
        <span>{label}</span>
        {required && <span className="text-red-500">*</span>}
      </div>
      <div className="relative">
        <input type={type} {...rest}
          className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-1 outline-none ${err ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'}`} />
        {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2">{suffix}</span>}
      </div>
      {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
    </label>
  )
}

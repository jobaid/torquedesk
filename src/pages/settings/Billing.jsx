import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Receipt, CreditCard, ExternalLink, AlertCircle, CalendarClock, Loader2, Check, RefreshCw } from 'lucide-react'
import { SectionHead } from './kit'
import { api } from '../../lib/api'
import { toast } from '../../store/useApp'

// Shop-side billing self-service. Shows the current plan + trial / renewal
// dates, and opens the Stripe Customer Portal in a new tab so the manager
// can update their card, change plan, download invoices, or cancel.

export function Billing() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [plans, setPlans] = useState([])
  const [showPlanPicker, setShowPlanPicker] = useState(false)

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const [d, p] = await Promise.all([
        api('/me/billing'),
        api('/public/signup/plans').catch(() => []),
      ])
      setData(d); setPlans(p || [])
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Handle Stripe return after setup — poll sync until the row is linked.
  useEffect(() => {
    const result = params.get('setup')
    const session = params.get('session')
    if (!result) return
    if (result === 'cancel') {
      toast.warning('Setup cancelled', 'No charge was made.')
      setParams({}, { replace: true })
      return
    }
    if (result !== 'success' || !session) return
    let tries = 0
    const sync = async () => {
      tries++
      try {
        const r = await api(`/me/billing/setup/sync/${encodeURIComponent(session)}`, { method: 'POST', body: {} })
        if (r?.ready) {
          toast.success('Billing linked', 'You can now manage your subscription from here.')
          setParams({}, { replace: true })
          load()
          return
        }
      } catch { /* retry */ }
      if (tries < 10) setTimeout(sync, 2000)
    }
    sync()
  }, [params])

  const openPortal = async () => {
    setBusy(true)
    try {
      const r = await api('/me/billing/portal', { method: 'POST', body: {} })
      if (r?.url) window.open(r.url, '_blank', 'noopener')
      else throw new Error('No portal URL returned.')
    } catch (e) { toast.error('Could not open billing portal', e.message) }
    finally { setBusy(false) }
  }

  const startSetup = async (plan, cycle) => {
    setBusy(true)
    try {
      const r = await api('/me/billing/setup', { method: 'POST', body: { plan, billingCycle: cycle } })
      if (r?.url) window.location.href = r.url
      else throw new Error('No checkout URL returned.')
    } catch (e) { toast.error('Could not start setup', e.message); setBusy(false) }
  }

  if (loading) return <div><SectionHead title="Billing" /><div className="muted">Loading…</div></div>
  if (err) return <div><SectionHead title="Billing" /><div className="callout callout-danger"><AlertCircle size={18} /><div>{err}</div></div></div>
  if (!data) return null

  const statusColors = {
    trial:     { bg: '#dbeafe', fg: '#1e40af', label: 'Trial' },
    active:    { bg: '#dcfce7', fg: '#065f46', label: 'Active' },
    pending:   { bg: '#fef3c7', fg: '#92400e', label: 'Pending' },
    suspended: { bg: '#fef3c7', fg: '#92400e', label: 'Suspended' },
    expired:   { bg: '#fee2e2', fg: '#991b1b', label: 'Expired' },
    cancelled: { bg: '#f3f4f6', fg: '#374151', label: 'Cancelled' },
  }
  const sc = statusColors[data.status] || { bg: '#f3f4f6', fg: '#374151', label: data.status }

  return (
    <div>
      <SectionHead
        title="Billing"
        description="Your subscription, trial status, and how to update your card or change your plan."
      />
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <StatCard icon={<CreditCard size={18} />} label="Current plan"
          value={<span style={{ textTransform: 'capitalize' }}>{data.plan}</span>}
          sub={<span style={{ padding: '2px 10px', borderRadius: 999, background: sc.bg, color: sc.fg, fontSize: 11, fontWeight: 700 }}>{sc.label}</span>} />
        <StatCard icon={<Receipt size={18} />} label="Price"
          value={`$${data.billingCycle === 'annual' ? data.annualPrice : data.monthlyPrice}`}
          sub={data.billingCycle === 'annual' ? `Billed annually` : `Billed monthly`} />
        <StatCard icon={<CalendarClock size={18} />}
          label={data.status === 'trial' ? 'Trial ends' : 'Renews on'}
          value={data.status === 'trial' ? (data.trialEnd || '—') : (data.endDate || '—')}
          sub={data.autoRenewal ? 'Auto-renew is on' : 'Auto-renew is off'} />
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Manage your subscription</h2>
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Change your plan, update your payment method, download invoices, or cancel — all through our secure Stripe portal.
          The portal opens in a new tab.
        </div>
        {!data.hasStripeCustomer ? (
          <SetupSection data={data} plans={plans} busy={busy} onStart={startSetup}
            open={showPlanPicker} setOpen={setShowPlanPicker} />
        ) : (
          <div className="row gap-8" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={openPortal} disabled={busy}>
              {busy ? <><Loader2 size={14} className="spin" /> Opening…</> : <><ExternalLink size={14} /> Open billing portal</>}
            </button>
            <button className="btn btn-secondary" onClick={load}><RefreshCw size={14} /> Refresh</button>
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Add-on subscriptions</h3>
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Individual features you've subscribed to live under{' '}
          <a href="/settings/general/addons" style={{ color: '#2563eb', fontWeight: 600 }}>Settings → Add-ons</a>.
        </div>
      </div>
    </div>
  )
}

// SetupSection shows up when the shop has no Stripe customer linked yet
// (manually-activated accounts). Picks a plan + cycle and redirects to a
// Stripe Checkout that attaches a real Stripe customer + subscription, so
// after return the shop can pay, enable auto-pay, add/update bank info,
// cancel, and change plan through the portal.
function SetupSection({ data, plans, busy, onStart, open, setOpen }) {
  const [plan, setPlan] = useState(data.plan || 'professional')
  const [cycle, setCycle] = useState(data.billingCycle || 'monthly')
  const selected = plans.find((p) => p.key === plan)

  return (
    <>
      <div className="callout" style={{ marginTop: 12, background: '#fffbeb', border: '1px solid #fde68a' }}>
        <AlertCircle size={16} />
        <div>
          Your shop isn't connected to Stripe for self-service billing yet.
          Set it up now with a <strong>credit card or ACH bank account</strong> to
          pay dues, enable auto-pay, change plan, download invoices, or update your
          card / bank — all without emailing support.
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={() => setOpen((v) => !v)} disabled={busy}>
          <CreditCard size={14} /> {open ? 'Hide setup' : 'Set up Stripe billing'}
        </button>
      </div>

      {open && (
        <div className="card" style={{ marginTop: 14, padding: 16, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>
            Choose a plan + billing cycle. You'll be redirected to Stripe to enter your card.
            Nothing is charged until you confirm, and you can change the plan later from the Billing portal.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {plans.map((p) => (
              <label key={p.key}
                style={{ padding: 12, borderRadius: 10, border: '1px solid ' + (plan === p.key ? '#2563eb' : '#e5e7eb'),
                         background: plan === p.key ? '#eff6ff' : '#fff', cursor: 'pointer' }}>
                <input type="radio" name="plan" value={p.key} checked={plan === p.key}
                  onChange={() => setPlan(p.key)} style={{ display: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700 }}>{p.name}</span>
                  {plan === p.key && <Check size={14} color="#2563eb" />}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>${cycle === 'annual' ? (p.annualPrice / 12).toFixed(0) : p.monthlyPrice}
                  <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>/mo</span>
                </div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{cycle === 'annual' ? `Billed $${p.annualPrice}/year` : 'Billed monthly'}</div>
              </label>
            ))}
          </div>

          <div style={{ display: 'inline-flex', gap: 4, marginTop: 12, padding: 3, background: '#e5e7eb', borderRadius: 999 }}>
            <button type="button" onClick={() => setCycle('monthly')}
              style={{ padding: '5px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: cycle === 'monthly' ? '#fff' : 'transparent', color: cycle === 'monthly' ? '#111' : '#6b7280' }}>Monthly</button>
            <button type="button" onClick={() => setCycle('annual')}
              style={{ padding: '5px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: cycle === 'annual' ? '#fff' : 'transparent', color: cycle === 'annual' ? '#111' : '#6b7280' }}>Annual — save ~20%</button>
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" disabled={busy || !selected} onClick={() => onStart(plan, cycle)}>
              {busy ? <><Loader2 size={14} className="spin" /> Redirecting…</> : <><ExternalLink size={14} /> Continue to Stripe</>}
            </button>
            <span style={{ fontSize: 11, color: '#6b7280' }}>Secure checkout — pay by card or US bank account (ACH). Card / bank details never touch TorqueDesk.</span>
          </div>
        </div>
      )}
    </>
  )
}

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="card card-pad">
      <div className="row gap-6" style={{ alignItems: 'center', color: '#6b7280' }}>
        {icon}<span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

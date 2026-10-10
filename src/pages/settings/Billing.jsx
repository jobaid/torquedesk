import { useEffect, useState } from 'react'
import { Receipt, CreditCard, ExternalLink, AlertCircle, CalendarClock, Loader2 } from 'lucide-react'
import { SectionHead } from './kit'
import { api } from '../../lib/api'
import { toast } from '../../store/useApp'

// Shop-side billing self-service. Shows the current plan + trial / renewal
// dates, and opens the Stripe Customer Portal in a new tab so the manager
// can update their card, change plan, download invoices, or cancel.

export function Billing() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true); setErr('')
    try { setData(await api('/me/billing')) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const openPortal = async () => {
    setBusy(true)
    try {
      const r = await api('/me/billing/portal', { method: 'POST', body: {} })
      if (r?.url) window.open(r.url, '_blank', 'noopener')
      else throw new Error('No portal URL returned.')
    } catch (e) { toast.error('Could not open billing portal', e.message) }
    finally { setBusy(false) }
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
        {!data.hasStripeCustomer && (
          <div className="callout" style={{ marginTop: 12, background: '#fef3c7', border: '1px solid #fde68a' }}>
            <AlertCircle size={16} />
            <div>
              Your account was activated manually and doesn't have a self-service Stripe profile yet.
              Contact support and we'll link it so you can manage billing from here.
            </div>
          </div>
        )}
        <div className="row gap-8" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={openPortal} disabled={busy || !data.hasStripeCustomer}>
            {busy ? <><Loader2 size={14} className="spin" /> Opening…</> : <><ExternalLink size={14} /> Open billing portal</>}
          </button>
          <button className="btn btn-secondary" onClick={load}>Refresh</button>
        </div>
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

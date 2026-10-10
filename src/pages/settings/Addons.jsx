import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Package, Check, X, Clock, CreditCard, ExternalLink } from 'lucide-react'
import { SectionHead } from './kit'
import { api } from '../../lib/api'
import { toast } from '../../store/useApp'

// Shop-side Add-ons marketplace. Lists published add-ons from the SaaS
// owner, shows a Subscribe button on inactive ones (opens Stripe Checkout
// in subscription mode with a trial period), and Cancel on active ones.

export function Addons() {
  const [params] = useSearchParams()
  const [data, setData] = useState({ catalog: [], subscriptions: {} })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')

  const load = async () => {
    setLoading(true)
    try { setData(await api('/addons')) }
    catch (e) { toast.error('Could not load add-ons', e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Pick up Stripe Checkout success/cancel redirects. On success, actively
  // ask the server to verify with Stripe (self-heals the subscription row
  // even when the webhook is unreachable) and refresh the list.
  useEffect(() => {
    const result = params.get('result')
    const feature = params.get('feature')
    if (result === 'cancel') { toast.warning('Checkout cancelled', 'No charge was made.'); return }
    if (result !== 'success' || !feature) return
    let tries = 0
    const sync = async () => {
      tries++
      try {
        const r = await api(`/addons/${encodeURIComponent(feature)}/sync`, { method: 'POST', body: {} })
        if (r?.activated) { toast.success('Subscription active', `${feature} is now enabled.`); load(); return }
        if (tries < 5) setTimeout(sync, 2000)
      } catch (e) {
        if (tries < 5) setTimeout(sync, 2000)
      }
    }
    sync()
  }, [params])

  const subscribe = async (key) => {
    setBusy(key)
    try {
      const r = await api(`/addons/${encodeURIComponent(key)}/subscribe`, { method: 'POST', body: {} })
      if (r?.url) window.location.href = r.url
      else throw new Error('No checkout URL returned.')
    } catch (e) { toast.error('Could not start checkout', e.message); setBusy('') }
  }

  const cancel = async (key) => {
    if (!confirm('Cancel this add-on? You keep access until the end of the current billing period.')) return
    setBusy(key)
    try {
      await api(`/addons/${encodeURIComponent(key)}/cancel`, { method: 'POST', body: {} })
      toast.success('Cancellation scheduled', 'You keep access until the end of the current period.')
      load()
    } catch (e) { toast.error('Could not cancel', e.message) }
    finally { setBusy('') }
  }

  return (
    <div>
      <SectionHead
        title="Add-ons"
        description="Subscribe to extra features. First charge is after the free trial — cancel any time."
      />
      {loading ? <div className="muted">Loading…</div> : data.catalog.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No add-ons are available right now.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {data.catalog.map((a) => {
            const sub = data.subscriptions[a.featureKey]
            const active = sub && ['trialing', 'active', 'past_due'].includes(sub.status)
            return (
              <div key={a.id} style={{ background: '#fff', border: '1px solid ' + (active ? '#86efac' : '#e5e7eb'), borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f9fafb', display: 'grid', placeItems: 'center' }}>
                    <Package size={20} color="#2563eb" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em' }}>{a.featureKey}</div>
                  </div>
                  {active && <span style={pill('ok')}><Check size={11} /> {sub.status === 'trialing' ? 'Trial' : 'Active'}</span>}
                </div>
                {a.description && <div style={{ fontSize: 12.5, color: '#4b5563', lineHeight: 1.45 }}>{a.description}</div>}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: '#111' }}>${a.monthlyPrice}</span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>/month</span>
                  {a.trialDays > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#2563eb', fontWeight: 600 }}><Clock size={11} /> {a.trialDays}-day free trial</span>}
                </div>
                {active ? (
                  <div style={{ fontSize: 11, color: '#065f46' }}>
                    {sub.cancelAtPeriodEnd ? (
                      <>Access ends on {sub.currentPeriodEnd?.slice(0, 10)}.</>
                    ) : sub.status === 'trialing' && sub.trialEnd ? (
                      <>Trial ends on {sub.trialEnd?.slice(0, 10)}, then ${a.monthlyPrice}/mo.</>
                    ) : sub.currentPeriodEnd ? (
                      <>Renews on {sub.currentPeriodEnd?.slice(0, 10)}.</>
                    ) : null}
                  </div>
                ) : null}
                <div style={{ marginTop: 'auto', paddingTop: 4 }}>
                  {active ? (
                    sub.cancelAtPeriodEnd ? (
                      <button className="btn btn-primary" onClick={() => subscribe(a.featureKey)} disabled={!!busy}>
                        <CreditCard size={14} />{busy === a.featureKey ? 'Redirecting…' : 'Resubscribe'}
                      </button>
                    ) : (
                      <button className="btn btn-secondary" onClick={() => cancel(a.featureKey)} disabled={busy === a.featureKey} style={{ color: '#991b1b', fontSize: 12 }}>
                        <X size={13} /> Cancel subscription
                      </button>
                    )
                  ) : (
                    <button className="btn btn-primary" onClick={() => subscribe(a.featureKey)} disabled={!!busy}>
                      <CreditCard size={14} />{busy === a.featureKey ? 'Redirecting…' : 'Subscribe'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const pill = (kind) => ({
  padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: kind === 'ok' ? '#dcfce7' : '#f3f4f6',
  color: kind === 'ok' ? '#065f46' : '#374151',
})

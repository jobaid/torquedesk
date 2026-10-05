import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Loader2, Receipt } from 'lucide-react'
import Logo from '../components/layout/Logo'

// Public landing page the customer's browser hits after Stripe Checkout.
// Lives OUTSIDE normal app auth — a customer doesn't have a TorqueDesk login.
// It never shows document/customer details; just a yes/no acknowledgement.
// The authoritative state change happens inside the webhook — this page polls
// our status endpoint so if the webhook takes a moment, the message updates.

export default function PayReturn({ outcome }) {
  const params = new URLSearchParams(window.location.search)
  const intentId = params.get('intent')
  const [status, setStatus] = useState('loading')
  const [amount, setAmount] = useState(null)
  const [currency, setCurrency] = useState('USD')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!intentId) { setErr('Missing payment reference.'); setStatus('error'); return }
    let alive = true
    const tick = async () => {
      try {
        const res = await fetch(`/api/pay/status/${encodeURIComponent(intentId)}`)
        if (!alive) return
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not look up this payment.')
        const data = await res.json()
        setStatus(data.status || 'pending')
        setAmount(data.amount)
        setCurrency((data.currency || 'USD').toUpperCase())
      } catch (e) {
        if (alive) { setErr(e.message); setStatus('error') }
      }
    }
    tick()
    // Keep polling until it lands in a terminal state. Webhook usually arrives
    // within a second but Stripe can take longer under load.
    const id = setInterval(() => {
      if (status === 'succeeded' || status === 'failed' || status === 'error') return
      tick()
    }, 3000)
    return () => { alive = false; clearInterval(id) }
  }, [intentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopPolling = status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'error'
  const effective = outcome === 'cancel' && !stopPolling ? 'cancelled' : status

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Logo size={32} />
          <span style={{ fontWeight: 700, fontSize: 18 }}>TorqueDesk</span>
        </div>
        {effective === 'succeeded' ? (
          <>
            <div style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <CheckCircle2 size={28} /><span style={{ fontSize: 20, fontWeight: 600 }}>Thank you — payment received!</span>
            </div>
            <p style={{ color: '#4b5563', marginTop: 0 }}>
              Your shop has been notified. You can close this page.
            </p>
            {amount != null && (
              <div style={{ marginTop: 16, padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Receipt size={16} color="#059669" />
                <span><strong>{currency} {Number(amount).toFixed(2)}</strong> was charged to your card.</span>
              </div>
            )}
          </>
        ) : effective === 'cancelled' || outcome === 'cancel' ? (
          <>
            <div style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <XCircle size={28} /><span style={{ fontSize: 20, fontWeight: 600 }}>Payment cancelled</span>
            </div>
            <p style={{ color: '#4b5563', marginTop: 0 }}>
              Nothing was charged. If this was a mistake, open the payment link again or ask your shop to resend it.
            </p>
          </>
        ) : effective === 'failed' || effective === 'error' ? (
          <>
            <div style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <XCircle size={28} /><span style={{ fontSize: 20, fontWeight: 600 }}>We couldn't confirm this payment</span>
            </div>
            <p style={{ color: '#4b5563', marginTop: 0 }}>
              {err || 'Please contact your shop to confirm whether the charge went through.'}
            </p>
          </>
        ) : (
          <>
            <div style={{ color: '#2563eb', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Loader2 size={28} className="spin" />
              <span style={{ fontSize: 20, fontWeight: 600 }}>Confirming your payment…</span>
            </div>
            <p style={{ color: '#4b5563', marginTop: 0 }}>
              This usually takes a second. You can leave this page open or close it — your shop will see the payment either way.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

const shellStyle = {
  minHeight: '100vh',
  display: 'grid', placeItems: 'center',
  background: 'linear-gradient(180deg, #f8fafc, #e2e8f0)',
  fontFamily: 'Inter, system-ui, sans-serif',
  padding: 16,
}
const cardStyle = {
  background: '#fff', borderRadius: 14, padding: 28,
  maxWidth: 480, width: '100%',
  boxShadow: '0 10px 30px rgba(2,6,23,0.12)',
  border: '1px solid #e2e8f0',
}

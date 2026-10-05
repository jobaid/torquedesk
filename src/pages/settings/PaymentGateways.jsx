import { useEffect, useState } from 'react'
import { CreditCard, CheckCircle2, AlertCircle, KeyRound, RefreshCw, Save, Trash2 } from 'lucide-react'
import { SectionHead } from './kit'
import { api } from '../../lib/api'
import { toast } from '../../store/useApp'

// Shop-side payment-gateway settings. Session 1: enter the shop's own Stripe
// or Authorize.Net credentials, verify, enable/disable. No actual charges
// happen yet — those arrive in a later session once this works end to end.

const PROVIDERS = [
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Collect card payments from your customers through Stripe Checkout. Enter the keys from your Stripe dashboard.',
    publishableLabel: 'Publishable key',
    publishableHint: 'Starts with pk_test_ or pk_live_',
    secretLabel: 'Secret key',
    secretHint: 'Starts with sk_test_ or sk_live_ — never share this.',
    webhookLabel: 'Webhook signing secret (optional)',
    webhookHint: 'Starts with whsec_. Required later when webhooks are wired; safe to leave blank for now.',
  },
  {
    id: 'authnet',
    name: 'Authorize.Net',
    description: 'Collect card payments through the Authorize.Net Hosted Payment Form. Enter the credentials from your merchant account.',
    publishableLabel: 'API Login ID',
    publishableHint: 'From Account → Settings → API Credentials & Keys.',
    secretLabel: 'Transaction Key',
    secretHint: 'From the same screen. Never share this.',
    webhookLabel: 'Signature Key (optional)',
    webhookHint: 'For webhook signature verification. Leave blank for now.',
  },
]

export function PaymentGateways() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const data = await api('/settings/payment-gateways')
      setRows(data || [])
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <SectionHead
        title="Payment Gateways"
        description="Connect your Stripe or Authorize.Net account so you can take card payments from your customers. Your secret keys are encrypted at rest and never shown to anyone (including you) after you save them."
        perm="shop.edit"
      />
      {err && <div className="callout callout-danger" role="alert"><AlertCircle size={18} /><div>{err}</div></div>}
      <div className="stack gap-20">
        {PROVIDERS.map((p) => (
          <GatewayCard
            key={p.id}
            provider={p}
            row={rows.find((r) => r.provider === p.id)}
            loading={loading}
            onChanged={load}
          />
        ))}
      </div>
    </div>
  )
}

function GatewayCard({ provider, row, loading, onChanged }) {
  const [mode, setMode] = useState('test')
  const [displayName, setDisplayName] = useState('')
  const [publishableKey, setPublishableKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [clearWebhook, setClearWebhook] = useState(false)
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [err, setErr] = useState('')
  const [fields, setFields] = useState({})

  useEffect(() => {
    if (!row) return
    setMode(row.mode || 'test')
    setDisplayName(row.displayName || '')
    setPublishableKey(row.publishableKey || '')
    setActive(row.active)
  }, [row?.updatedAt])

  const save = async () => {
    setBusy(true); setErr(''); setFields({})
    try {
      await api(`/settings/payment-gateways/${provider.id}`, {
        method: 'PUT',
        body: {
          mode, displayName, publishableKey,
          secretKey, webhookSecret,
          clearWebhook, active,
        },
      })
      setSecretKey(''); setWebhookSecret(''); setClearWebhook(false)
      toast.success(`${provider.name} saved`, 'Keys stored encrypted.')
      onChanged()
    } catch (e) {
      setErr(e.message); setFields(e.fields || {})
    } finally { setBusy(false) }
  }

  const verify = async () => {
    setVerifyBusy(true); setErr('')
    try {
      const res = await api(`/settings/payment-gateways/${provider.id}/verify`, { method: 'POST' })
      if (res.verifiedAt) toast.success(`${provider.name} verified`, 'The credentials work.')
      else toast.error(`${provider.name} failed`, res.verificationError || 'Verification failed.')
      onChanged()
    } catch (e) {
      setErr(e.message)
    } finally { setVerifyBusy(false) }
  }

  const remove = async () => {
    if (!confirm(`Remove the saved ${provider.name} credentials? Your customers will no longer be able to pay through ${provider.name}.`)) return
    setBusy(true); setErr('')
    try {
      await api(`/settings/payment-gateways/${provider.id}`, { method: 'DELETE' })
      setMode('test'); setDisplayName(''); setPublishableKey('')
      setSecretKey(''); setWebhookSecret(''); setActive(false)
      toast.success(`${provider.name} removed`)
      onChanged()
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const hasSecret = row?.hasSecret
  const verified = !!row?.verifiedAt
  const verifyErr = row?.verificationError

  return (
    <section className="card" style={{ padding: 20 }}>
      <header className="row gap-12 wrap" style={{ alignItems: 'flex-start', marginBottom: 16 }}>
        <div className="icon-tile" style={{ background: provider.id === 'stripe' ? '#635bff' : '#2563eb', color: '#fff' }}>
          <CreditCard size={20} />
        </div>
        <div className="grow">
          <h2 style={{ margin: 0, fontSize: 17 }}>{provider.name}</h2>
          <p className="muted mt-4" style={{ fontSize: 13 }}>{provider.description}</p>
        </div>
        <div className="row gap-8" style={{ alignItems: 'center' }}>
          {verified && <span className="badge" style={{ background: '#d1fae5', color: '#065f46' }}><CheckCircle2 size={12} />Verified</span>}
          {!verified && hasSecret && <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}><AlertCircle size={12} />Not verified</span>}
          {active ? <span className="badge" style={{ background: '#dbeafe', color: '#1e40af' }}>Active</span>
                  : <span className="badge">Inactive</span>}
        </div>
      </header>

      {verifyErr && !verified && (
        <div className="callout callout-warning" role="alert" style={{ marginBottom: 12 }}>
          <AlertCircle size={16} />
          <div><strong>Last verification error:</strong> {verifyErr}</div>
        </div>
      )}

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <label>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Mode</div>
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value)} disabled={busy || loading}>
            <option value="test">Test / Sandbox</option>
            <option value="live">Live / Production</option>
          </select>
        </label>
        <label>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Display name (optional)</div>
          <input className="input" placeholder={`${provider.name} — ${mode}`} value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={busy || loading} />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{provider.publishableLabel}</div>
          <input className={`input ${fields.publishableKey ? 'invalid' : ''}`} value={publishableKey}
                 onChange={(e) => setPublishableKey(e.target.value)} disabled={busy || loading} autoComplete="off" />
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{provider.publishableHint}</div>
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            <KeyRound size={12} /> {provider.secretLabel}
            {hasSecret && <span style={{ marginLeft: 8, color: '#059669' }}>stored (…{row.secretLast4 || '••••'})</span>}
          </div>
          <input className={`input ${fields.secretKey ? 'invalid' : ''}`} type="password"
                 placeholder={hasSecret ? 'Leave blank to keep the saved key' : 'Paste your secret key'}
                 value={secretKey} onChange={(e) => setSecretKey(e.target.value)} disabled={busy || loading} autoComplete="off" />
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            {provider.secretHint} {fields.secretKey && <span style={{ color: '#dc2626' }}>{fields.secretKey}</span>}
          </div>
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            {provider.webhookLabel}
            {row?.hasWebhookSecret && <span style={{ marginLeft: 8, color: '#059669' }}>stored</span>}
          </div>
          <input className="input" type="password"
                 placeholder={row?.hasWebhookSecret ? 'Leave blank to keep, type a value to replace' : 'Optional'}
                 value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} disabled={busy || loading} autoComplete="off" />
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{provider.webhookHint}</div>
          {row?.hasWebhookSecret && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12 }}>
              <input type="checkbox" checked={clearWebhook} onChange={(e) => setClearWebhook(e.target.checked)} />
              Remove the saved webhook secret
            </label>
          )}
        </label>
        <label className="row gap-8" style={{ alignItems: 'center' }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={busy || loading} />
          <span>Active — allow my shop to take payments through {provider.name}</span>
        </label>
      </div>

      {err && <div className="callout callout-danger" role="alert" style={{ marginTop: 12 }}><AlertCircle size={18} /><div>{err}</div></div>}

      <footer className="row gap-8 wrap" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        {hasSecret && <button className="btn btn-ghost" onClick={remove} disabled={busy}><Trash2 size={15} />Remove</button>}
        {hasSecret && <button className="btn btn-secondary" onClick={verify} disabled={busy || verifyBusy}><RefreshCw size={15} />{verifyBusy ? 'Verifying…' : 'Verify now'}</button>}
        <button className="btn btn-primary" onClick={save} disabled={busy}><Save size={15} />{busy ? 'Saving…' : 'Save'}</button>
      </footer>
    </section>
  )
}

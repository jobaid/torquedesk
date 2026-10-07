import { useEffect, useState } from 'react'
import { CreditCard, CheckCircle2, AlertCircle, KeyRound, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Card, Btn, Input, Select, Field, PageHeader, StatusPill } from './primitives'
import { ownerApi } from '../../store/useOwner'

// SaaS-owner billing-processor settings. The CuraNex operator uses these to
// charge shops for their subscription. Separate table from the shop-side
// gateways in payment settings — a shop never sees these credentials.

const PROVIDERS = [
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Charge TorqueDesk customers for their TorqueDesk subscription through Stripe Billing / Checkout.',
    publishableLabel: 'Publishable key',
    publishableHint: 'Starts with pk_test_ or pk_live_',
    secretLabel: 'Secret key',
    secretHint: 'Starts with sk_test_ or sk_live_ — stored encrypted.',
    webhookLabel: 'Webhook signing secret (optional)',
    webhookHint: 'Starts with whsec_. Needed to confirm subscription payments once Session 3 is wired.',
  },
  {
    id: 'authnet',
    name: 'Authorize.Net',
    description: 'Charge TorqueDesk customers for their TorqueDesk subscription through Authorize.Net.',
    publishableLabel: 'API Login ID',
    publishableHint: 'From Account → Settings → API Credentials & Keys.',
    secretLabel: 'Transaction Key',
    secretHint: 'From the same screen.',
    webhookLabel: 'Signature Key (optional)',
    webhookHint: 'For webhook signature verification.',
  },
]

export default function Billing() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true); setErr('')
    try {
      setRows((await ownerApi('/billing-processors')) || [])
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <PageHeader
        title="Billing Processors"
        subtitle="How TorqueDesk collects subscription payments from shops. Secret keys are encrypted at rest and never returned to this screen after you save them."
      />
      {err && <Card style={{ background: '#2a0d10', borderColor: '#51232a', color: '#fda4af', marginBottom: 16 }}>{err}</Card>}
      <div style={{ display: 'grid', gap: 16 }}>
        {PROVIDERS.map((p) => (
          <ProcessorCard
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

function ProcessorCard({ provider, row, loading, onChanged }) {
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
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!row) return
    setMode(row.mode || 'test')
    setDisplayName(row.displayName || '')
    setPublishableKey(row.publishableKey || '')
    setActive(row.active)
  }, [row?.updatedAt])

  const save = async () => {
    setBusy(true); setErr(''); setFields({}); setNotice('')
    try {
      await ownerApi(`/billing-processors/${provider.id}`, {
        method: 'PUT',
        body: { mode, displayName, publishableKey, secretKey, webhookSecret, clearWebhook, active },
      })
      setSecretKey(''); setWebhookSecret(''); setClearWebhook(false)
      setNotice(`${provider.name} saved.`)
      onChanged()
    } catch (e) {
      setErr(e.message); setFields(e.fields || {})
    } finally { setBusy(false) }
  }

  const verify = async () => {
    setVerifyBusy(true); setErr(''); setNotice('')
    try {
      const res = await ownerApi(`/billing-processors/${provider.id}/verify`, { method: 'POST' })
      if (res.verifiedAt) setNotice(`${provider.name} verified — the credentials work.`)
      else setErr(res.verificationError || `${provider.name} verification failed.`)
      onChanged()
    } catch (e) {
      setErr(e.message)
    } finally { setVerifyBusy(false) }
  }

  const remove = async () => {
    if (!confirm(`Remove the saved ${provider.name} credentials? CuraNex will no longer be able to charge subscriptions through ${provider.name}.`)) return
    setBusy(true); setErr(''); setNotice('')
    try {
      await ownerApi(`/billing-processors/${provider.id}`, { method: 'DELETE' })
      setMode('test'); setDisplayName(''); setPublishableKey('')
      setSecretKey(''); setWebhookSecret(''); setActive(false)
      setNotice(`${provider.name} removed.`)
      onChanged()
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const hasSecret = row?.hasSecret
  const verified = !!row?.verifiedAt

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ background: provider.id === 'stripe' ? '#635bff' : '#2563eb', borderRadius: 10, padding: 10, color: '#fff', display: 'flex' }}>
          <CreditCard size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600, fontSize: 16, color: '#e5edf5' }}>{provider.name}</div>
          <div style={{ fontSize: 12.5, color: '#8da2bf', marginTop: 2 }}>{provider.description}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {verified && <StatusPill status="active" />}
          {!verified && hasSecret && <StatusPill status="pending" />}
          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, background: active ? '#102236' : '#1f1f1f', color: active ? '#93c5fd' : '#a1a1aa', fontSize: 11, fontWeight: 600 }}>
            {active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {row?.verificationError && !verified && (
        <div style={{ background: '#2a1a0d', border: '1px solid #51331a', color: '#fdba74', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
          <strong>Last verification error:</strong> {row.verificationError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <Field label="Mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value)} disabled={busy || loading}>
            <option value="test">Test / Sandbox</option>
            <option value="live">Live / Production</option>
          </Select>
        </Field>
        <Field label="Display name (optional)">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={`${provider.name} — ${mode}`} disabled={busy || loading} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label={provider.publishableLabel} hint={provider.publishableHint} error={fields.publishableKey}>
            <Input value={publishableKey} onChange={(e) => setPublishableKey(e.target.value)} disabled={busy || loading} autoComplete="off" />
          </Field>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field
            label={<span><KeyRound size={12} /> {provider.secretLabel}{hasSecret && <span style={{ marginLeft: 8, color: '#86efac' }}>stored (…{row.secretLast4 || '••••'})</span>}</span>}
            hint={provider.secretHint}
            error={fields.secretKey}
          >
            <Input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)}
                   placeholder={hasSecret ? 'Leave blank to keep the saved key' : 'Paste your secret key'}
                   disabled={busy || loading} autoComplete="off" />
          </Field>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field
            label={<span>{provider.webhookLabel}{row?.hasWebhookSecret && <span style={{ marginLeft: 8, color: '#86efac' }}>stored</span>}</span>}
            hint={provider.webhookHint}
          >
            <Input type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)}
                   placeholder={row?.hasWebhookSecret ? 'Leave blank to keep, type a value to replace' : 'Optional'}
                   disabled={busy || loading} autoComplete="off" />
          </Field>
          {row?.hasWebhookSecret && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: '#8da2bf' }}>
              <input type="checkbox" checked={clearWebhook} onChange={(e) => setClearWebhook(e.target.checked)} />
              Remove the saved webhook secret
            </label>
          )}
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#e5edf5', fontSize: 13 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={busy || loading} />
          Active — CuraNex can charge subscriptions through {provider.name}
        </label>
      </div>

      {notice && <div style={{ marginTop: 12, color: '#86efac', fontSize: 12 }}><CheckCircle2 size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />{notice}</div>}
      {err && <div style={{ marginTop: 12, color: '#fda4af', fontSize: 12 }}><AlertCircle size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />{err}</div>}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {hasSecret && <Btn variant="ghost" onClick={remove} disabled={busy}><Trash2 size={14} />Remove</Btn>}
        {hasSecret && <Btn variant="secondary" onClick={verify} disabled={busy || verifyBusy}><RefreshCw size={14} />{verifyBusy ? 'Verifying…' : 'Verify now'}</Btn>}
        <Btn onClick={save} disabled={busy}><Save size={14} />{busy ? 'Saving…' : 'Save'}</Btn>
      </div>
    </Card>
  )
}

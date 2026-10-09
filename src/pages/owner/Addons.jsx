import { useEffect, useState } from 'react'
import { Plus, Package, Trash2, Save } from 'lucide-react'
import { Card, PageHeader, Btn, Field, Input, Select } from './primitives'
import { ownerApi } from '../../store/useOwner'

// Owner-side Add-on catalog editor. Each row maps a feature-flag key to a
// name/description/monthly price with a trial period. Shops see these on
// Settings → General → Add-ons and subscribe via Stripe Checkout.

const KNOWN_KEYS = [
  'inspections', 'technician_submit', 'share_link', 'chat', 'authorization',
  'online_payments', 'payment_receipts', 'email_templates', 'integrations_hub',
  'advanced_reports', 'backup', 'notifications', 'audit_log', 'mfa',
  'void_documents', 'deposit_payments',
]

export default function Addons() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true); setErr('')
    try { setList(await ownerApi('/addons')) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <PageHeader
        title="Add-ons"
        subtitle="Features shops can purchase as monthly subscriptions. Payments go to your Stripe account; the matching feature flag auto-flips on when the subscription activates."
        actions={<Btn onClick={() => setAdding(true)}><Plus size={14} /> New add-on</Btn>}
      />
      {err && <div style={{ padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13, background: 'rgba(220,53,69,0.12)', border: '1px solid rgba(220,53,69,0.35)', color: '#fda1aa' }}>{err}</div>}
      {adding && <AddonForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
      {loading ? <div style={{ color: '#8da2bf' }}>Loading…</div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {list.length === 0 ? (
            <Card><div style={{ color: '#8da2bf' }}>No add-ons yet. Create one so shops have something to subscribe to.</div></Card>
          ) : list.map((a) => <AddonRow key={a.id} addon={a} onChanged={load} />)}
        </div>
      )}
    </div>
  )
}

function AddonForm({ addon, onClose, onSaved }) {
  const edit = !!addon
  const [featureKey, setFeatureKey] = useState(addon?.featureKey || KNOWN_KEYS[0])
  const [name, setName] = useState(addon?.name || '')
  const [description, setDescription] = useState(addon?.description || '')
  const [monthlyPrice, setMonthlyPrice] = useState(addon?.monthlyPrice || '')
  const [trialDays, setTrialDays] = useState(addon?.trialDays ?? 7)
  const [published, setPublished] = useState(addon?.published ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    setBusy(true); setErr('')
    try {
      if (edit) {
        await ownerApi(`/addons/${addon.id}`, { method: 'PATCH', body: { name, description, monthlyPrice, trialDays: Number(trialDays), published } })
      } else {
        await ownerApi('/addons', { method: 'POST', body: { featureKey, name, description, monthlyPrice, currency: 'USD', trialDays: Number(trialDays), published } })
      }
      onSaved()
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{edit ? 'Edit add-on' : 'New add-on'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {!edit && (
          <Field label="Feature key" hint="Must match a feature in Feature Access.">
            <Select value={featureKey} onChange={(e) => setFeatureKey(e.target.value)}>
              {KNOWN_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vehicle Inspections" /></Field>
        <Field label="Monthly price (USD)"><Input type="number" step="0.01" value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)} placeholder="29.00" /></Field>
        <Field label="Free trial (days)"><Input type="number" min="0" max="90" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} /></Field>
      </div>
      <div style={{ marginTop: 10 }}>
        <Field label="Description (shown to shops)">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #2a3650', background: '#0b1220', color: '#e5edf5', fontSize: 13 }} />
        </Field>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#c5d2e1', marginTop: 10 }}>
        <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
        Published (visible to shops)
      </label>
      {err && <div style={{ color: '#fda4af', fontSize: 12, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn onClick={save} disabled={busy || !name.trim() || !monthlyPrice}>
          <Save size={14} /> {busy ? 'Saving…' : (edit ? 'Save' : 'Create add-on')}
        </Btn>
      </div>
    </Card>
  )
}

function AddonRow({ addon, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const remove = async () => {
    if (!confirm(`Delete "${addon.name}"? Fails if any shop still has an active subscription.`)) return
    setBusy(true)
    try {
      await ownerApi(`/addons/${addon.id}`, { method: 'DELETE' })
      onChanged()
    } catch (e) { alert(e.message) }
    finally { setBusy(false) }
  }

  if (editing) return <AddonForm addon={addon} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged() }} />

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Package size={20} color="#5b8def" />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 15 }}>{addon.name}</strong>
            <code style={{ padding: '1px 6px', background: '#1e2a44', color: '#93c5fd', borderRadius: 4, fontSize: 11 }}>{addon.featureKey}</code>
            {!addon.published && <span style={{ fontSize: 10, color: '#8da2bf', textTransform: 'uppercase', letterSpacing: '.05em' }}>Draft</span>}
          </div>
          <div style={{ fontSize: 12, color: '#8da2bf', marginTop: 4 }}>
            ${addon.monthlyPrice} / month · {addon.trialDays}-day trial
            {addon.stripePriceId && <> · <code style={{ fontSize: 10 }}>{addon.stripePriceId}</code></>}
          </div>
          {addon.description && <div style={{ fontSize: 12, color: '#c5d2e1', marginTop: 4 }}>{addon.description}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn variant="secondary" onClick={() => setEditing(true)} disabled={busy}>Edit</Btn>
          <Btn variant="danger" onClick={remove} disabled={busy}><Trash2 size={13} /></Btn>
        </div>
      </div>
    </Card>
  )
}

import { useEffect, useState } from 'react'
import { Plus, Package, Trash2, Save, Star, Eye, EyeOff } from 'lucide-react'
import { Card, PageHeader, Btn, Field, Input } from './primitives'
import { ownerApi } from '../../store/useOwner'

// Owner → Plans — manage every subscription tier shown on the marketing
// site, in Signup, and in Settings → Billing setup. Edits take effect
// immediately: next GET /api/public/signup/plans returns the new catalog.

const FEATURE_GROUPS = [
  { name: 'Core', keys: ['dashboard', 'customers', 'vehicles', 'orders', 'invoices', 'payments', 'settings'] },
  { name: 'Technical', keys: ['repair_info', 'diagnostics', 'dtc', 'wiring', 'maintenance', 'bulletins'] },
  { name: 'Shop add-ons', keys: ['inspections', 'inspection_photos', 'technician_submit', 'share_link', 'chat', 'authorization', 'online_payments', 'payment_receipts', 'email_templates', 'integrations_hub'] },
  { name: 'Reporting', keys: ['reports', 'sales_reports', 'advanced_reports', 'parts_profit', 'payments_report', 'tax_report'] },
  { name: 'Workflow', keys: ['void_documents', 'reopen_documents', 'deposit_payments'] },
  { name: 'Operations', keys: ['backup', 'notifications', 'audit_log', 'mfa', 'password_reset'] },
]

export default function Plans() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setLoading(true); setErr('')
    try { setPlans(await ownerApi('/plans')) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <PageHeader
        title="Subscription Plans"
        subtitle="The tiers shoppers see on your pricing page, during signup, and when they set up Stripe billing. Changes take effect immediately."
        actions={<Btn onClick={() => setAdding(true)}><Plus size={14} /> New plan</Btn>}
      />
      {err && <Card style={{ background: '#2a0d10', borderColor: '#51232a', color: '#fda4af', marginBottom: 14 }}>{err}</Card>}
      {adding && <PlanForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
      {loading ? <div style={{ color: '#64748b' }}>Loading…</div> : (
        <div style={{ display: 'grid', gap: 14 }}>
          {plans.length === 0 ? (
            <Card><div style={{ color: '#64748b' }}>No plans yet. Create one so shops have something to subscribe to.</div></Card>
          ) : plans.map((p) => <PlanRow key={p.key} plan={p} onChanged={load} />)}
        </div>
      )}
    </div>
  )
}

function PlanForm({ plan, onClose, onSaved }) {
  const edit = !!plan
  const [key, setKey]            = useState(plan?.key || '')
  const [name, setName]          = useState(plan?.name || '')
  const [tagline, setTagline]    = useState(plan?.tagline || '')
  const [monthly, setMonthly]    = useState(plan?.monthlyPrice ?? '')
  const [annual, setAnnual]      = useState(plan?.annualPrice ?? '')
  const [trial, setTrial]        = useState(plan?.trialDays ?? 7)
  const [features, setFeatures]  = useState(new Set(plan?.features || []))
  const [highlighted, setHigh]   = useState(plan?.highlighted ?? false)
  const [published, setPub]      = useState(plan?.published ?? true)
  const [order, setOrder]        = useState(plan?.displayOrder ?? 100)
  const [busy, setBusy]          = useState(false)
  const [err, setErr]            = useState('')

  const toggle = (k) => setFeatures((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const save = async () => {
    setBusy(true); setErr('')
    try {
      const body = {
        name, tagline,
        monthlyPrice: Number(monthly),
        annualPrice: Number(annual || 0),
        trialDays: Number(trial),
        features: Array.from(features),
        highlighted, published,
        displayOrder: Number(order),
      }
      if (edit) {
        await ownerApi(`/plans/${plan.key}`, { method: 'PATCH', body })
      } else {
        await ownerApi('/plans', { method: 'POST', body: { ...body, key } })
      }
      onSaved()
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{edit ? `Edit ${plan.key}` : 'New plan'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {!edit && (
          <Field label="Key (lowercase, used internally)" hint="e.g. starter, pro, elite. Can't change later.">
            <Input value={key} onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="starter" />
          </Field>
        )}
        <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Starter" /></Field>
        <Field label="Monthly price (USD)"><Input type="number" step="0.01" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="49.00" /></Field>
        <Field label="Annual price (USD)"><Input type="number" step="0.01" value={annual} onChange={(e) => setAnnual(e.target.value)} placeholder="470.00" /></Field>
        <Field label="Free trial (days)"><Input type="number" min="0" max="365" value={trial} onChange={(e) => setTrial(e.target.value)} /></Field>
        <Field label="Display order (lower first)"><Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} /></Field>
      </div>
      <Field label="Tagline (short description shown on pricing card)" style={{ marginTop: 10 }}>
        <textarea value={tagline} onChange={(e) => setTagline(e.target.value)} rows={2}
          style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontSize: 13, fontFamily: 'inherit' }} />
      </Field>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Features included in this plan</div>
        {FEATURE_GROUPS.map((g) => (
          <div key={g.name} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>{g.name}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {g.keys.map((k) => (
                <button key={k} type="button" onClick={() => toggle(k)}
                  style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11,
                    border: '1px solid ' + (features.has(k) ? '#5b8def' : '#e2e8f0'),
                    background: features.has(k) ? 'rgba(91,141,239,.15)' : 'transparent',
                    color: features.has(k) ? '#93c5fd' : '#64748b', cursor: 'pointer' }}>
                  {features.has(k) ? '✓ ' : ''}{k.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap', fontSize: 13, color: '#c5d2e1' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={highlighted} onChange={(e) => setHigh(e.target.checked)} /> Highlighted (★ Most popular)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={published} onChange={(e) => setPub(e.target.checked)} /> Published (visible on pricing page)
        </label>
      </div>
      {err && <div style={{ color: '#fda4af', fontSize: 12, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn onClick={save} disabled={busy || !name || !monthly || (!edit && !key)}>
          <Save size={14} /> {busy ? 'Saving…' : (edit ? 'Save' : 'Create plan')}
        </Btn>
      </div>
    </Card>
  )
}

function PlanRow({ plan, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const remove = async () => {
    if (!confirm(`Delete the "${plan.name}" plan? Fails if any active subscriptions are still on it.`)) return
    setBusy(true)
    try { await ownerApi(`/plans/${plan.key}`, { method: 'DELETE' }); onChanged() }
    catch (e) { alert(e.message) }
    finally { setBusy(false) }
  }

  if (editing) return <PlanForm plan={plan} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged() }} />

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Package size={20} color="#5b8def" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 16 }}>{plan.name}</strong>
            <code style={{ padding: '2px 6px', background: '#e2e8f0', color: '#93c5fd', borderRadius: 4, fontSize: 10 }}>{plan.key}</code>
            {plan.highlighted && <span title="Most popular"><Star size={13} color="#fbbf24" /></span>}
            {plan.published ? <Eye size={13} color="#86efac" title="Published" /> : <EyeOff size={13} color="#64748b" title="Draft" />}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            <strong style={{ color: '#c5d2e1' }}>${plan.monthlyPrice}</strong>/mo · <strong style={{ color: '#c5d2e1' }}>${plan.annualPrice}</strong>/year · {plan.trialDays}-day trial · {plan.features?.length || 0} features
          </div>
          {plan.tagline && <div style={{ fontSize: 12, color: '#c5d2e1', marginTop: 4 }}>{plan.tagline}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn variant="secondary" onClick={() => setEditing(true)} disabled={busy}>Edit</Btn>
          <Btn variant="danger" onClick={remove} disabled={busy}><Trash2 size={13} /></Btn>
        </div>
      </div>
    </Card>
  )
}

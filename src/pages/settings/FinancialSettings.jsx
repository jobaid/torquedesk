import { useState } from 'react'
import { Plus, Pencil, Trash2, Info, DollarSign, Percent, TrendingUp, Receipt, Star, Calculator, Power, History } from 'lucide-react'
import { SectionHead, useSectionForm, useUnsavedGuard, UnsavedBar, FormFields, EntityModal, useList, useCanEdit, toPayload } from './kit'
import { ConfirmDialog } from '../../components/ui/Modal'
import { EmptyState, Field, Switch } from '../../components/ui'
import { useSettings } from '../../store/useSettings'
import { toast } from '../../store/useApp'
import { api, ApiError } from '../../lib/api'
import { calcFee } from '../../lib/totals'
import { money } from '../../lib/format'

const today = () => new Date().toISOString().slice(0, 10)

/* ---------------------------------------------------------------- Labor rates */

const LABOR_FIELDS = [
  { name: 'rate', label: 'Labor rate (per hour)', type: 'number', required: true, prefix: '$', suffix: '/ hr', autoFocus: true },
  { name: 'currency', label: 'Currency', type: 'select', options: [['USD', 'USD — US Dollar'], ['CAD', 'CAD — Canadian Dollar'], ['EUR', 'EUR — Euro'], ['GBP', 'GBP — Pound'], ['AUD', 'AUD — Australian Dollar'], ['MXN', 'MXN — Mexican Peso']] },
  { name: 'effectiveDate', label: 'Effective date', type: 'date', required: true },
  { name: 'notes', label: 'Notes', placeholder: 'Reason for change (optional)' },
]

export function LaborRates() {
  const current = useSettings((s) => s.data?.laborRate)
  const history = useSettings((s) => s.data?.laborRates) || []
  const patch = useSettings((s) => s.patch)
  const canEdit = useCanEdit('financial_settings.edit')
  const initial = { rate: String(current?.rate ?? ''), currency: current?.currency || 'USD', effectiveDate: today(), notes: '' }
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const dirty = form.rate !== initial.rate || form.currency !== initial.currency || form.notes !== ''
  const blocker = useUnsavedGuard(dirty)
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }

  const save = async () => {
    if (!form.rate) { setErrors({ rate: 'Labor rate is required.' }); return false }
    setSaving(true)
    try {
      const list = await api('/settings/labor-rates', { method: 'POST', body: toPayload(form, LABOR_FIELDS) })
      patch('laborRates', list)
      const active = list.find((x) => x.active)
      patch('laborRate', active)
      setForm({ rate: String(active.rate), currency: active.currency, effectiveDate: today(), notes: '' })
      toast.success('Labor rate updated', `${money(active.rate)} / hr applies to new documents`)
      return true
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fields)
      toast.error('Could not save labor rate', e.message)
      return false
    } finally { setSaving(false) }
  }
  const discard = () => { setForm(initial); setErrors({}) }

  return (
    <div className="stack gap-16">
      <SectionHead title="Labor Rate" description="New estimates and repair orders use the current active rate." perm="financial_settings.edit" />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad stack gap-12">
          <div className="section-title">Current rate</div>
          <div className="big-stat">{money(current?.rate)}<span> / hour</span></div>
          <div className="small muted">{current?.currency} · effective {current?.effectiveDate ? new Date(`${current.effectiveDate}T12:00:00`).toLocaleDateString() : '—'}</div>
          <div className="callout callout-info"><Info size={18} /><div>Changing the rate never changes existing documents — each estimate keeps the rate it was created with. Use <strong>Apply current settings</strong> on a document to recalculate it.</div></div>
        </div>
        {canEdit && (
          <div className="card card-pad stack gap-16">
            <h3>Set a new labor rate</h3>
            <FormFields fields={LABOR_FIELDS} form={form} set={set} errors={errors} />
            <div className="row gap-8" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={discard} disabled={!dirty}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}><DollarSign size={16} />{saving ? 'Saving…' : 'Save new rate'}</button>
            </div>
          </div>
        )}
      </div>
      <div className="card">
        <div className="card-header"><h3><History size={17} />Rate history</h3></div>
        <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="table">
            <thead><tr><th>Rate</th><th>Currency</th><th>Effective</th><th>Status</th><th className="desktop-only">Set by</th><th className="desktop-only">Notes</th></tr></thead>
            <tbody>{history.map((r) => (
              <tr key={r.id}><td className="strong num">{money(r.rate)}</td><td>{r.currency}</td><td>{new Date(`${r.effectiveDate}T12:00:00`).toLocaleDateString()}</td>
                <td><span className={`badge ${r.active ? 'badge-success' : ''}`}>{r.active ? 'Active' : 'Previous'}</span></td><td className="desktop-only small">{r.createdBy}</td><td className="desktop-only small muted">{r.notes || '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <UnsavedBar dirty={dirty} saving={saving} onSave={save} onDiscard={discard} blocker={blocker} />
    </div>
  )
}

/* ---------------------------------------------------------------- Tax rates */

const TAX_FIELDS = [
  { name: 'name', label: 'Tax name', required: true, placeholder: 'e.g. Sales Tax', autoFocus: true },
  { name: 'rate', label: 'Tax rate', type: 'number', required: true, suffix: '%', placeholder: '8.875' },
  { name: 'description', label: 'Description', span: 2 },
  { name: 'appliesParts', label: 'Applies to parts', type: 'switch' },
  { name: 'appliesLabor', label: 'Applies to labor', type: 'switch' },
  { name: 'appliesFees', label: 'Applies to taxable fees', type: 'switch', hint: 'Fee lines and shop fees marked taxable' },
  { name: 'isDefault', label: 'Default tax', type: 'switch', hint: 'Selected automatically on new documents' },
  { name: 'active', label: 'Active', type: 'switch' },
  { name: 'sort', label: 'Display order', type: 'number' },
]

export function TaxRates() {
  const { list, reload, remove, patchRow } = useList('tax-rates')
  const canEdit = useCanEdit('financial_settings.edit')
  const [edit, setEdit] = useState(null)
  const [del, setDel] = useState(null)
  const defaults = list.filter((t) => t.active && t.isDefault)
  const combined = Math.round(defaults.reduce((a, t) => a + t.rate, 0) * 10000) / 10000
  const appliesText = (t) => [t.appliesParts && 'Parts', t.appliesLabor && 'Labor', t.appliesFees && 'Fees'].filter(Boolean).join(', ')

  return (
    <div className="stack gap-16">
      <SectionHead title="Tax Rates" description="Create every tax your shop collects. Each rate is stored and calculated separately." perm="financial_settings.edit"
        actions={<button className="btn btn-primary" onClick={() => setEdit({ name: '', rate: '', description: '', appliesParts: true, appliesLabor: false, appliesFees: false, isDefault: true, active: true, sort: String(list.length + 1) })}><Plus size={16} />Add Tax Rate</button>} />
      <div className="card card-pad">
        <div className="section-title">Default taxes on new documents</div>
        {defaults.length === 0 ? <p className="muted small mt-8">No default taxes. New documents will have no tax until one is selected.</p> : (
          <div className="tax-sum mt-8">
            {defaults.map((t, i) => <div key={t.id}><span>Tax {i + 1} · {t.name}</span><strong>{t.rate}%</strong><span className="xs subtle">{appliesText(t)}</span></div>)}
            <div className="tax-total"><span>Combined</span><strong>{combined}%</strong><span className="xs subtle">when all apply to the same line</span></div>
          </div>
        )}
        <p className="xs subtle mt-12">Each tax is calculated on its own base and rounded separately. Documents keep the tax rates that were in effect when they were created.</p>
      </div>
      {list.length === 0 ? <div className="card"><EmptyState icon={Percent} title="No tax rates">Add your sales tax to start collecting it.</EmptyState></div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th className="num">Rate</th><th>Applies to</th><th>Default</th><th>Status</th><th /></tr></thead>
            <tbody>{list.map((t) => (
              <tr key={t.id} style={{ opacity: t.active ? 1 : 0.6 }}>
                <td><div className="strong">{t.name}</div>{t.description && <div className="xs subtle">{t.description}</div>}</td>
                <td className="num strong">{t.rate}%</td>
                <td className="small">{appliesText(t)}</td>
                <td>{t.isDefault ? <span className="badge badge-brand"><Star size={11} />Default</span> : '—'}</td>
                <td><span className={`badge ${t.active ? 'badge-success' : ''}`}>{t.active ? 'Active' : 'Inactive'}</span></td>
                <td>{canEdit && <span className="row gap-4" style={{ justifyContent: 'flex-end' }}>
                  <button className="icon-btn sm" title={t.active ? 'Deactivate' : 'Activate'} onClick={() => patchRow(t.id, { active: !t.active }, `${t.name} ${t.active ? 'deactivated' : 'activated'}`)} aria-label={`${t.active ? 'Deactivate' : 'Activate'} ${t.name}`}><Power size={15} /></button>
                  <button className="icon-btn sm" onClick={() => setEdit({ ...t, rate: String(t.rate), sort: String(t.sort) })} aria-label={`Edit ${t.name}`}><Pencil size={15} /></button>
                  <button className="icon-btn sm" onClick={() => setDel(t)} aria-label={`Delete ${t.name}`}><Trash2 size={15} /></button>
                </span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {edit && <EntityModal title={edit.id ? 'Edit tax rate' : 'Add tax rate'} fields={TAX_FIELDS} initial={pickFields(edit, TAX_FIELDS)} path="/settings/tax-rates" onSaved={reload} onClose={() => setEdit(null)} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger confirmLabel="Delete" title={`Delete ${del?.name}?`} body="Existing documents keep this tax. It won't be available for new documents." onConfirm={() => remove(del.id, del.name)} />
    </div>
  )
}

function pickFields(row, fields) {
  const out = row.id ? { id: row.id } : {}
  for (const f of fields) {
    const v = row[f.name]
    out[f.name] = f.type === 'number' ? (v == null ? '' : String(v)) : v ?? (f.type === 'switch' ? false : '')
  }
  return out
}

/* ---------------------------------------------------------------- Markups + display toggles */

const MARKUP_FIELDS = [
  { name: 'name', label: 'Name', required: true, span: 2, placeholder: 'e.g. Standard parts markup', autoFocus: true },
  { name: 'appliesTo', label: 'Applies to', type: 'segmented', options: [['parts', 'Parts'], ['labor', 'Labor'], ['other', 'Other']] },
  { name: 'calcType', label: 'Calculation type', type: 'segmented', options: [['percent', 'Percentage'], ['amount', 'Fixed amount']] },
  { name: 'percentage', label: 'Percentage', type: 'number', suffix: '%', show: (f) => f.calcType === 'percent', hint: 'Added on top of cost: $10 cost × 40% = $14 price' },
  { name: 'amount', label: 'Fixed amount', type: 'number', prefix: '$', show: (f) => f.calcType === 'amount', hint: 'Added per unit on top of cost' },
  { name: 'active', label: 'Active', type: 'switch', hint: 'One active markup per category' },
  { name: 'description', label: 'Description', type: 'textarea', span: 2 },
]

export function Markups() {
  const { list, reload, remove, patchRow } = useList('markups')
  const canEdit = useCanEdit('financial_settings.edit')
  const display = useSectionForm('display', { perm: 'financial_settings.edit', successMsg: 'Display settings saved' })
  const blocker = useUnsavedGuard(display.dirty)
  const [edit, setEdit] = useState(null)
  const [del, setDel] = useState(null)
  const describe = (m) => (m.calcType === 'percent' ? `${m.percentage}% of cost` : `${money(m.amount)} per unit`)
  const example = (m) => { const c = 100; return m.calcType === 'percent' ? c * (1 + m.percentage / 100) : c + m.amount }

  return (
    <div className="stack gap-16">
      <SectionHead title="Standard Markups" description="Markups turn part cost into selling price. Applied when a part is added with a cost." perm="financial_settings.edit"
        actions={<button className="btn btn-primary" onClick={() => setEdit({ name: '', appliesTo: 'parts', calcType: 'percent', percentage: '', amount: '', active: true, description: '' })}><Plus size={16} />Add Markup</button>} />
      {list.length === 0 ? <div className="card"><EmptyState icon={TrendingUp} title="No markups">Parts will be priced at the amount you enter.</EmptyState></div> : (
        <div className="cred-grid">
          {list.map((m) => (
            <div key={m.id} className="card cred-card" style={{ opacity: m.active ? 1 : 0.65 }}>
              <div className="row between"><span className="badge badge-brand">{m.appliesTo === 'parts' ? 'Parts' : m.appliesTo === 'labor' ? 'Labor' : 'Other'}</span><span className={`badge ${m.active ? 'badge-success' : ''}`}>{m.active ? 'Active' : 'Inactive'}</span></div>
              <h3 className="mt-8">{m.name}</h3>
              <div className="big-stat sm mt-4">{describe(m)}</div>
              <div className="xs subtle mt-4">Example: $100.00 cost → {money(example(m))}</div>
              {m.description && <p className="small muted mt-8">{m.description}</p>}
              {canEdit && <div className="row gap-4 mt-12" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => patchRow(m.id, { active: !m.active }, `${m.name} ${m.active ? 'deactivated' : 'activated'}`)}><Power size={14} />{m.active ? 'Deactivate' : 'Activate'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...m, percentage: String(m.percentage), amount: String(m.amount) })}><Pencil size={14} />Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setDel(m)}><Trash2 size={14} />Delete</button>
              </div>}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-header"><h3>Display on screen</h3></div>
        <div className="card-body stack gap-16">
          <div className="switch-row">
            <div><div className="strong">Display Part Details (On Screen)</div><div className="small muted">When on, part numbers, vendor and order details show on estimates, repair orders and invoices on screen. When off they're hidden — nothing is deleted.</div></div>
            <Switch checked={!!display.form.displayPartDetails} onChange={(v) => display.set('displayPartDetails', v)} label="Display part details" />
          </div>
          <div className="divider" />
          <div className="switch-row">
            <div><div className="strong">Display Markup Details</div><div className="small muted">When on, staff see cost, markup and margin for each part. When off, vendor, order details, cost, markup and margin are hidden. The data is kept and never printed for customers.</div></div>
            <Switch checked={!!display.form.displayMarkupDetails} onChange={(v) => display.set('displayMarkupDetails', v)} label="Display markup details" />
          </div>
          {!display.canEdit && <p className="xs subtle">You need financial settings permission to change these.</p>}
        </div>
      </div>
      {edit && <EntityModal title={edit.id ? 'Edit markup' : 'Add markup'} fields={MARKUP_FIELDS} initial={pickFields(edit, MARKUP_FIELDS)} path="/settings/markups" onSaved={reload} onClose={() => setEdit(null)} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger confirmLabel="Delete" title={`Delete ${del?.name}?`} body="Existing documents keep their prices." onConfirm={() => remove(del.id, del.name)} />
      <UnsavedBar dirty={display.dirty && display.canEdit} saving={display.saving} onSave={display.save} onDiscard={display.discard} blocker={blocker} />
    </div>
  )
}

/* ---------------------------------------------------------------- Shop fees */

const FEE_FIELDS = [
  { name: 'name', label: 'Fee name', required: true, placeholder: 'e.g. HazMat', autoFocus: true },
  { name: 'active', label: 'Active', type: 'switch' },
  { name: 'calcBy', label: 'Calculate by', type: 'segmented', options: [['amount', 'Amount ($)'], ['percent', 'Percentage (%)']], span: 2 },
  { name: 'amount', label: 'Amount', type: 'number', prefix: '$', required: true, show: (f) => f.calcBy === 'amount' },
  { name: 'percentage', label: 'Percentage', type: 'number', suffix: '%', required: true, show: (f) => f.calcBy === 'percent' },
  { name: 'appliesTo', label: 'Percentage of', type: 'select', options: [['labor_parts', 'Labor + parts'], ['labor', 'Labor only'], ['parts', 'Parts only']], show: (f) => f.calcBy === 'percent' },
  { name: 'minimum', label: 'Minimum', type: 'number', prefix: '$', nullable: true, show: (f) => f.calcBy === 'percent', hint: 'Leave blank for no minimum' },
  { name: 'maximum', label: 'Maximum', type: 'number', prefix: '$', nullable: true, show: (f) => f.calcBy === 'percent', hint: 'Leave blank for no maximum' },
  { name: 'taxable', label: 'Taxable', type: 'switch', hint: 'Included for taxes that apply to fees' },
  { name: 'description', label: 'Description', type: 'textarea', span: 2 },
  { name: 'sort', label: 'Display order', type: 'number' },
]

export function ShopFees() {
  const { list, reload, remove, patchRow } = useList('shop-fees')
  const canEdit = useCanEdit('financial_settings.edit')
  const [edit, setEdit] = useState(null)
  const [del, setDel] = useState(null)
  const [base, setBase] = useState({ labor: '300', parts: '200' })
  const b = { labor: Number(base.labor) || 0, parts: Number(base.parts) || 0 }
  const feeBaseOf = (f) => (f.appliesTo === 'labor' ? b.labor : f.appliesTo === 'parts' ? b.parts : b.labor + b.parts)
  const ofText = (f) => ({ labor: 'labor', parts: 'parts', labor_parts: 'labor + parts' })[f.appliesTo]

  return (
    <div className="stack gap-16">
      <SectionHead title="Shop Fees" description="Fees such as HazMat and Shop Supplies added automatically to documents with labor or parts." perm="financial_settings.edit"
        actions={<button className="btn btn-primary" onClick={() => setEdit({ name: '', active: true, calcBy: 'amount', amount: '', percentage: '', minimum: '', maximum: '', appliesTo: 'labor_parts', taxable: false, description: '', sort: String(list.length + 1) })}><Plus size={16} />Add Shop Fee</button>} />
      <div className="callout callout-info"><Info size={18} /><div><strong>Changes to Shop Fees apply to new documents only. Minimum and Maximum only apply to fees based on percentages.</strong></div></div>
      {list.length === 0 ? <div className="card"><EmptyState icon={Receipt} title="No shop fees">Add HazMat or Shop Supplies fees.</EmptyState></div> : (
        <div className="cred-grid">
          {list.map((f) => (
            <div key={f.id} className="card cred-card" style={{ opacity: f.active ? 1 : 0.65 }}>
              <div className="row between"><span className="badge badge-brand">{f.calcBy === 'amount' ? 'Fixed amount' : 'Percentage'}</span><span className={`badge ${f.active ? 'badge-success' : ''}`}>{f.active ? 'Active' : 'Inactive'}</span></div>
              <h3 className="mt-8">{f.name}</h3>
              {f.description && <div className="xs subtle">{f.description}</div>}
              <dl className="kv small mt-8">
                {f.calcBy === 'amount' ? <><dt>Amount</dt><dd>{money(f.amount)}</dd></> : <>
                  <dt>Percentage</dt><dd>{f.percentage}% of {ofText(f)}</dd>
                  <dt>Minimum</dt><dd>{f.minimum == null ? 'None' : money(f.minimum)}</dd>
                  <dt>Maximum</dt><dd>{f.maximum == null ? 'None' : money(f.maximum)}</dd>
                </>}
                <dt>Taxable</dt><dd>{f.taxable ? 'Yes' : 'No'}</dd>
              </dl>
              {canEdit && <div className="row gap-4 mt-12" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => patchRow(f.id, { active: !f.active }, `${f.name} ${f.active ? 'deactivated' : 'activated'}`)}><Power size={14} />{f.active ? 'Deactivate' : 'Activate'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEdit(f)}><Pencil size={14} />Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setDel(f)}><Trash2 size={14} />Delete</button>
              </div>}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-header"><h3><Calculator size={17} />Fee calculator</h3><span className="xs subtle">Try the rules with sample totals</span></div>
        <div className="card-body stack gap-12">
          <div className="row gap-12 wrap">
            <Field label="Labor total" htmlFor="fc-l"><div className="input-wrap"><span className="input-prefix">$</span><input id="fc-l" className="input num" style={{ paddingLeft: 28, width: 160 }} inputMode="decimal" value={base.labor} onChange={(e) => setBase({ ...base, labor: e.target.value.replace(/[^\d.]/g, '') })} /></div></Field>
            <Field label="Parts total" htmlFor="fc-p"><div className="input-wrap"><span className="input-prefix">$</span><input id="fc-p" className="input num" style={{ paddingLeft: 28, width: 160 }} inputMode="decimal" value={base.parts} onChange={(e) => setBase({ ...base, parts: e.target.value.replace(/[^\d.]/g, '') })} /></div></Field>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Fee</th><th>Calculation</th><th className="num">Fee</th></tr></thead>
              <tbody>{list.filter((f) => f.active).map((f) => {
                const raw = f.calcBy === 'percent' ? (feeBaseOf(f) * f.percentage) / 100 : f.amount
                const final = calcFee(f, feeBaseOf(f))
                const clamp = f.calcBy === 'percent' && Math.abs(raw - final) > 0.004 ? (final > raw ? ' → raised to minimum' : ' → capped at maximum') : ''
                return <tr key={f.id}><td className="strong">{f.name}</td><td className="small">{f.calcBy === 'percent' ? `${money(feeBaseOf(f))} × ${f.percentage}% = ${money(raw)}${clamp}` : 'Fixed amount'}</td><td className="num strong">{money(final)}</td></tr>
              })}</tbody>
            </table>
          </div>
        </div>
      </div>
      {edit && <EntityModal title={edit.id ? `Edit ${edit.name}` : 'Add shop fee'} fields={FEE_FIELDS} initial={pickFields(edit, FEE_FIELDS)} path="/settings/shop-fees" onSaved={reload} onClose={() => setEdit(null)} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger confirmLabel="Delete" title={`Delete ${del?.name}?`} body="Existing documents keep this fee. New documents won't include it." onConfirm={() => remove(del.id, del.name)} />
    </div>
  )
}

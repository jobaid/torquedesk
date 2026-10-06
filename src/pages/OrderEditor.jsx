import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Mail, Printer, MoreHorizontal, Copy, Trash2, Car, Phone, User, Wrench, Package, Receipt, StickyNote, Percent,
  ChevronUp, ChevronDown, X, Plus, BookOpen, ShieldCheck, ShieldX, Wallet, History, ShieldAlert, ChevronRight, Check, Info, CalendarClock, Pencil, ExternalLink,
  RefreshCw, Archive, Lock, CreditCard, Link as LinkIcon, MessageSquare, Loader2,
} from 'lucide-react'
import { api } from '../lib/api'
import { useShop, DOC_TYPES, flushSaves, applyMarkup } from '../store/useShop'
import { useApp, toast } from '../store/useApp'
import { useSettings, activeStaff, PAYMENT_METHODS } from '../store/useSettings'
import { computeTotals, lineTotal, partEconomics } from '../lib/totals'
import { money, dateTime } from '../lib/format'
import { vehicleLabel } from '../data/vehicles'
import { PROCEDURES, GROUP_INDEX } from '../data/procedures'
import { TSBS } from '../data/tsbs'
import Modal, { ConfirmDialog } from '../components/ui/Modal'
import { EmptyState, Field, Switch, useOutside } from '../components/ui'
import DocumentSheet from '../components/documents/DocumentSheet'
import { STATUS } from './Orders'

const KINDS = {
  labor: { label: 'Labor', icon: Wrench, tone: '' },
  part: { label: 'Part', icon: Package, tone: 'info' },
  fee: { label: 'Fee', icon: Receipt, tone: 'neutral' },
  note: { label: 'Note', icon: StickyNote, tone: 'warning' },
  discount: { label: 'Discount', icon: Percent, tone: 'success' },
}
const STAGES = ['estimate', 'repair_order', 'invoice']
const fmtDay = (s) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')

export default function OrderEditor() {
  const { id } = useParams()
  const doc = useShop((s) => s.documents.find((d) => d.id === id))
  if (!doc) {
    return <div className="page"><div className="card"><EmptyState icon={Receipt} title="Document not found" action={<Link to="/orders" className="btn btn-primary">All documents</Link>}>It may have been deleted.</EmptyState></div></div>
  }
  return <Editor doc={doc} key={doc.id} />
}

/** Snapshot of the local customer + vehicle, stored on the document for history and printing. */
function partySnapshots(customer, vehicle) {
  return {
    customerSnapshot: customer ? { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email } : null,
    vehicleSnapshot: vehicle ? { year: vehicle.year, make: vehicle.make, model: vehicle.model, trim: vehicle.trim, engineLabel: vehicle.engineLabel, engineDetail: vehicle.engineDetail, vin: vehicle.vin, plate: vehicle.plate } : null,
  }
}

function Editor({ doc }) {
  const bundle = useSettings((s) => s.data)
  const customers = useShop((s) => s.customers)
  const allDocs = useShop((s) => s.documents)
  const saving = useShop((s) => s.saving[doc.id])
  const { updateDocument, deleteDocument, createDocument, addItem, updateItem, removeItem, moveItem, addPayment, removePayment, updateCustomer, applyCurrentSettings } = useShop.getState()
  const can = useApp((s) => s.can)
  const setVehicle = useApp((s) => s.setVehicle)
  const navigate = useNavigate()

  const snap = doc.snapshot || {}
  const opts = snap.options || {}
  const display = { partDetails: bundle.display?.displayPartDetails, markupDetails: bundle.display?.displayMarkupDetails }
  const readOnly = !can('documents.edit')
  const localCustomer = customers.find((c) => c.id === doc.customerId)
  const customer = localCustomer || doc.customerSnapshot
  const vehicle = localCustomer?.vehicles.find((v) => v.id === doc.vehicleId) || doc.vehicleSnapshot
  const totals = useMemo(() => computeTotals(doc), [doc])
  const stageIdx = STAGES.indexOf(doc.type)
  const unit = doc.odometerUnit === 'km' ? 'km' : 'mi'
  const writers = activeStaff(bundle['service-writers'], doc.writerId)
  const techs = activeStaff(bundle.technicians, doc.technicianId)
  const expired = doc.type === 'estimate' && doc.expiresAt && doc.expiresAt < new Date().toISOString().slice(0, 10)

  const [modal, setModal] = useState(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useOutside(moreOpen, () => setMoreOpen(false))

  const patch = (p) => !readOnly && updateDocument(doc.id, p)
  const guard = (fn) => (...a) => (readOnly ? toast.error('Read-only access', 'Your role cannot edit documents.') : fn(...a))

  const goStage = guard((t) => {
    const target = STAGES.indexOf(t)
    if (target === stageIdx) return
    if (target < stageIdx) return setModal(`revert:${t}`)
    if (t === 'repair_order' && !doc.authorization?.approved) return setModal('auth-convert')
    if (t === 'invoice') return setModal('invoice')
    convert(t)
  })
  const convert = (t, extra = {}) => {
    updateDocument(doc.id, { type: t, status: t === 'repair_order' ? 'in_progress' : t === 'invoice' ? (totals.balance <= 0 ? 'paid' : 'ready') : 'open', ...extra })
    toast.success(`Converted to ${DOC_TYPES[t].label}`, `#${doc.number} keeps its number and pricing`)
  }

  const print = async () => {
    if (!can('print')) return toast.error('Printing not permitted for your role')
    await flushSaves()
    window.print()
  }

  const email = () => {
    if (!customer?.email) { toast.error('No email on file', 'Add an email address to the customer first.'); return setModal('cust') }
    const lines = doc.items.filter((i) => i.kind !== 'note' && i.kind !== 'discount').map((i) => `• ${i.description} — ${money(lineTotal(i))}`).join('\n')
    const shop = bundle.shop || {}
    const body = `Hi ${customer.name.split(' ')[0]},\n\nHere is your ${DOC_TYPES[doc.type].label.toLowerCase()} #${doc.number}${vehicle ? ` for your ${vehicleLabel(vehicle)}` : ''}:\n\n${lines}\n\nTotal: ${money(totals.total)}${doc.type === 'estimate' && doc.expiresAt ? `\nValid until: ${fmtDay(doc.expiresAt)}` : ''}${totals.paid ? `\nPaid: ${money(totals.paid)}\nBalance: ${money(totals.balance)}` : ''}\n\n${shop.shopName}\n${shop.phone}`
    window.location.href = `mailto:${customer.email}?subject=${encodeURIComponent(`${shop.shopName} — ${DOC_TYPES[doc.type].label} #${doc.number}`)}&body=${encodeURIComponent(body)}`
    toast.info('Opening your email app', customer.email)
  }

  const duplicate = guard(async () => {
    setMoreOpen(false)
    try {
      // A duplicate is a NEW document: new number and today's settings.
      const copy = await createDocument({ type: 'estimate', customerId: doc.customerId, vehicleId: doc.vehicleId, writerId: doc.writerId, shopNote: doc.shopNote,
        items: doc.items.map(({ id: _id, ...i }) => (i.kind === 'labor' ? { ...i, useDocRate: Math.abs(i.price - snap.laborRate) < 0.005 } : i)) })
      toast.success(`Duplicated as Estimate #${copy.number}`, 'Priced with current settings')
      navigate(`/orders/${copy.id}`)
    } catch (e) { toast.error('Could not duplicate', e.message) }
  })

  const recalc = async () => {
    try {
      await applyCurrentSettings(doc.id)
      toast.success('Current settings applied', 'Labor rate, taxes, fees, markups and options were updated on this document.')
    } catch (e) { toast.error('Could not apply settings', e.message) }
  }

  const openInRepairInfo = () => {
    if (!localCustomer || !vehicle?.make) return
    setVehicle(vehicle)
    toast.success('Vehicle selected', vehicleLabel(vehicle))
    navigate('/repair')
  }

  const vehicleDocs = allDocs.filter((d) => d.id !== doc.id && d.vehicleId && d.vehicleId === doc.vehicleId)
  const recalls = TSBS.filter((t) => t.type === 'Safety Recall')
  const empty = doc.items.length === 0
  const taxIds = doc.taxIds || []
  const toggleTax = (id) => patch({ taxIds: taxIds.includes(id) ? taxIds.filter((x) => x !== id) : [...taxIds, id] })
  const feesOff = doc.feesOff || []
  const toggleFee = (id, on) => patch({ feesOff: on ? feesOff.filter((x) => x !== id) : [...feesOff, id] })
  const payMethods = doc.paymentMethods || []

  return (
    <div className="page full">
      <div className="no-print" style={{ maxWidth: 1480, margin: '0 auto' }}>
        {/* Title bar */}
        <div className="ro-head">
          <div className="row gap-12" style={{ minWidth: 0 }}>
            <Link to="/orders" className="icon-btn bordered" aria-label="Back to documents"><ArrowLeft size={18} /></Link>
            <div style={{ minWidth: 0 }}>
              <h1 className="row gap-8 wrap" style={{ fontSize: 22 }}>{DOC_TYPES[doc.type].label} <span className="doc-num-lg">#{doc.number}</span>
                {saving && <span className="badge">Saving…</span>}
              </h1>
              <div className="xs subtle">
                Created {dateTime(doc.createdAt)} · Last modified {dateTime(doc.updatedAt)}
                {doc.type === 'estimate' && doc.expiresAt && <> · <span style={{ color: expired ? 'var(--danger)' : undefined }}>{expired ? 'Expired' : 'Valid until'} {fmtDay(doc.expiresAt)}</span></>}
              </div>
            </div>
          </div>
          <div className="row gap-8 wrap">
            <select className="select status-select" value={doc.status} onChange={(e) => patch({ status: e.target.value })} aria-label="Status" disabled={readOnly}>
              {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
            <button className="btn btn-secondary" onClick={email}><Mail size={16} />Email</button>
            <button className="btn btn-secondary" onClick={print}><Printer size={16} />Print</button>
            <div className="anchor" ref={moreRef}>
              <button className="btn btn-secondary" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} aria-haspopup="menu"><MoreHorizontal size={16} />Actions</button>
              {moreOpen && (
                <div className="popover" role="menu" style={{ width: 270 }}>
                  <button className="menu-item" role="menuitem" onClick={duplicate}><Copy size={16} />Duplicate as new estimate</button>
                  <button className="menu-item" role="menuitem" onClick={() => { setMoreOpen(false); guard(() => setModal('recalc'))() }}><RefreshCw size={16} />Apply current settings…</button>
                  <button className="menu-item" role="menuitem" onClick={() => { setMoreOpen(false); setModal('history') }}><History size={16} />Vehicle service history</button>
                  <button className="menu-item" role="menuitem" onClick={() => { setMoreOpen(false); openInRepairInfo() }} disabled={!localCustomer}><BookOpen size={16} />Open vehicle in Repair Info</button>
                  <div className="menu-sep" />
                  <button className="menu-item" role="menuitem" style={{ color: 'var(--danger)' }} onClick={() => { setMoreOpen(false); can('documents.delete') ? setModal('delete') : toast.error('Permission required', 'Only advisors and admins can delete documents.') }}><Trash2 size={16} />Delete document</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stage stepper */}
        <div className="stage-bar" role="tablist" aria-label="Document stage">
          {STAGES.map((t, i) => (
            <button key={t} role="tab" aria-selected={doc.type === t} className={`stage${i < stageIdx ? ' done' : ''}${i === stageIdx ? ' on' : ''}`} onClick={() => goStage(t)}>
              <span className="stage-n">{i < stageIdx ? <Check size={13} /> : i + 1}</span>{DOC_TYPES[t].label}
            </button>
          ))}
        </div>
        <div className="snapshot-note">
          <Lock size={13} />
          <span>Priced with settings from {snap.capturedAt ? new Date(snap.capturedAt).toLocaleDateString() : 'creation'}: labor {money(snap.laborRate)}/hr{(snap.taxes || []).length ? ` · ${(snap.taxes || []).map((t) => `${t.name} ${t.rate}%`).join(', ')}` : ''}</span>
          {!readOnly && <button className="link-btn" onClick={() => setModal('recalc')}>Apply current settings</button>}
        </div>
        {readOnly && <div className="callout callout-info mt-12"><Info size={18} /><div>You have read-only access. Ask an advisor or admin to make changes.</div></div>}

        <div className="ro-layout mt-16">
          <div className="stack gap-16" style={{ minWidth: 0 }}>
            {/* Customer & vehicle */}
            <section className="card" aria-label="Customer and vehicle">
              <div className="cv-grid">
                <div className="cv-cust">
                  <div className="row between">
                    <div className="section-title">Customer</div>
                    <button className="btn btn-ghost btn-sm" onClick={guard(() => setModal('cust'))}><Pencil size={14} />Change</button>
                  </div>
                  {customer ? (
                    <div className="stack gap-4 mt-8">
                      {localCustomer ? <Link to={`/customers/${customer.id}`} className="strong" style={{ fontSize: 17, color: 'var(--text)' }}>{customer.name}</Link> : <span className="strong" style={{ fontSize: 17 }}>{customer.name}</span>}
                      {customer.phone && <a href={`tel:${customer.phone.replace(/\D/g, '')}`} className="small row gap-6"><Phone size={14} />{customer.phone}</a>}
                      {customer.email && <a href={`mailto:${customer.email}`} className="small row gap-6"><Mail size={14} />{customer.email}</a>}
                    </div>
                  ) : <div className="mt-8"><div className="strong">Walk-in customer</div><button className="btn btn-soft btn-sm mt-8" onClick={guard(() => setModal('cust'))}><User size={14} />Add customer</button></div>}
                </div>
                <div className="cv-veh">
                  <div className="row between">
                    <div className="section-title">Vehicle</div>
                    {localCustomer && vehicle && <button className="btn btn-ghost btn-sm" onClick={openInRepairInfo}><BookOpen size={14} />Repair info</button>}
                  </div>
                  {vehicle ? (
                    <div className="stack gap-4 mt-8">
                      <div className="strong" style={{ fontSize: 17 }}>{vehicleLabel(vehicle)}</div>
                      <div className="small muted">{[vehicle.trim, vehicle.engineDetail || vehicle.engineLabel].filter(Boolean).join(' · ')}</div>
                      {(vehicle.vin || vehicle.plate) && <div className="mono xs subtle">{vehicle.vin}{vehicle.plate ? ` · ${vehicle.plate}` : ''}</div>}
                    </div>
                  ) : <div className="mt-8 muted small">No vehicle on this document. <button className="link-btn" onClick={guard(() => setModal('cust'))}>Add vehicle</button></div>}
                  <div className="cv-fields mt-12">
                    <Field label={`Odometer in (${unit})`} htmlFor="mi"><input id="mi" className="input num" inputMode="numeric" value={doc.mileageIn} onChange={(e) => patch({ mileageIn: e.target.value.replace(/\D/g, '').slice(0, 9) })} placeholder="0" disabled={readOnly} /></Field>
                    <Field label={`Odometer out (${unit})`} htmlFor="mo" error={doc.mileageOut && doc.mileageIn && Number(doc.mileageOut) < Number(doc.mileageIn) ? 'Less than odometer in' : ''}><input id="mo" className="input num" inputMode="numeric" value={doc.mileageOut} onChange={(e) => patch({ mileageOut: e.target.value.replace(/\D/g, '').slice(0, 9) })} placeholder="0" disabled={readOnly} /></Field>
                    <Field label="Service tag" htmlFor="tag"><input id="tag" className="input" value={doc.tag} onChange={(e) => patch({ tag: e.target.value.slice(0, 40) })} placeholder="e.g. T-14" disabled={readOnly} /></Field>
                  </div>
                </div>
              </div>
              <div className="advisories">
                <span className="small subtle">Advisories</span>
                <div className="row gap-6 wrap">
                  <button className="chip" onClick={() => setModal('history')}><History size={14} />Service history <span className="count">{vehicleDocs.length}</span></button>
                  <button className="chip" onClick={() => setModal('recalls')}><ShieldAlert size={14} />Open recalls <span className="count">{vehicle ? recalls.length : 0}</span></button>
                </div>
              </div>
            </section>

            {/* Line items */}
            <section className="card" aria-label="Line items">
              <div className="li-head" aria-hidden="true">
                <span /><span>Description</span><span className="num">Qty / Hrs</span><span className="num">Price</span><span className="num">Total</span><span>Tax</span><span />
              </div>
              {empty ? (
                <EmptyState icon={Receipt} title="No line items yet">Add labor, parts, fees, notes or discounts below — or pull a procedure from Repair Info.</EmptyState>
              ) : (
                <ul className="li-list">
                  {doc.items.map((it, i) => (
                    <LineItem key={it.id} it={it} idx={i} count={doc.items.length} readOnly={readOnly} totals={totals} display={display}
                      onChange={(p) => updateItem(doc.id, it.id, p)}
                      onRemove={() => { removeItem(doc.id, it.id); toast.info('Line removed', it.description) }}
                      onMove={(d) => moveItem(doc.id, it.id, d)} />
                  ))}
                </ul>
              )}
              {!readOnly && (
                <div className="add-bar">
                  <div className="section-title" style={{ padding: '0 4px 8px' }}>Add item</div>
                  <div className="add-grid">
                    <button className="add-tile" onClick={() => setModal('proc')}><span className="icon-tile sm"><BookOpen size={16} /></span>Repair Info labor & parts</button>
                    {Object.entries(KINDS).map(([k, v]) => (
                      <button key={k} className="add-tile" onClick={() => setModal(`add:${k}`)}><span className={`icon-tile sm ${v.tone}`}><v.icon size={16} /></span>{k === 'labor' ? 'Custom labor' : k === 'part' ? 'Custom part' : k === 'fee' ? 'Flat fee' : v.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Right rail */}
          <aside className="stack gap-16 ro-rail">
            <div className="card card-pad stack gap-12">
              <Field label={<span className="row gap-6">Shop note <span className="badge" style={{ height: 18 }}>Internal only</span></span>} htmlFor="sn">
                <textarea id="sn" className="textarea" rows={2} value={doc.shopNote} onChange={(e) => patch({ shopNote: e.target.value.slice(0, 2000) })} placeholder="Notes for the team…" disabled={readOnly} />
              </Field>
              <div className="form-grid">
                <Field label="Service writer" htmlFor="sw">
                  <select id="sw" className="select" value={doc.writerId ?? ''} onChange={(e) => patch({ writerId: e.target.value ? Number(e.target.value) : null, writer: writers.find((w) => w.id === Number(e.target.value))?.displayName || '' })} disabled={readOnly}>
                    <option value="">Unassigned</option>
                    {writers.map((w) => <option key={w.id} value={w.id}>{w.displayName}{w.active ? '' : ' (inactive)'}</option>)}
                    {doc.writerId && !writers.some((w) => w.id === doc.writerId) && <option value={doc.writerId}>{doc.writer} (removed)</option>}
                  </select>
                </Field>
                <Field label="Technician" htmlFor="tech">
                  <select id="tech" className="select" value={doc.technicianId ?? ''} onChange={(e) => patch({ technicianId: e.target.value ? Number(e.target.value) : null, technician: techs.find((w) => w.id === Number(e.target.value))?.displayName || '' })} disabled={readOnly}>
                    <option value="">Unassigned</option>
                    {techs.map((w) => <option key={w.id} value={w.id}>{w.displayName}{w.active ? '' : ' (inactive)'}</option>)}
                    {doc.technicianId && !techs.some((w) => w.id === doc.technicianId) && <option value={doc.technicianId}>{doc.technician} (removed)</option>}
                  </select>
                </Field>
              </div>
              <Field label="Proposed completion" htmlFor="pd">
                <input id="pd" type="datetime-local" className="input" value={doc.promised} onChange={(e) => patch({ promised: e.target.value })} disabled={readOnly} />
              </Field>
              {doc.type !== 'estimate' && (
                <label className="switch-row small">
                  <span className="row gap-8"><Archive size={15} className="subtle" /><span><span className="strong">Save parts for inspection</span><span className="xs subtle" style={{ display: 'block' }}>Customer wants replaced parts returned</span></span></span>
                  <Switch checked={!!doc.saveParts} onChange={(v) => patch({ saveParts: v })} label="Save parts for inspection" />
                </label>
              )}
              {opts.showPaymentMethods && (opts.paymentMethods || []).length > 0 && (
                <div>
                  <div className="field-label">Intended method of payment</div>
                  <div className="row gap-6 wrap mt-4" role="group" aria-label="Intended method of payment">
                    {opts.paymentMethods.map((m) => <button key={m} className="chip" style={{ height: 28 }} aria-pressed={payMethods.includes(m)} disabled={readOnly} onClick={() => patch({ paymentMethods: payMethods.includes(m) ? payMethods.filter((x) => x !== m) : [...payMethods, m] })}>{PAYMENT_METHODS[m]}</button>)}
                  </div>
                </div>
              )}
              <button className={`auth-btn${doc.authorization?.approved ? ' ok' : doc.authorization ? ' no' : ''}`} onClick={guard(() => setModal('auth'))}>
                {doc.authorization?.approved ? <ShieldCheck size={18} /> : doc.authorization ? <ShieldX size={18} /> : <ShieldCheck size={18} />}
                <span className="grow" style={{ textAlign: 'left' }}>
                  <span className="strong">Authorization</span>
                  <span className="xs" style={{ display: 'block' }}>
                    {doc.authorization ? `${doc.authorization.approved ? 'Approved' : 'Declined'} by ${doc.authorization.by} · ${doc.authorization.method}` : 'Not yet authorized'}
                  </span>
                </span>
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="card totals">
              {totals.shopFees.map((f) => (
                <div key={f.id} className="t-row">
                  <span className="row gap-6">{f.name}<span className="xs subtle">{f.calcBy === 'percent' ? `(${f.percentage}%${f.minimum != null ? `, min ${money(f.minimum)}` : ''}${f.maximum != null ? `, max ${money(f.maximum)}` : ''})` : '(flat)'}</span></span>
                  <span className="row gap-8"><span className="num">{money(f.amount)}</span><Switch checked={!f.off} onChange={(v) => toggleFee(f.id, v)} label={`Charge ${f.name}`} /></span>
                </div>
              ))}
              <div className="t-row"><span>Discounts</span><span className="num" style={{ color: totals.discountTotal ? 'var(--success)' : undefined }}>−{money(totals.discountTotal)}</span></div>
              <div className="t-row sep"><span>Subtotal</span><span className="num">{money(totals.subtotal)}</span></div>
              {(snap.taxes || []).map((t) => {
                const on = taxIds.includes(t.id)
                const line = totals.taxes.find((x) => x.id === t.id)
                return (
                  <label key={t.id} className="t-row" style={{ cursor: readOnly ? 'default' : 'pointer' }}>
                    <span className="row gap-8"><input type="checkbox" className="checkbox" checked={on} onChange={() => toggleTax(t.id)} disabled={readOnly} aria-label={`Apply ${t.name}`} />{t.name} <span className="xs subtle">{t.rate}%{line ? ` of ${money(line.base)}` : ''}</span></span>
                    <span className="num">{on ? money(line?.amount) : '—'}</span>
                  </label>
                )
              })}
              {totals.taxes.length > 1 && <div className="t-row"><span>Total tax <span className="xs subtle">({totals.combinedRate}% combined)</span></span><span className="num">{money(totals.tax)}</span></div>}
              {(snap.taxes || []).length === 0 && <div className="t-row"><span className="small muted">No taxes were configured when this document was created</span><span /></div>}
              <div className="t-total"><span>Total</span><span className="num">{money(totals.total)}</span></div>
              {(doc.payments || []).length > 0 && (
                <div className="t-pay">
                  {doc.payments.map((p) => (
                    <div key={p.id} className="t-row">
                      <span className="small">{p.method} · {new Date(p.at).toLocaleDateString()}</span>
                      <span className="row gap-4"><span className="num">−{money(p.amount)}</span>{!readOnly && <button className="icon-btn sm" onClick={() => removePayment(doc.id, p.id)} aria-label="Remove payment"><X size={13} /></button>}</span>
                    </div>
                  ))}
                  <div className="t-row strong"><span>Balance due</span><span className="num" style={{ color: totals.balance > 0 ? 'var(--danger)' : 'var(--success)' }}>{money(totals.balance)}</span></div>
                </div>
              )}
              <div style={{ padding: 12 }} className="stack gap-8">
                <button className="btn btn-block deposit-btn" onClick={guard(() => setModal('pay'))} disabled={totals.balance <= 0 && !readOnly}><Wallet size={16} />{doc.type === 'invoice' ? 'Record payment' : 'Add deposit'}</button>
                <button className="btn btn-block btn-secondary" onClick={guard(() => setModal('paylink'))} disabled={totals.balance <= 0 && !readOnly} title="Create a Stripe Checkout link your customer can pay from any device"><CreditCard size={16} />Send online payment link</button>
                <button className="btn btn-block btn-secondary" onClick={guard(() => setModal('share'))} title="Share a read-only link with the customer"><LinkIcon size={16} />Share with customer</button>
              </div>
            </div>

            <div className="card card-pad">
              <dl className="sum-list">
                <div><dt>Planned hours</dt><dd className="num">{totals.laborHours}</dd></div>
                <div><dt>Labor</dt><dd className="num">{money(totals.labor)}</dd></div>
                <div><dt>Parts</dt><dd className="num">{money(totals.parts)}</dd></div>
                <div><dt>Fees</dt><dd className="num">{money(totals.fees + totals.shopFeesTotal)}</dd></div>
              </dl>
            </div>
          </aside>
        </div>
      </div>

      <div className="print-only"><DocumentSheet doc={doc} settings={bundle} /></div>

      {/* Modals */}
      {modal?.startsWith('add:') && <AddItemModal kind={modal.slice(4)} snap={snap} onClose={() => setModal(null)} onAdd={(item) => { addItem(doc.id, item); toast.success(`${KINDS[item.kind].label} added`, item.description) }} />}
      {modal === 'proc' && <ProcedurePicker snap={snap} onClose={() => setModal(null)} onAdd={(items) => { useShop.getState().addItems(doc.id, items); toast.success(`Added ${items.length} line${items.length > 1 ? 's' : ''}`, items[0].description) }} />}
      {(modal === 'auth' || modal === 'auth-convert') && (
        <AuthModal doc={doc} customer={customer} total={totals.total} converting={modal === 'auth-convert'} onClose={() => setModal(null)}
          onSave={(auth) => {
            updateDocument(doc.id, { authorization: auth, ...(auth.approved ? {} : { status: 'declined' }) })
            toast[auth.approved ? 'success' : 'warning'](auth.approved ? 'Work authorized' : 'Authorization declined', `${auth.by} · ${auth.method}`)
            if (modal === 'auth-convert' && auth.approved) convert('repair_order', { authorization: auth })
          }} />
      )}
      {modal === 'pay' && <PaymentModal balance={totals.balance} isInvoice={doc.type === 'invoice'} onClose={() => setModal(null)} onSave={(p) => {
        addPayment(doc.id, p)
        if (doc.type === 'invoice' && totals.balance - p.amount <= 0.004) updateDocument(doc.id, { status: 'paid' })
        toast.success(doc.type === 'invoice' ? 'Payment recorded' : 'Deposit added', `${money(p.amount)} · ${p.method}`)
      }} />}
      {modal === 'paylink' && (
        <PaymentLinkModal
          doc={doc}
          balance={totals.balance}
          customer={customer}
          onClose={() => setModal(null)}
          onPaid={() => { useShop.getState().loadDocuments?.(); toast.success('Payment received', 'The customer completed Stripe Checkout.') }}
        />
      )}
      {modal === 'share' && (
        <ShareLinkModal
          doc={doc}
          customer={customer}
          onClose={() => setModal(null)}
          onInspectionToggle={(v) => patch({ includeInspection: v })}
        />
      )}
      {modal === 'invoice' && <InvoiceModal doc={doc} unit={unit} onClose={() => setModal(null)} onConfirm={(mileageOut) => convert('invoice', { mileageOut })} />}
      {modal === 'cust' && <CustomerModal doc={doc} customers={customers} onClose={() => setModal(null)} onSave={(p, custPatch) => {
        const c = customers.find((x) => x.id === p.customerId)
        const v = useShop.getState().customers.find((x) => x.id === p.customerId)?.vehicles.find((x) => x.id === p.vehicleId)
        updateDocument(doc.id, { ...p, ...partySnapshots(c && { ...c, ...(custPatch || {}) }, v) })
        if (custPatch && p.customerId) updateCustomer(p.customerId, custPatch)
        toast.success('Document updated')
      }} />}
      {modal === 'recalc' && (
        <ConfirmDialog open onClose={() => setModal(null)} onConfirm={recalc} confirmLabel="Apply current settings"
          title="Apply current settings to this document?"
          body={`This replaces the settings captured when #${doc.number} was created (labor ${money(snap.laborRate)}/hr) with today's settings (labor ${money(bundle.laborRate?.rate)}/hr, current taxes, fees, markups and document options). Labor lines at the old rate and auto-priced parts are repriced.`} />
      )}
      {modal === 'history' && (
        <Modal open onClose={() => setModal(null)} title="Service history" description={vehicle ? vehicleLabel(vehicle) : 'No vehicle on this document'}>
          {vehicleDocs.length === 0 ? <p className="muted">No other documents for this vehicle.</p> : (
            <div className="stack gap-4">
              {vehicleDocs.map((d) => (
                <Link key={d.id} to={`/orders/${d.id}`} className="list-row" onClick={() => setModal(null)}>
                  <span className={`doc-type t-${d.type}`}>{DOC_TYPES[d.type].short}</span>
                  <span className="grow"><div className="strong small">#{d.number} · {d.items.filter((i) => i.kind === 'labor').map((i) => i.description).join(', ') || 'No labor'}</div><div className="xs subtle">{dateTime(d.createdAt)}{d.mileageIn ? ` · ${Number(d.mileageIn).toLocaleString()} ${d.odometerUnit}` : ''}</div></span>
                  <span className="small strong num">{money(computeTotals(d).total)}</span>
                </Link>
              ))}
            </div>
          )}
        </Modal>
      )}
      {modal === 'recalls' && (
        <Modal open onClose={() => setModal(null)} title="Open recalls" description={vehicle ? `${vehicleLabel(vehicle)}${vehicle.vin ? ` · VIN ${vehicle.vin}` : ''}` : 'Add a vehicle to check recalls'}>
          {!vehicle ? <p className="muted">Add a vehicle to this document first.</p> : (
            <div className="stack gap-8">
              {recalls.map((r) => (
                <Link key={r.id} to={`/bulletins/${r.id}`} className="related-card" onClick={() => setModal(null)}>
                  <ShieldAlert size={18} style={{ color: 'var(--danger)' }} />
                  <span className="grow"><span className="strong small">{r.number}: {r.title}</span><span className="xs subtle" style={{ display: 'block' }}>{r.summary}</span></span>
                  <ExternalLink size={14} />
                </Link>
              ))}
              <p className="xs subtle">Recall applicability is sample data. Verify against the manufacturer's VIN lookup.</p>
            </div>
          )}
        </Modal>
      )}
      <ConfirmDialog open={modal === 'delete'} onClose={() => setModal(null)} danger confirmLabel="Delete" title={`Delete ${DOC_TYPES[doc.type].label} #${doc.number}?`} body="This permanently removes the document and its line items. This cannot be undone."
        onConfirm={async () => { try { await deleteDocument(doc.id); toast.success('Document deleted', `#${doc.number}`); navigate('/orders') } catch (e) { toast.error('Could not delete', e.message) } }} />
      {modal?.startsWith('revert:') && (
        <ConfirmDialog open onClose={() => setModal(null)} title={`Change back to ${DOC_TYPES[modal.slice(7)].label}?`} body="Line items, pricing and payments are kept. Use this to correct a document converted by mistake." confirmLabel="Change type"
          onConfirm={() => { updateDocument(doc.id, { type: modal.slice(7), status: 'open' }); toast.info(`Changed to ${DOC_TYPES[modal.slice(7)].label}`) }} />
      )}
    </div>
  )
}

/* ---------- Line item row ---------- */
function LineItem({ it, idx, count, readOnly, totals, display, onChange, onRemove, onMove }) {
  const K = KINDS[it.kind]
  const num = (v) => v.replace(/[^\d.]/g, '')
  if (it.kind === 'note') {
    return (
      <li className="li note">
        <span className="li-kind" title={K.label}><span className={`icon-tile sm ${K.tone}`} aria-label={K.label}><K.icon size={15} /></span><span className="li-kind-l">Note</span></span>
        <textarea className="li-input li-note" rows={1} value={it.description} onChange={(e) => onChange({ description: e.target.value })} disabled={readOnly} aria-label="Note text" />
        <RowTools idx={idx} count={count} readOnly={readOnly} onMove={onMove} onRemove={onRemove} />
      </li>
    )
  }
  if (it.kind === 'discount') {
    const amt = totals.discounts.find((d) => d.id === it.id)?.amount || 0
    return (
      <li className="li">
        <span className="li-kind" title={K.label}><span className={`icon-tile sm ${K.tone}`} aria-label={K.label}><K.icon size={15} /></span><span className="li-kind-l">Discount</span></span>
        <span className="li-desc">
          <input className="li-input" value={it.description} onChange={(e) => onChange({ description: e.target.value })} disabled={readOnly} aria-label="Discount description" />
          <span className="row gap-6 mt-4 wrap">
            <select className="li-mini" value={it.appliesTo} onChange={(e) => onChange({ appliesTo: e.target.value })} disabled={readOnly} aria-label="Applies to"><option value="labor">On labor</option><option value="parts">On parts</option><option value="all">On all</option></select>
            <select className="li-mini" value={it.mode} onChange={(e) => onChange({ mode: e.target.value })} disabled={readOnly} aria-label="Discount type"><option value="percent">Percent</option><option value="amount">Amount</option></select>
          </span>
        </span>
        <span className="li-qty"><input className="li-input num" value={it.value} onChange={(e) => onChange({ value: num(e.target.value) })} disabled={readOnly} aria-label={it.mode === 'percent' ? 'Percent' : 'Amount'} /><span className="xs subtle">{it.mode === 'percent' ? '%' : '$'}</span></span>
        <span className="li-price" />
        <span className="li-total num" style={{ color: 'var(--success)' }}>−{money(amt)}</span>
        <span className="li-tax" />
        <RowTools idx={idx} count={count} readOnly={readOnly} onMove={onMove} onRemove={onRemove} />
      </li>
    )
  }
  const econ = it.kind === 'part' && display.markupDetails ? partEconomics(it) : null
  return (
    <li className="li">
      <span className="li-kind" title={K.label}><span className={`icon-tile sm ${K.tone}`} aria-label={K.label}><K.icon size={15} /></span><span className="li-kind-l">{K.label}</span></span>
      <span className="li-desc">
        <input className="li-input" value={it.description} onChange={(e) => onChange({ description: e.target.value })} disabled={readOnly} aria-label="Description" />
        <span className="row gap-8 mt-4 wrap xs subtle">
          {it.kind === 'part' && display.partDetails && <input className="li-mini mono" value={it.partNumber || ''} onChange={(e) => onChange({ partNumber: e.target.value })} placeholder="Part #" disabled={readOnly} aria-label="Part number" style={{ width: 130 }} />}
          {it.kind === 'part' && display.markupDetails && <input className="li-mini" value={it.vendor || ''} onChange={(e) => onChange({ vendor: e.target.value })} placeholder="Vendor" disabled={readOnly} aria-label="Vendor" style={{ width: 110 }} />}
          {it.kind === 'part' && display.markupDetails && (
            <span className="row gap-4">Cost $<input className="li-mini num" value={it.cost ?? ''} onChange={(e) => onChange({ cost: num(e.target.value), autoPrice: false })} placeholder="0.00" disabled={readOnly} aria-label="Unit cost" style={{ width: 70 }} /></span>
          )}
          {econ && <span className="econ">Markup {money(econ.markup)} ({econ.markupPct}%) · Margin {econ.marginPct}%</span>}
          {it.kind === 'labor' && <span>{it.procedure ? <Link to={`/repair/${it.procedure}`}>View procedure ›</Link> : 'Custom labor'}</span>}
        </span>
      </span>
      <span className="li-qty"><input className="li-input num" value={it.qty} onChange={(e) => onChange({ qty: num(e.target.value) })} disabled={readOnly} aria-label={it.kind === 'labor' ? 'Hours' : 'Quantity'} /></span>
      <span className="li-price"><input className="li-input num" value={it.price} onChange={(e) => onChange({ price: num(e.target.value), autoPrice: false })} disabled={readOnly} aria-label="Price" /></span>
      <span className="li-total num strong">{money(lineTotal(it))}</span>
      <span className="li-tax"><input type="checkbox" className="checkbox" checked={!!it.taxable} onChange={(e) => onChange({ taxable: e.target.checked })} disabled={readOnly} aria-label="Taxable" /></span>
      <RowTools idx={idx} count={count} readOnly={readOnly} onMove={onMove} onRemove={onRemove} />
    </li>
  )
}

function RowTools({ idx, count, readOnly, onMove, onRemove }) {
  if (readOnly) return <span />
  return (
    <span className="li-tools">
      <button className="icon-btn sm" onClick={() => onMove(-1)} disabled={idx === 0} aria-label="Move up"><ChevronUp size={15} /></button>
      <button className="icon-btn sm" onClick={() => onMove(1)} disabled={idx === count - 1} aria-label="Move down"><ChevronDown size={15} /></button>
      <button className="icon-btn sm" onClick={onRemove} aria-label="Remove line"><X size={15} /></button>
    </span>
  )
}

/* ---------- Add item (priced with this document's frozen settings) ---------- */
function AddItemModal({ kind, snap, onClose, onAdd }) {
  const K = KINDS[kind]
  const partsMarkup = (snap.markups || []).find((m) => m.appliesTo === 'parts')
  const laborRate = applyMarkup(snap.laborRate || 0, snap.markups, 'labor')
  const [f, setF] = useState({
    description: kind === 'discount' ? 'Discount' : '',
    qty: kind === 'labor' ? '1.0' : '1',
    price: kind === 'labor' ? String(laborRate) : '',
    cost: '',
    partNumber: '',
    taxable: kind !== 'labor' || (snap.taxes || []).some((t) => t.appliesLabor),
    mode: 'percent', value: '10', appliesTo: 'labor',
  })
  const [priceTouched, setPriceTouched] = useState(false)
  const [sub, setSub] = useState(false)
  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setF((x) => {
      const n = { ...x, [k]: v }
      // Selling price follows cost × markup until the user types a price.
      if (k === 'cost' && kind === 'part' && !priceTouched && Number(v) > 0) n.price = String(applyMarkup(Number(v), snap.markups, 'parts'))
      return n
    })
    if (k === 'price') setPriceTouched(true)
  }
  const errs = {
    description: !f.description.trim() ? (kind === 'note' ? 'Enter the note text.' : 'Enter a description.') : '',
    qty: ['labor', 'part', 'fee'].includes(kind) && !(Number(f.qty) > 0) ? 'Must be greater than 0.' : '',
    price: ['labor', 'part', 'fee'].includes(kind) && (f.price === '' || Number(f.price) < 0 || isNaN(Number(f.price))) ? 'Enter a valid price.' : '',
    value: kind === 'discount' && (!(Number(f.value) > 0) || (f.mode === 'percent' && Number(f.value) > 100)) ? (f.mode === 'percent' ? 'Enter 1–100%.' : 'Enter an amount.') : '',
  }
  const e = (k) => sub && errs[k]
  const submit = (ev) => {
    ev?.preventDefault()
    setSub(true)
    if (Object.values(errs).some(Boolean)) return
    const base = { kind, description: f.description.trim() }
    if (kind === 'note') onAdd({ ...base, qty: 0, price: 0 })
    else if (kind === 'discount') onAdd({ ...base, mode: f.mode, value: Number(f.value), appliesTo: f.appliesTo })
    else onAdd({ ...base, qty: Number(f.qty), price: Number(f.price), taxable: f.taxable, ...(kind === 'part' ? { partNumber: f.partNumber.trim(), cost: Number(f.cost) || 0, autoPrice: !priceTouched && Number(f.cost) > 0 } : {}) })
    onClose()
  }
  const preview = (Number(f.qty) || 0) * (Number(f.price) || 0)
  return (
    <Modal open onClose={onClose} title={`Add ${K.label.toLowerCase()}`}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit}><Plus size={16} />Add {K.label.toLowerCase()}</button></>}>
      <form className="stack gap-16" onSubmit={submit} noValidate>
        <Field label={kind === 'note' ? 'Note' : 'Description'} required htmlFor="ai-d" error={e('description')} hint={kind === 'note' ? 'Notes print on the customer copy.' : undefined}>
          {kind === 'note'
            ? <textarea id="ai-d" className="textarea" value={f.description} onChange={set('description')} placeholder="e.g. Customer provided part (used)." data-autofocus />
            : <input id="ai-d" className={`input${e('description') ? ' invalid' : ''}`} value={f.description} onChange={set('description')} placeholder={kind === 'labor' ? 'e.g. Replace front window regulator' : kind === 'part' ? 'e.g. Window regulator assembly' : kind === 'fee' ? 'e.g. Diagnostic fee' : ''} data-autofocus />}
        </Field>
        {['labor', 'part', 'fee'].includes(kind) && (
          <div className="form-grid">
            {kind === 'part' && <Field label="Part number" htmlFor="ai-pn"><input id="ai-pn" className="input mono" value={f.partNumber} onChange={set('partNumber')} placeholder="Optional" /></Field>}
            {kind === 'part' && <Field label="Unit cost ($)" htmlFor="ai-c" hint={partsMarkup ? `Price = cost + ${partsMarkup.calcType === 'percent' ? `${partsMarkup.percentage}%` : money(partsMarkup.amount)} markup` : 'No parts markup on this document'}><input id="ai-c" className="input num" inputMode="decimal" value={f.cost} onChange={set('cost')} placeholder="Optional — internal only" /></Field>}
            <Field label={kind === 'labor' ? 'Hours' : 'Quantity'} required htmlFor="ai-q" error={e('qty')}><input id="ai-q" className={`input num${e('qty') ? ' invalid' : ''}`} inputMode="decimal" value={f.qty} onChange={set('qty')} /></Field>
            <Field label={kind === 'labor' ? 'Rate ($/hr)' : 'Unit price ($)'} required htmlFor="ai-p" error={e('price')} hint={kind === 'labor' ? `This document's labor rate is ${money(snap.laborRate)}/hr` : undefined}><input id="ai-p" className={`input num${e('price') ? ' invalid' : ''}`} inputMode="decimal" value={f.price} onChange={set('price')} placeholder="0.00" /></Field>
            <label className="row gap-8 small span-2"><input type="checkbox" className="checkbox" checked={f.taxable} onChange={set('taxable')} />Taxable</label>
            <div className="span-2 row between callout callout-info" style={{ padding: '10px 14px' }}><span>Line total</span><strong className="num">{money(preview)}</strong></div>
          </div>
        )}
        {kind === 'discount' && (
          <div className="form-grid">
            <Field label="Type" htmlFor="ai-m"><select id="ai-m" className="select" value={f.mode} onChange={set('mode')}><option value="percent">Percent (%)</option><option value="amount">Fixed amount ($)</option></select></Field>
            <Field label={f.mode === 'percent' ? 'Percent' : 'Amount'} required htmlFor="ai-v" error={e('value')}><input id="ai-v" className={`input num${e('value') ? ' invalid' : ''}`} inputMode="decimal" value={f.value} onChange={set('value')} /></Field>
            <Field label="Applies to" htmlFor="ai-a" className="span-2"><select id="ai-a" className="select" value={f.appliesTo} onChange={set('appliesTo')}><option value="labor">Labor</option><option value="parts">Parts</option><option value="all">Entire order</option></select></Field>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function ProcedurePicker({ snap, onClose, onAdd }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [withParts, setWithParts] = useState(true)
  const rate = applyMarkup(snap.laborRate || 0, snap.markups, 'labor')
  const list = PROCEDURES.filter((p) => `${p.title} ${p.system} ${p.keywords.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
  const add = (p = sel) => {
    if (!p) return
    onAdd([
      { kind: 'labor', description: p.title, qty: p.laborHours, price: rate, taxable: (snap.taxes || []).some((t) => t.appliesLabor), procedure: p.id, useDocRate: true },
      ...(withParts ? p.parts.map((x) => ({ kind: 'part', description: x.name, partNumber: x.number, qty: x.qty, price: x.price, taxable: true })) : []),
    ])
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="lg" title="Add from Repair Info" description={`Labor time from the procedure at this document's rate of ${money(rate)}/hr.`}
      footer={<>
        <label className="row gap-8 small" style={{ marginRight: 'auto' }}><input type="checkbox" className="checkbox" checked={withParts} onChange={(e) => setWithParts(e.target.checked)} />Include parts</label>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => add()} disabled={!sel}><Plus size={16} />Add</button>
      </>}>
      <div className="stack gap-12">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search procedures (e.g. alternator, brake pads)…" aria-label="Search procedures" data-autofocus />
        <div className="stack gap-4" role="listbox" aria-label="Procedures" style={{ maxHeight: 340, overflowY: 'auto' }}>
          {list.map((p) => (
            <button key={p.id} role="option" aria-selected={sel?.id === p.id} className={`radio-card${sel?.id === p.id ? ' on' : ''}`} onClick={() => setSel(p)} onDoubleClick={() => add(p)}>
              <Wrench size={16} />
              <span className="grow" style={{ textAlign: 'left' }}><div className="strong small">{p.title}</div><div className="xs subtle">{GROUP_INDEX[p.group].label} · {p.laborHours} hr · {p.parts.length} parts</div></span>
              <span className="small strong num">{money(p.laborHours * rate + (withParts ? p.parts.reduce((a, x) => a + x.qty * x.price, 0) : 0))}</span>
            </button>
          ))}
          {list.length === 0 && <p className="muted small">No procedures match “{q}”.</p>}
        </div>
      </div>
    </Modal>
  )
}

function AuthModal({ doc, customer, total, converting, onClose, onSave }) {
  const [f, setF] = useState({ by: doc.authorization?.by || customer?.name || '', method: doc.authorization?.method || 'Phone', limit: '' })
  const [sub, setSub] = useState(false)
  const err = !f.by.trim() ? 'Enter who authorized the work.' : ''
  const save = (approved) => {
    setSub(true)
    if (err) return
    onSave({ approved, by: f.by.trim(), method: f.method, limit: f.limit, amount: total, at: Date.now() })
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Authorization details" description={converting ? 'Work must be authorized before converting to a repair order.' : `Estimate total ${money(total)}`}
      footer={<><button className="btn btn-secondary" onClick={() => save(false)}><ShieldX size={16} />Declined</button><button className="btn btn-primary" onClick={() => save(true)}><ShieldCheck size={16} />{converting ? 'Approve & convert' : 'Approved'}</button></>}>
      <div className="stack gap-16">
        {doc.authorization && <div className={`callout ${doc.authorization.approved ? 'callout-success' : 'callout-danger'}`}><CalendarClock size={18} /><div>{doc.authorization.approved ? 'Approved' : 'Declined'} by <strong>{doc.authorization.by}</strong> via {doc.authorization.method} on {dateTime(doc.authorization.at)}</div></div>}
        <Field label="Authorized by" required htmlFor="au-by" error={sub && err}><input id="au-by" className={`input${sub && err ? ' invalid' : ''}`} value={f.by} onChange={(e) => setF({ ...f, by: e.target.value })} placeholder="Customer name" data-autofocus /></Field>
        <Field label="Method" htmlFor="au-m"><select id="au-m" className="select" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{['Phone', 'In person', 'Text message', 'Email', 'Signed estimate'].map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Approved limit (optional)" htmlFor="au-l" hint="Call the customer before exceeding this amount."><input id="au-l" className="input num" inputMode="decimal" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value.replace(/[^\d.]/g, '') })} placeholder={total.toFixed(2)} /></Field>
      </div>
    </Modal>
  )
}

function PaymentModal({ balance, isInvoice, onClose, onSave }) {
  const [f, setF] = useState({ amount: balance > 0 ? balance.toFixed(2) : '', method: 'Card', ref: '' })
  const [sub, setSub] = useState(false)
  const amt = Number(f.amount)
  const err = balance <= 0 ? 'Nothing is due on this document.' : !(amt > 0) ? 'Enter an amount greater than $0.' : amt > balance + 0.001 ? `Cannot exceed the balance of ${money(balance)}.` : ''
  const save = (e) => { e?.preventDefault(); setSub(true); if (err) return; onSave({ amount: Math.round(amt * 100) / 100, method: f.method, ref: f.ref }); onClose() }
  return (
    <Modal open onClose={onClose} title={isInvoice ? 'Record payment' : 'Add deposit'} description={`Balance due ${money(balance)}`}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}><Wallet size={16} />Save</button></>}>
      <form className="stack gap-16" onSubmit={save} noValidate>
        <Field label="Amount ($)" required htmlFor="pm-a" error={sub && err}><input id="pm-a" className={`input input-lg num${sub && err ? ' invalid' : ''}`} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} data-autofocus /></Field>
        <div className="segmented" role="group" aria-label="Payment method">
          {['Card', 'Cash', 'Check', 'Financing'].map((m) => <button type="button" key={m} aria-pressed={f.method === m} onClick={() => setF({ ...f, method: m })}>{m}</button>)}
        </div>
        <Field label="Reference (optional)" htmlFor="pm-r"><input id="pm-r" className="input" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value.slice(0, 100) })} placeholder="Last 4, check #…" /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function InvoiceModal({ doc, unit, onClose, onConfirm }) {
  const [mo, setMo] = useState(doc.mileageOut || doc.mileageIn || '')
  const [sub, setSub] = useState(false)
  const err = !mo ? 'Enter the odometer reading out.' : doc.mileageIn && Number(mo) < Number(doc.mileageIn) ? `Must be at least odometer in (${Number(doc.mileageIn).toLocaleString()} ${unit}).` : ''
  return (
    <Modal open onClose={onClose} title="Convert to invoice" description="Record the odometer reading out to finalize the repair order."
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={async () => { setSub(true); if (!err) { await flushSaves(); onConfirm(mo); onClose() } }}><Receipt size={16} />Create invoice</button></>}>
      <Field label={`Odometer out (${unit})`} required htmlFor="inv-mo" error={sub && err}><input id="inv-mo" className={`input input-lg num${sub && err ? ' invalid' : ''}`} inputMode="numeric" value={mo} onChange={(e) => setMo(e.target.value.replace(/\D/g, '').slice(0, 9))} data-autofocus /></Field>
      {!doc.technicianId && <div className="callout callout-warning mt-12"><Info size={18} /><div>No technician is assigned to this repair order.</div></div>}
    </Modal>
  )
}

function CustomerModal({ doc, customers, onClose, onSave }) {
  const [cid, setCid] = useState(doc.customerId || '')
  const [vid, setVid] = useState(doc.vehicleId || '')
  const current = useApp((s) => s.vehicle)
  const c = customers.find((x) => x.id === cid)
  const [email, setEmail] = useState(c?.email || '')
  const emailErr = email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? 'Enter a valid email address.' : ''
  const save = () => {
    if (emailErr) return
    let vehicleId = vid
    if (vid === '__current' && current && cid) vehicleId = useShop.getState().addCustomerVehicle(cid, { ...current, plate: '', mileage: '' }).id
    onSave({ customerId: cid, vehicleId: cid ? vehicleId : '' }, c && email !== c.email ? { email } : null)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Customer & vehicle"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="stack gap-16">
        <Field label="Customer" htmlFor="cm-c">
          <select id="cm-c" className="select" value={cid} onChange={(e) => { setCid(e.target.value); setVid(''); setEmail(customers.find((x) => x.id === e.target.value)?.email || '') }} data-autofocus>
            <option value="">Walk-in / no customer</option>
            {customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        {c && (
          <>
            <Field label="Vehicle" htmlFor="cm-v">
              <select id="cm-v" className="select" value={vid} onChange={(e) => setVid(e.target.value)}>
                <option value="">No vehicle</option>
                {c.vehicles.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}{v.plate ? ` · ${v.plate}` : ''}</option>)}
                {current && <option value="__current">Add current: {vehicleLabel(current)}</option>}
              </select>
            </Field>
            <Field label="Customer email" htmlFor="cm-e" error={emailErr} hint="Used for emailing estimates and invoices."><input id="cm-e" type="email" className={`input${emailErr ? ' invalid' : ''}`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></Field>
          </>
        )}
        <Link to="/customers" className="small" onClick={onClose}><Car size={13} style={{ verticalAlign: -2 }} /> Manage customers & vehicles ›</Link>
      </div>
    </Modal>
  )
}

function PaymentLinkModal({ doc, balance, customer, onClose, onPaid }) {
  const [email, setEmail] = useState(customer?.email || '')
  const [amount, setAmount] = useState(balance.toFixed(2))
  const [creating, setCreating] = useState(false)
  const [intent, setIntent] = useState(null) // { url, intentId, amount, provider }
  const [err, setErr] = useState('')
  const [polling, setPolling] = useState(false)
  const [status, setStatus] = useState('pending')

  const create = async () => {
    setCreating(true); setErr('')
    try {
      const res = await api(`/documents/${doc.id}/payment-link`, {
        method: 'POST',
        body: { provider: 'stripe', amount, customerEmail: email.trim() },
      })
      setIntent(res); setStatus('pending'); setPolling(true)
    } catch (e) {
      setErr(e.message)
    } finally { setCreating(false) }
  }

  // Poll the server every 3s after a link is created, so the shop sees the
  // moment the customer completes Stripe Checkout. Stops when success/cancel/error.
  useMemo(() => undefined, [])
  useEffect(() => {
    if (!polling || !intent?.intentId) return
    let alive = true
    const tick = async () => {
      try {
        const r = await api(`/payment-intents/${intent.intentId}`)
        if (!alive) return
        setStatus(r.status)
        if (r.status === 'succeeded') { setPolling(false); onPaid?.() }
        else if (r.status === 'failed' || r.status === 'cancelled') setPolling(false)
      } catch {/* keep polling */}
    }
    const id = setInterval(tick, 3000); tick()
    return () => { alive = false; clearInterval(id) }
  }, [polling, intent?.intentId])

  const copy = async () => {
    try { await navigator.clipboard.writeText(intent.url); toast.success('Link copied') }
    catch { toast.error('Copy failed', 'Select the link and copy manually.') }
  }

  const emailBody = intent ? `Hi${customer?.name ? ' ' + customer.name.split(' ')[0] : ''},\n\nYou can pay ${money(Number(intent.amount))} for ${DOC_TYPES[doc.type]?.label || 'your service'} #${doc.number} securely online here:\n\n${intent.url}\n\nThanks!` : ''
  const smsBody = intent ? `Pay ${money(Number(intent.amount))} for #${doc.number}: ${intent.url}` : ''

  return (
    <Modal open onClose={onClose} title="Send online payment link" description="The customer pays through Stripe Checkout. Their card never touches TorqueDesk.">
      {!intent && (
        <div className="stack gap-12">
          <Field label="Amount to charge" hint={`Balance due is ${money(balance)}.`}>
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Customer email (optional)" hint="Prefills Stripe Checkout so the customer gets a receipt.">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
          </Field>
          {err && <div className="callout callout-danger" role="alert">{err}</div>}
          <div className="row gap-8" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={creating}>Cancel</button>
            <button className="btn btn-primary" onClick={create} disabled={creating}>
              {creating ? <><Loader2 size={14} className="spin" />Creating…</> : <><LinkIcon size={14} />Create link</>}
            </button>
          </div>
        </div>
      )}
      {intent && (
        <div className="stack gap-12">
          <div className="callout" style={{ background: status === 'succeeded' ? 'rgba(34,197,94,0.08)' : 'rgba(37,99,235,0.08)', border: status === 'succeeded' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(37,99,235,0.3)' }}>
            {status === 'succeeded'
              ? <><Check size={16} /> Payment received — this document's balance has been updated.</>
              : status === 'failed' || status === 'cancelled'
                ? <><X size={16} /> Payment was {status}. You can create another link.</>
                : <><Loader2 size={14} className="spin" /> Waiting for the customer to pay…</>}
          </div>
          <Field label="Payment link" hint="Anyone with this link can pay. Expires after 24 hours.">
            <div className="input-wrap">
              <input className="input" value={intent.url} readOnly onFocus={(e) => e.target.select()} style={{ paddingRight: 44 }} />
              <button type="button" className="icon-btn sm" style={{ position: 'absolute', right: 4 }} onClick={copy} aria-label="Copy link"><Copy size={14} /></button>
            </div>
          </Field>
          <div className="row gap-8 wrap">
            <a className="btn btn-secondary" href={`mailto:${encodeURIComponent(email || '')}?subject=${encodeURIComponent('Payment link — ' + (DOC_TYPES[doc.type]?.label || 'document') + ' #' + doc.number)}&body=${encodeURIComponent(emailBody)}`}><Mail size={14} />Email customer</a>
            <a className="btn btn-secondary" href={`sms:?&body=${encodeURIComponent(smsBody)}`}><MessageSquare size={14} />Text message</a>
            <a className="btn btn-secondary" href={intent.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open in new tab</a>
          </div>
          <div className="row gap-8" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ShareLinkModal({ doc, customer, onClose, onInspectionToggle }) {
  const [link, setLink] = useState(null) // { url, token, viewCount, lastViewedAt }
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [include, setInclude] = useState(doc.includeInspection) // true | false | null (= inherit)

  useEffect(() => {
    (async () => {
      try { setLink(await api(`/documents/${doc.id}/share-link`)) }
      catch (e) { setErr(e.message) }
      finally { setLoading(false) }
    })()
  }, [doc.id])

  const create = async () => {
    setBusy(true); setErr('')
    try { setLink(await api(`/documents/${doc.id}/share-link`, { method: 'POST' })) }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }
  const revoke = async () => {
    if (!confirm('Revoke this link? Anyone with the old URL will no longer be able to view this document.')) return
    setBusy(true); setErr('')
    try {
      await api(`/documents/${doc.id}/share-link`, { method: 'DELETE' })
      setLink(null); toast.success('Share link revoked')
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(link.url); toast.success('Link copied') }
    catch { toast.error('Copy failed', 'Select the link and copy manually.') }
  }

  const updateInclude = (v) => { setInclude(v); onInspectionToggle(v) }

  const docLabel = (DOC_TYPES[doc.type]?.label || 'document') + ' #' + doc.number
  const emailBody = link ? `Hi${customer?.name ? ' ' + customer.name.split(' ')[0] : ''},\n\nHere is your ${docLabel.toLowerCase()}:\n\n${link.url}\n\nThanks!` : ''
  const smsBody = link ? `Your ${docLabel.toLowerCase()}: ${link.url}` : ''

  return (
    <Modal open onClose={onClose} title="Share with customer" description="Creates a read-only link your customer can open from any device. No login needed. You can revoke it any time.">
      <div className="stack gap-12">
        <div className="callout" style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.3)' }}>
          <strong>Include Vehicle Inspection Report</strong>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Shown on the customer link when a completed inspection exists for this vehicle. Overrides the shop default for this {DOC_TYPES[doc.type]?.label?.toLowerCase() || 'document'} only.</div>
          <div className="row gap-6 mt-8">
            <button type="button" className="btn btn-sm" style={{ background: include === null ? '#dbeafe' : 'transparent', color: include === null ? '#1e40af' : 'var(--text-2)', border: '1px solid var(--border, #e5e7eb)' }} onClick={() => updateInclude(null)}>Use shop default</button>
            <button type="button" className="btn btn-sm" style={{ background: include === true ? '#d1fae5' : 'transparent', color: include === true ? '#065f46' : 'var(--text-2)', border: '1px solid var(--border, #e5e7eb)' }} onClick={() => updateInclude(true)}>Include</button>
            <button type="button" className="btn btn-sm" style={{ background: include === false ? '#fee2e2' : 'transparent', color: include === false ? '#991b1b' : 'var(--text-2)', border: '1px solid var(--border, #e5e7eb)' }} onClick={() => updateInclude(false)}>Don't include</button>
          </div>
        </div>

        {loading ? <div className="muted">Loading…</div>
         : link ? (
          <>
            <Field label="Public link" hint={`Views: ${link.viewCount}${link.lastViewedAt ? ' · Last viewed ' + new Date(link.lastViewedAt).toLocaleString() : ''}`}>
              <div className="input-wrap">
                <input className="input" value={link.url} readOnly onFocus={(e) => e.target.select()} style={{ paddingRight: 44 }} />
                <button type="button" className="icon-btn sm" style={{ position: 'absolute', right: 4 }} onClick={copy} aria-label="Copy link"><Copy size={14} /></button>
              </div>
            </Field>
            <div className="row gap-8 wrap">
              <a className="btn btn-secondary" href={`mailto:${encodeURIComponent(customer?.email || '')}?subject=${encodeURIComponent(docLabel)}&body=${encodeURIComponent(emailBody)}`}><Mail size={14} />Email customer</a>
              <a className="btn btn-secondary" href={`sms:?&body=${encodeURIComponent(smsBody)}`}><MessageSquare size={14} />Text message</a>
              <a className="btn btn-secondary" href={link.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />Preview</a>
            </div>
          </>
         ) : (
          <div className="muted">No active link yet.</div>
         )}

        {err && <div className="callout callout-danger" role="alert">{err}</div>}

        <div className="row gap-8" style={{ justifyContent: 'flex-end' }}>
          {link
            ? <button className="btn btn-ghost" onClick={revoke} disabled={busy}><Trash2 size={14} />Revoke link</button>
            : <button className="btn btn-primary" onClick={create} disabled={busy}><LinkIcon size={14} />{busy ? 'Creating…' : 'Create link'}</button>}
          <button className="btn btn-ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  )
}

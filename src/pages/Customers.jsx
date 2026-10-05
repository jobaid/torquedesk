import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { UserPlus, Users, ArrowLeft, Phone, Mail, MapPin, Car, Trash2, Plus, FilePlus2, Pencil, BookOpen } from 'lucide-react'
import { useShop, DOC_TYPES } from '../store/useShop'
import { useApp, toast } from '../store/useApp'
import { useSettings, activeStaff } from '../store/useSettings'
import DataTable from '../components/ui/DataTable'
import Modal, { ConfirmDialog } from '../components/ui/Modal'
import { EmptyState, Field } from '../components/ui'
import VehicleWizard from '../components/vehicle/VehicleWizard'
import NewDocumentModal from '../components/documents/NewDocumentModal'
import { vehicleLabel } from '../data/vehicles'
import { computeTotals } from '../lib/totals'
import { money, formatPhone, dateTime, initials } from '../lib/format'

export default function Customers() {
  const { id } = useParams()
  return <div className="page">{id ? <Detail id={id} /> : <List />}</div>
}

function List() {
  const customers = useShop((s) => s.customers)
  const docs = useShop((s) => s.documents)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const rows = customers.map((c) => ({ ...c, vehicleCount: c.vehicles.length, docCount: docs.filter((d) => d.customerId === c.id).length, vehiclesText: c.vehicles.map(vehicleLabel).join(', ') }))
  const columns = [
    { key: 'name', label: 'Customer', sortable: true, render: (c) => <span className="row gap-12"><span className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{initials(c.name)}</span><span><div className="strong">{c.name}</div><div className="xs subtle">{c.email || 'No email'}</div></span></span> },
    { key: 'phone', label: 'Phone', render: (c) => <span className="nowrap">{c.phone || '—'}</span> },
    { key: 'vehiclesText', label: 'Vehicles', render: (c) => <span className="small muted clamp-1">{c.vehiclesText || '—'}</span> },
    { key: 'docCount', label: 'Documents', sortable: true, align: 'right' },
    { key: 'createdAt', label: 'Customer since', sortable: true, align: 'right', render: (c) => <span className="small nowrap">{new Date(c.createdAt).toLocaleDateString()}</span> },
  ]
  return (
    <>
      <div className="page-head">
        <div><h1>Customers</h1><p>{customers.length} customers on file.</p></div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}><UserPlus size={16} />Add customer</button>
      </div>
      {customers.length === 0 ? (
        <div className="card"><EmptyState icon={Users} title="No customers yet" action={<button className="btn btn-primary" onClick={() => setOpen(true)}><UserPlus size={16} />Add customer</button>}>Add your first customer to start writing estimates.</EmptyState></div>
      ) : (
        <DataTable rows={rows} columns={columns} searchKeys={['name', 'phone', 'email', 'vehiclesText']} onRowClick={(c) => navigate(`/customers/${c.id}`)} searchPlaceholder="Search name, phone, email or vehicle…" />
      )}
      {open && <CustomerForm onClose={() => setOpen(false)} onSaved={(c) => navigate(`/customers/${c.id}`)} />}
    </>
  )
}

function CustomerForm({ customer, onClose, onSaved }) {
  const addCustomer = useShop((s) => s.addCustomer)
  const updateCustomer = useShop((s) => s.updateCustomer)
  const [f, setF] = useState({ name: customer?.name || '', phone: customer?.phone || '', email: customer?.email || '', address: customer?.address || '', notes: customer?.notes || '', preferredWriterId: customer?.preferredWriterId ?? '' })
  const writers = activeStaff(useSettings((s) => s.data?.['service-writers']), customer?.preferredWriterId)
  const [sub, setSub] = useState(false)
  const errs = {
    name: !f.name.trim() ? 'Name is required.' : '',
    phone: !f.phone ? 'Phone is required.' : f.phone.replace(/\D/g, '').length !== 10 ? 'Enter a 10-digit phone number.' : '',
    email: f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email) ? 'Enter a valid email address.' : '',
  }
  const e = (k) => sub && errs[k]
  const set = (k) => (ev) => setF({ ...f, [k]: k === 'phone' ? formatPhone(ev.target.value) : ev.target.value })
  const save = async (ev) => {
    ev?.preventDefault()
    setSub(true)
    if (Object.values(errs).some(Boolean)) return
    const data = { ...f, name: f.name.trim(), email: f.email.trim(), preferredWriterId: f.preferredWriterId === '' ? null : Number(f.preferredWriterId) }
    try {
      if (customer) {
        await updateCustomer(customer.id, data)
        toast.success('Customer updated', data.name)
      } else {
        const c = await addCustomer(data)
        toast.success('Customer added', data.name)
        onSaved?.(c)
      }
      onClose()
    } catch (err) {
      // Addresses the bug where the previous sync version silently dropped
      // server failures (401/403/500) while telling the user the save worked.
      toast.error(customer ? 'Could not update customer' : 'Could not add customer', err.message)
    }
  }
  return (
    <Modal open onClose={onClose} title={customer ? 'Edit customer' : 'Add customer'}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save customer</button></>}>
      <form className="form-grid" onSubmit={save} noValidate>
        <Field label="Full name" required htmlFor="cf-n" error={e('name')} className="span-2"><input id="cf-n" className={`input${e('name') ? ' invalid' : ''}`} value={f.name} onChange={set('name')} placeholder="Jordan Lee" data-autofocus /></Field>
        <Field label="Mobile phone" required htmlFor="cf-p" error={e('phone')}><input id="cf-p" type="tel" className={`input${e('phone') ? ' invalid' : ''}`} value={f.phone} onChange={set('phone')} placeholder="(555) 555-0100" /></Field>
        <Field label="Email" htmlFor="cf-e" error={e('email')}><input id="cf-e" type="email" className={`input${e('email') ? ' invalid' : ''}`} value={f.email} onChange={set('email')} placeholder="name@example.com" /></Field>
        <Field label="Address" htmlFor="cf-a" className="span-2"><input id="cf-a" className="input" value={f.address} onChange={set('address')} placeholder="Street, city, state" /></Field>
        <Field label="Preferred service writer" htmlFor="cf-w" className="span-2" hint="Pre-selected on this customer's new documents.">
          <select id="cf-w" className="select" value={f.preferredWriterId ?? ''} onChange={(e) => setF({ ...f, preferredWriterId: e.target.value })}>
            <option value="">No preference</option>
            {writers.map((w) => <option key={w.id} value={w.id}>{w.displayName}{w.active ? '' : ' (inactive)'}</option>)}
          </select>
        </Field>
        <Field label="Notes" htmlFor="cf-no" className="span-2"><textarea id="cf-no" className="textarea" rows={2} value={f.notes} onChange={set('notes')} placeholder="Preferences, fleet info…" /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function Detail({ id }) {
  const c = useShop((s) => s.customers.find((x) => x.id === id))
  const docs = useShop((s) => s.documents)
  const { deleteCustomer, addCustomerVehicle, removeCustomerVehicle, updateCustomer } = useShop.getState()
  const can = useApp((s) => s.can)
  const setVehicle = useApp((s) => s.setVehicle)
  const navigate = useNavigate()
  const [modal, setModal] = useState(null)

  if (!c) return <div className="card"><EmptyState icon={Users} title="Customer not found" action={<Link to="/customers" className="btn btn-primary">All customers</Link>} /></div>
  const myDocs = docs.filter((d) => d.customerId === c.id).sort((a, b) => b.updatedAt - a.updatedAt)
  const lifetime = myDocs.filter((d) => d.type === 'invoice').reduce((a, d) => a + computeTotals(d).total, 0)

  return (
    <div className="stack gap-16">
      <div className="row between wrap gap-8">
        <Link to="/customers" className="btn btn-ghost btn-sm"><ArrowLeft size={15} />All customers</Link>
        <div className="row gap-8 wrap">
          <button className="btn btn-secondary" onClick={() => setModal('edit')}><Pencil size={16} />Edit</button>
          <button className="btn btn-secondary" onClick={() => (can('customers.edit') ? setModal('delete') : toast.error('Permission required', 'Your role cannot delete customers.'))}><Trash2 size={16} />Delete</button>
          <button className="btn btn-primary" onClick={() => setModal('doc')}><FilePlus2 size={16} />New estimate</button>
        </div>
      </div>
      <div className="card card-pad row gap-16 wrap">
        <span className="avatar lg">{initials(c.name)}</span>
        <div className="grow stack gap-4" style={{ minWidth: 220 }}>
          <h1>{c.name}</h1>
          <div className="row gap-16 wrap small">
            <a href={`tel:${c.phone.replace(/\D/g, '')}`} className="row gap-6"><Phone size={14} />{c.phone}</a>
            {c.email && <a href={`mailto:${c.email}`} className="row gap-6"><Mail size={14} />{c.email}</a>}
            {c.address && <span className="row gap-6 muted"><MapPin size={14} />{c.address}</span>}
          </div>
          {c.notes && <p className="small muted mt-4">{c.notes}</p>}
        </div>
        <div className="quick-stats" style={{ minWidth: 280 }}>
          <div><Car size={16} /><span className="strong">{c.vehicles.length}</span><span className="xs subtle">Vehicles</span></div>
          <div><FilePlus2 size={16} /><span className="strong">{myDocs.length}</span><span className="xs subtle">Documents</span></div>
          <div><Users size={16} /><span className="strong">{money(lifetime)}</span><span className="xs subtle">Invoiced</span></div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-header"><h3><Car size={17} />Vehicles</h3><button className="btn btn-soft btn-sm" onClick={() => setModal('veh')}><Plus size={15} />Add vehicle</button></div>
          <div style={{ padding: 6 }}>
            {c.vehicles.length === 0 && <p className="muted small" style={{ padding: 14 }}>No vehicles yet.</p>}
            {c.vehicles.map((v) => (
              <div key={v.id} className="row gap-8" style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                <span className="icon-tile sm"><Car size={15} /></span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="strong small">{vehicleLabel(v)}</div>
                  <div className="xs subtle">{[v.engineLabel, v.trim, v.plate].filter(Boolean).join(' · ')}</div>
                  <div className="row gap-8 mt-4">
                    <input className="li-mini mono" value={v.vin || ''} onChange={(e) => updateCustomer(c.id, { vehicles: c.vehicles.map((x) => (x.id === v.id ? { ...x, vin: e.target.value.toUpperCase().slice(0, 17) } : x)) })} placeholder="VIN" aria-label="VIN" style={{ width: 170 }} />
                    <input className="li-mini" value={v.plate || ''} onChange={(e) => updateCustomer(c.id, { vehicles: c.vehicles.map((x) => (x.id === v.id ? { ...x, plate: e.target.value.toUpperCase() } : x)) })} placeholder="Plate" aria-label="License plate" style={{ width: 100 }} />
                  </div>
                </div>
                <button className="icon-btn sm" onClick={() => { setVehicle(v); toast.success('Vehicle selected', vehicleLabel(v)); navigate('/repair') }} aria-label={`Open ${vehicleLabel(v)} in Repair Info`} title="Open in Repair Info"><BookOpen size={15} /></button>
                <button className="icon-btn sm" onClick={() => { removeCustomerVehicle(c.id, v.id); toast.info('Vehicle removed', vehicleLabel(v)) }} aria-label={`Remove ${vehicleLabel(v)}`}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-header"><h3><FilePlus2 size={17} />Documents</h3><span className="badge">{myDocs.length}</span></div>
          <div style={{ padding: 6 }}>
            {myDocs.length === 0 && <p className="muted small" style={{ padding: 14 }}>No estimates or invoices yet.</p>}
            {myDocs.map((d) => {
              const v = c.vehicles.find((x) => x.id === d.vehicleId)
              return (
                <Link key={d.id} to={`/orders/${d.id}`} className="list-row">
                  <span className={`doc-type t-${d.type}`}>{DOC_TYPES[d.type].short}</span>
                  <span className="grow" style={{ minWidth: 0 }}><div className="strong small">#{d.number} · {v ? vehicleLabel(v) : 'No vehicle'}</div><div className="xs subtle">{dateTime(d.updatedAt)}</div></span>
                  <span className="strong small num">{money(computeTotals(d).total)}</span>
                </Link>
              )
            })}
          </div>
        </section>
      </div>

      {modal === 'edit' && <CustomerForm customer={c} onClose={() => setModal(null)} />}
      {modal === 'doc' && <NewDocumentModal open presetCustomerId={c.id} onClose={() => setModal(null)} />}
      {modal === 'veh' && (
        <Modal open onClose={() => setModal(null)} size="lg" title="Add vehicle" description={`For ${c.name}`}>
          <VehicleWizard compact onSelect={(v) => { addCustomerVehicle(c.id, { ...v, plate: '', mileage: '' }); toast.success('Vehicle added', vehicleLabel(v)); setModal(null) }} />
        </Modal>
      )}
      <ConfirmDialog open={modal === 'delete'} onClose={() => setModal(null)} danger confirmLabel="Delete customer" title={`Delete ${c.name}?`} body={`Their ${myDocs.length} document(s) will remain but show as walk-in. This cannot be undone.`}
        onConfirm={() => { deleteCustomer(c.id); toast.success('Customer deleted', c.name); navigate('/customers') }} />
    </div>
  )
}

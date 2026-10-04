import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePlus2, UserPlus } from 'lucide-react'
import Modal from '../ui/Modal'
import { Field } from '../ui'
import { useShop, DOC_TYPES } from '../../store/useShop'
import { useSettings, activeStaff } from '../../store/useSettings'
import { useApp, toast } from '../../store/useApp'
import { vehicleLabel } from '../../data/vehicles'
import { formatPhone } from '../../lib/format'

export default function NewDocumentModal({ open, onClose, presetCustomerId = '' }) {
  const customers = useShop((s) => s.customers)
  const createDocument = useShop((s) => s.createDocument)
  const addCustomer = useShop((s) => s.addCustomer)
  const addCustomerVehicle = useShop((s) => s.addCustomerVehicle)
  const current = useApp((s) => s.vehicle)
  const navigate = useNavigate()
  const [type, setType] = useState('estimate')
  const [customerId, setCustomerId] = useState(presetCustomerId)
  const [vehicleId, setVehicleId] = useState('')
  const [newCust, setNewCust] = useState(false)
  const [nc, setNc] = useState({ name: '', phone: '' })
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const writers = activeStaff(useSettings((s) => s.data?.['service-writers']))
  const [writerId, setWriterId] = useState('')

  const customer = customers.find((c) => c.id === customerId)
  const ncErr = { name: !nc.name.trim() ? 'Customer name is required.' : '', phone: nc.phone && nc.phone.replace(/\D/g, '').length !== 10 ? 'Enter a 10-digit phone number.' : '' }

  const submit = async () => {
    setSubmitted(true)
    let cid = customerId
    if (newCust) {
      if (ncErr.name || ncErr.phone) return
      cid = addCustomer({ name: nc.name.trim(), phone: nc.phone, email: '', address: '' }).id
    }
    let vid = vehicleId
    if (vid === '__current' && current) vid = addCustomerVehicle(cid, { ...current, plate: '', mileage: '' }).id
    if (!cid) vid = ''
    setBusy(true)
    try {
      const doc = await createDocument({ type, customerId: cid, vehicleId: vid, status: 'open', writerId: writerId ? Number(writerId) : undefined })
      toast.success(`${DOC_TYPES[type].label} #${doc.number} created`)
      onClose()
      navigate(`/orders/${doc.id}`)
    } catch (e) {
      toast.error('Could not create document', e.message)
    } finally { setBusy(false) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create new document"
      description="Start an estimate, repair order or invoice."
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}><FilePlus2 size={16} />{busy ? 'Creating…' : 'Create'}</button></>}
    >
      <div className="stack gap-16">
        <div className="segmented" role="group" aria-label="Document type" style={{ alignSelf: 'flex-start' }}>
          {Object.entries(DOC_TYPES).filter(([k]) => k !== 'statement').map(([k, t]) => <button key={k} aria-pressed={type === k} onClick={() => setType(k)}>{t.label}</button>)}
        </div>

        {!newCust ? (
          <Field label="Customer" htmlFor="nd-cust" hint="Leave empty for a walk-in.">
            <div className="row gap-8">
              <select id="nd-cust" className="select grow" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setVehicleId('') }}>
                <option value="">Walk-in / no customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
              </select>
              <button className="btn btn-secondary" onClick={() => { setNewCust(true); setCustomerId('') }}><UserPlus size={16} />New</button>
            </div>
          </Field>
        ) : (
          <div className="stack gap-12 card card-pad" style={{ background: 'var(--surface-2)' }}>
            <div className="row between"><h4>New customer</h4><button className="btn btn-ghost btn-sm" onClick={() => setNewCust(false)}>Choose existing</button></div>
            <div className="form-grid">
              <Field label="Name" required htmlFor="nc-name" error={submitted && ncErr.name}><input id="nc-name" className={`input${submitted && ncErr.name ? ' invalid' : ''}`} value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="Full name" autoFocus /></Field>
              <Field label="Mobile" htmlFor="nc-phone" error={submitted && ncErr.phone}><input id="nc-phone" type="tel" className={`input${submitted && ncErr.phone ? ' invalid' : ''}`} value={nc.phone} onChange={(e) => setNc({ ...nc, phone: formatPhone(e.target.value) })} placeholder="(555) 555-0100" /></Field>
            </div>
          </div>
        )}

        {(customer || newCust) && (
          <Field label="Vehicle" htmlFor="nd-veh">
            <select id="nd-veh" className="select" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">No vehicle</option>
              {customer?.vehicles.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}{v.plate ? ` · ${v.plate}` : ''}</option>)}
              {current && <option value="__current">Current: {vehicleLabel(current)}</option>}
            </select>
          </Field>
        )}
        <Field label="Service writer" htmlFor="nd-writer" hint={customer?.preferredWriterId ? "Defaults to the customer’s preferred writer." : undefined}>
          <select id="nd-writer" className="select" value={writerId} onChange={(e) => setWriterId(e.target.value)}>
            <option value="">{customer?.preferredWriterId ? "Customer’s preferred writer" : 'Unassigned'}</option>
            {writers.map((w) => <option key={w.id} value={w.id}>{w.displayName} — {w.firstName} {w.lastName}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  )
}

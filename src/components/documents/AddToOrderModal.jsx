import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePlus2, FileText } from 'lucide-react'
import Modal from '../ui/Modal'
import { useShop, DOC_TYPES } from '../../store/useShop'
import { useApp, toast } from '../../store/useApp'
import { vehicleLabel } from '../../data/vehicles'
import { money } from '../../lib/format'

/**
 * Adds prepared line items to an open estimate / repair order, or a new estimate.
 * lines: [{ kind, description, qty, price, taxable, partNumber?, procedure? }]
 */
export default function AddToOrderModal({ open, onClose, lines, title = 'Add to repair order' }) {
  const allDocs = useShop((s) => s.documents)
  const docs = allDocs.filter((d) => d.type !== 'invoice')
  const customers = useShop((s) => s.customers)
  const createDocument = useShop((s) => s.createDocument)
  const addItems = useShop((s) => s.addItems)
  const addCustomerVehicle = useShop((s) => s.addCustomerVehicle)
  const vehicle = useApp((s) => s.vehicle)
  const can = useApp((s) => s.can)
  const navigate = useNavigate()
  const [target, setTarget] = useState('new')
  const [customerId, setCustomerId] = useState('')

  const total = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0)

  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!can('documents.edit')) { toast.error('Permission required', 'Your role cannot edit documents.'); return }
    let docId = target
    if (target === 'new') {
      let vehicleId = ''
      if (customerId && vehicle) {
        const c = customers.find((x) => x.id === customerId)
        const match = c?.vehicles.find((v) => v.year === vehicle.year && v.make === vehicle.make && v.model === vehicle.model)
        vehicleId = match ? match.id : addCustomerVehicle(customerId, { ...vehicle, plate: '', mileage: '' }).id
      }
      setBusy(true)
      try {
        const doc = await createDocument({ type: 'estimate', customerId, vehicleId, items: lines })
        toast.success(`Estimate #${doc.number} created`, `${lines.length} line${lines.length > 1 ? 's' : ''} added at the current rates`)
        onClose()
        navigate(`/orders/${doc.id}`)
      } catch (e) {
        toast.error('Could not create estimate', e.message)
      } finally { setBusy(false) }
      return
    }
    addItems(docId, lines)
    const doc = useShop.getState().documents.find((d) => d.id === docId)
    toast.success(`Added ${lines.length} line${lines.length > 1 ? 's' : ''}`, `${DOC_TYPES[doc.type].label} #${doc.number} · labor at this document's rate`)
    onClose()
    navigate(`/orders/${docId}`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={`${lines.length} line item${lines.length > 1 ? 's' : ''} · ${money(total)}`}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}><FilePlus2 size={16} />{busy ? 'Creating…' : 'Add items'}</button></>}
    >
      <div className="stack gap-12">
        <div className="table-wrap" style={{ maxHeight: 180 }}>
          <table className="table">
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td><span className="badge">{l.kind === 'labor' ? 'Labor' : l.kind === 'part' ? 'Part' : 'Fee'}</span></td>
                  <td>{l.description}</td>
                  <td className="num nowrap">{l.qty} × {money(l.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="section-title mt-8">Add to</div>
        <div className="stack gap-6" role="radiogroup" aria-label="Destination document">
          <label className={`radio-card${target === 'new' ? ' on' : ''}`}>
            <input type="radio" name="target" checked={target === 'new'} onChange={() => setTarget('new')} />
            <FilePlus2 size={18} />
            <span className="grow">
              <div className="strong">New estimate</div>
              <div className="xs subtle">{vehicle ? vehicleLabel(vehicle) : 'No vehicle selected'}</div>
            </span>
          </label>
          {target === 'new' && (
            <select className="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Customer">
              <option value="">Walk-in / no customer yet</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {docs.map((d) => {
            const c = customers.find((x) => x.id === d.customerId)
            return (
              <label key={d.id} className={`radio-card${target === d.id ? ' on' : ''}`}>
                <input type="radio" name="target" checked={target === d.id} onChange={() => setTarget(d.id)} />
                <FileText size={18} />
                <span className="grow">
                  <div className="strong">{DOC_TYPES[d.type].label} #{d.number}</div>
                  <div className="xs subtle">{c?.name || 'Walk-in'}</div>
                </span>
              </label>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

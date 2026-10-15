import { useState } from 'react'
import { api } from '../../lib/api'
import { useApp } from '../../store/useApp'
import { Search, Loader2, RefreshCw, Check, AlertTriangle } from 'lucide-react'

// Drop into the Repair Order parts editor:
//   <ComparePartsPrices
//      repairOrderId={ro.id}
//      vin={ro.vehicle?.vin}
//      initialTerm={line.description}
//      onSelect={(item) => applyPartToLine(line, item)}
//   />
//
// onSelect receives the chosen QuoteItem; the host component maps it onto
// the existing RO line (populating part number, description, cost).
export default function ComparePartsPrices({ repairOrderId, vin, initialTerm, onSelect }) {
  const features = useApp(s => s.features)
  const enabled = !features || features.parts_pricing
  const [term, setTerm] = useState(initialTerm || '')
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [quoteAt, setQuoteAt] = useState(null)

  if (!enabled) return null

  const run = async () => {
    if (!term.trim()) { setErr('Enter a part name or number'); return }
    setBusy(true); setErr(''); setItems([])
    try {
      const r = await api('/vintel/parts/quote', {
        method: 'POST',
        body: JSON.stringify({ repairOrderId: repairOrderId || '', vin: vin || '', searchTerm: term }),
      })
      setItems(r?.items || [])
      setQuoteAt(new Date())
      if ((r?.items || []).length === 0) setErr('No connected merchant returned a quote. Connect a provider under Settings → Vehicle Intel & Parts.')
    } catch (e) { setErr(e?.message || 'Quote failed') }
    finally { setBusy(false) }
  }

  const total = (it) => (Number(it.UnitPrice || it.unitPrice || 0) + Number(it.Core || it.core || 0) + Number(it.Shipping || it.shipping || 0) + Number(it.Fees || it.fees || 0))

  return (
    <div className="stack gap-12" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
      <div className="row gap-8" style={{ alignItems: 'center' }}>
        <strong>Compare parts prices</strong>
        {quoteAt && <span className="xs muted">retrieved {quoteAt.toLocaleTimeString()}</span>}
      </div>
      <div className="row gap-8">
        <input value={term} onChange={e => setTerm(e.target.value)} placeholder="Part name or number (e.g. front brake pads)" style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? <Loader2 size={14} className="spin" /> : <Search size={14} />} Compare
        </button>
      </div>
      {err && <div className="xs row gap-6" style={{ color: '#b45309' }}><AlertTriangle size={14} />{err}</div>}

      {items.length > 0 && (
        <table style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#64748b' }}>
              <th>Merchant</th><th>Part #</th><th>Description</th><th>Class</th><th>Price</th><th>Core</th><th>Ship</th><th>Avail.</th><th>Total</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ textTransform: 'capitalize' }}>{it.Provider || it.provider}</td>
                <td>{it.MerchantPartNo || it.merchantPartNo}</td>
                <td>{it.Description || it.description}</td>
                <td className="xs muted">{it.Classification || it.classification}</td>
                <td>${Number(it.UnitPrice || it.unitPrice || 0).toFixed(2)}</td>
                <td>${Number(it.Core || it.core || 0).toFixed(2)}</td>
                <td>${Number(it.Shipping || it.shipping || 0).toFixed(2)}</td>
                <td className="xs">{it.Availability || it.availability}</td>
                <td><strong>${total(it).toFixed(2)}</strong></td>
                <td><button className="btn btn-ghost xs" onClick={() => onSelect?.(it)}><Check size={14} /> Select</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {items.length > 0 && (
        <div className="xs muted row gap-6">
          <RefreshCw size={12} /> Prices expire after ~2 hours. Refresh before confirming the sale.
        </div>
      )}
    </div>
  )
}

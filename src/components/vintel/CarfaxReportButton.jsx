import { useState } from 'react'
import { api } from '../../lib/api'
import { useApp } from '../../store/useApp'
import { Car, ExternalLink, Loader2, AlertTriangle } from 'lucide-react'

// Drop into a vehicle detail page: <CarfaxReportButton vin={v.vin} vehicleId={v.id} />
// Gated client-side by the `vehicle_history` feature flag; the backend also enforces it.
export default function CarfaxReportButton({ vin, vehicleId }) {
  const features = useApp(s => s.features)
  const enabled = !features || features.vehicle_history
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  if (!enabled) return null

  const request = async () => {
    setBusy(true); setErr(''); setResult(null)
    try {
      const r = await api('/vintel/vehicle-history', {
        method: 'POST',
        body: JSON.stringify({ vin, vehicleId: vehicleId || '' }),
      })
      setResult(r)
    } catch (e) { setErr(e?.message || 'Failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="stack gap-6">
      <button className="btn btn-ghost" onClick={request} disabled={busy || !vin}>
        {busy ? <Loader2 size={14} className="spin" /> : <Car size={14} />} Request CARFAX report
      </button>
      {err && <div className="xs" style={{ color: '#dc2626' }}>{err}</div>}
      {result?.status === 'pending_authorization' && (
        <div className="xs row gap-6" style={{ color: '#b45309' }}>
          <AlertTriangle size={14} /> CARFAX partner credentials required. Connect your account under Settings → Vehicle Intel & Parts.
        </div>
      )}
      {result?.reportUrl && (
        <a className="btn btn-primary" href={result.reportUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Open report
        </a>
      )}
    </div>
  )
}

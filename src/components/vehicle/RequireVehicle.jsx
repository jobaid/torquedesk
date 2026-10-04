import { Car, ScanBarcode } from 'lucide-react'
import { useApp, useUI } from '../../store/useApp'
import { EmptyState } from '../ui'
import { vehicleLabel, vehicleSub } from '../../data/vehicles'

/** Renders children only when a vehicle is selected; otherwise a helpful empty state. */
export default function RequireVehicle({ children, what = 'vehicle-specific information' }) {
  const vehicle = useApp((s) => s.vehicle)
  const open = useUI((s) => s.openVehiclePicker)
  if (vehicle) return children
  return (
    <div className="card">
      <EmptyState
        icon={Car}
        title="Select a vehicle to get started"
        action={
          <div className="row gap-8 wrap" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={open}><Car size={16} />Select Vehicle</button>
            <button className="btn btn-secondary" onClick={open}><ScanBarcode size={16} />Enter VIN</button>
          </div>
        }
      >
        Choose a vehicle or enter a VIN to see {what}.
      </EmptyState>
    </div>
  )
}

/** Compact strip showing which vehicle the page applies to. */
export function VehicleContext() {
  const vehicle = useApp((s) => s.vehicle)
  const open = useUI((s) => s.openVehiclePicker)
  if (!vehicle) return null
  return (
    <div className="vehicle-context">
      <span className="icon-tile sm"><Car size={15} /></span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="strong">{vehicleLabel(vehicle)}</span>
        <span className="subtle small"> · {vehicleSub(vehicle)}</span>
      </span>
      <button className="btn btn-ghost btn-sm" onClick={open}>Change ›</button>
    </div>
  )
}

import { Car, Clock } from 'lucide-react'
import Modal from '../ui/Modal'
import VehicleWizard from './VehicleWizard'
import { useApp, useUI, toast } from '../../store/useApp'
import { vehicleLabel, vehicleSub } from '../../data/vehicles'
import { relTime } from '../../lib/format'

export default function VehiclePickerModal() {
  const open = useUI((s) => s.vehiclePickerOpen)
  const close = useUI((s) => s.closeVehiclePicker)
  const setVehicle = useApp((s) => s.setVehicle)
  const recent = useApp((s) => s.recentVehicles)
  const current = useApp((s) => s.vehicle)

  const choose = (v) => {
    setVehicle(v)
    close()
    toast.success('Vehicle selected', vehicleLabel(v))
  }

  return (
    <Modal open={open} onClose={close} size="lg" title="Select vehicle" description="Information throughout TorqueDesk is filtered to the vehicle you choose.">
      <div className="stack gap-24">
        {recent.length > 0 && (
          <div className="stack gap-8">
            <div className="section-title">Recent vehicles</div>
            <div className="recent-strip">
              {recent.slice(0, 4).map((v) => (
                <button key={v.id} className={`recent-pill${current?.id === v.id ? ' current' : ''}`} onClick={() => choose(v)}>
                  <Car size={16} />
                  <span style={{ minWidth: 0 }}>
                    <div className="strong small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vehicleLabel(v)}</div>
                    <div className="xs subtle row gap-4"><Clock size={11} />{relTime(v.lastUsed)} · {v.engineLabel}</div>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <VehicleWizard onSelect={choose} compact />
        {current && <p className="xs subtle">Currently working on: {vehicleLabel(current)} — {vehicleSub(current)}</p>}
      </div>
    </Modal>
  )
}

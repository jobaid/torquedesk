import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Copy, Star } from 'lucide-react'
import { SPECS, SPEC_CATEGORIES } from '../data/specs'
import RequireVehicle, { VehicleContext } from '../components/vehicle/RequireVehicle'
import DataTable from '../components/ui/DataTable'
import { useApp, toast } from '../store/useApp'
import { useLoading, SkeletonCard } from '../components/ui'

export default function Specifications() {
  const [params] = useSearchParams()
  const [cat, setCat] = useState('all')
  const loading = useLoading('specs', 300)
  const toggleFavorite = useApp((s) => s.toggleFavorite)
  const favorites = useApp((s) => s.favorites)
  const rows = SPECS.filter((s) => cat === 'all' || s.category === cat)

  const copy = async (s) => {
    try { await navigator.clipboard.writeText(`${s.item}: ${s.value} ${s.unit}`.trim()); toast.success('Copied to clipboard', `${s.item}: ${s.value} ${s.unit}`) }
    catch { toast.error('Copy failed', 'Clipboard access was blocked.') }
  }

  const columns = [
    { key: 'item', label: 'Specification', sortable: true, render: (s) => <span className="strong">{s.item}</span> },
    { key: 'value', label: 'Value', sortable: true, render: (s) => <span className="mono strong">{s.value} <span className="subtle">{s.unit}</span></span> },
    { key: 'note', label: 'Notes', render: (s) => <span className="small muted">{s.note || '—'}</span> },
    { key: 'category', label: 'Category', sortable: true, render: (s) => <span className="badge">{s.category}</span> },
    {
      key: 'actions', label: <span className="sr-only">Actions</span>, align: 'right',
      render: (s) => {
        const fav = favorites.some((f) => f.type === 'spec' && f.refId === s.id)
        return (
          <span className="row gap-4" style={{ justifyContent: 'flex-end' }}>
            <button className="icon-btn sm" onClick={() => copy(s)} aria-label={`Copy ${s.item}`}><Copy size={15} /></button>
            <button className="icon-btn sm" onClick={() => { const a = toggleFavorite({ type: 'spec', refId: s.id, title: s.item, subtitle: `${s.value} ${s.unit}`, path: `/specifications?q=${encodeURIComponent(s.item)}` }); toast[a ? 'success' : 'info'](a ? 'Added to favorites' : 'Removed from favorites', s.item) }} aria-label={fav ? `Remove ${s.item} from favorites` : `Save ${s.item}`} aria-pressed={fav}>
              <Star size={15} fill={fav ? '#f59e0b' : 'none'} color={fav ? '#f59e0b' : 'currentColor'} />
            </button>
          </span>
        )
      },
    },
  ]

  return (
    <div className="page">
      <RequireVehicle what="specifications">
        <div className="page-head"><div><h1>Specifications</h1><p>Fluids, torque, electrical, tune-up, brakes, tires and alignment.</p></div></div>
        <VehicleContext />
        <div className="row gap-8 wrap mt-16" role="group" aria-label="Category">
          <button className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>All <span className="count">{SPECS.length}</span></button>
          {SPEC_CATEGORIES.map((c) => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c} <span className="count">{SPECS.filter((s) => s.category === c).length}</span></button>)}
        </div>
        <div className="mt-16">
          {loading ? <SkeletonCard lines={8} /> : (
            <DataTable key={cat + (params.get('q') || '')} rows={rows} columns={columns} searchKeys={['item', 'value', 'note', 'category']} initialSearch={params.get('q') || ''} pageSize={15} searchPlaceholder="Search specifications…" />
          )}
        </div>
      </RequireVehicle>
    </div>
  )
}

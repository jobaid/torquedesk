import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Star, Trash2 } from 'lucide-react'
import { useApp, toast } from '../store/useApp'
import { RESULT_TYPES } from '../lib/search'
import { TypeIcon } from '../components/search/TypeIcon'
import { EmptyState } from '../components/ui'
import { relTime } from '../lib/format'

export default function Favorites() {
  const favorites = useApp((s) => s.favorites)
  const remove = useApp((s) => s.removeFavorite)
  const [type, setType] = useState('all')
  const types = [...new Set(favorites.map((f) => f.type))]
  const list = favorites.filter((f) => type === 'all' || f.type === type)

  return (
    <div className="page">
      <div className="page-head"><div><h1>Favorites</h1><p>Procedures, codes, diagrams and specs you've saved for quick access.</p></div></div>
      {favorites.length === 0 ? (
        <div className="card">
          <EmptyState icon={Star} title="No favorites yet" action={<Link to="/repair" className="btn btn-primary">Browse repair information</Link>}>
            Use the Save button on any procedure, DTC, wiring diagram, bulletin or spec to pin it here.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="row gap-8 wrap" role="group" aria-label="Filter favorites">
            <button className="chip" aria-pressed={type === 'all'} onClick={() => setType('all')}>All <span className="count">{favorites.length}</span></button>
            {types.map((t) => <button key={t} className="chip" aria-pressed={type === t} onClick={() => setType(t)}>{RESULT_TYPES[t]?.label || t} <span className="count">{favorites.filter((f) => f.type === t).length}</span></button>)}
          </div>
          <div className="grid-2 mt-16">
            {list.map((f) => (
              <div key={f.id} className="card fav-card">
                <Link to={f.path} className="list-row grow" style={{ padding: 16 }}>
                  <TypeIcon type={f.type} />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <div className="strong">{f.title}</div>
                    <div className="small muted clamp-1">{f.subtitle}</div>
                    <div className="xs subtle mt-4">{RESULT_TYPES[f.type]?.singular} · saved {relTime(f.at)}</div>
                  </span>
                </Link>
                <button className="icon-btn" style={{ margin: 10 }} onClick={() => { remove(f.id); toast.info('Removed from favorites', f.title) }} aria-label={`Remove ${f.title}`}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

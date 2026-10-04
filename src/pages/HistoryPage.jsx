import { useState } from 'react'
import { Link } from 'react-router-dom'
import { History, Search, Trash2, X } from 'lucide-react'
import { useApp, toast } from '../store/useApp'
import { TypeIcon } from '../components/search/TypeIcon'
import { EmptyState, } from '../components/ui'
import { ConfirmDialog } from '../components/ui/Modal'
import { dateTime, relTime } from '../lib/format'

function dayLabel(ts) {
  const d = new Date(ts), now = new Date()
  const diff = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000)
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

export default function HistoryPage() {
  const history = useApp((s) => s.searchHistory)
  const remove = useApp((s) => s.removeHistory)
  const clear = useApp((s) => s.clearHistory)
  const [q, setQ] = useState('')
  const [confirm, setConfirm] = useState(false)
  const list = history.filter((h) => `${h.title} ${h.query} ${h.vehicleLabel}`.toLowerCase().includes(q.toLowerCase()))
  const groups = list.reduce((acc, h) => { const k = dayLabel(h.at); (acc[k] ||= []).push(h); return acc }, {})

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Search History</h1><p>Everything you've searched and opened, newest first.</p></div>
        {history.length > 0 && <button className="btn btn-secondary" onClick={() => setConfirm(true)}><Trash2 size={16} />Clear history</button>}
      </div>
      {history.length === 0 ? (
        <div className="card"><EmptyState icon={History} title="No history yet" action={<Link to="/search" className="btn btn-primary"><Search size={16} />Start searching</Link>}>Your searches and opened documents will appear here so you can reopen them in one click.</EmptyState></div>
      ) : (
        <>
          <div className="input-wrap" style={{ maxWidth: 380, marginBottom: 16 }}><Search size={16} /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter history…" aria-label="Filter history" /></div>
          {list.length === 0 && <div className="card"><EmptyState icon={Search} title="No matches">Nothing in your history matches “{q}”.</EmptyState></div>}
          <div className="stack gap-24">
            {Object.entries(groups).map(([day, items]) => (
              <section key={day} className="stack gap-8">
                <div className="section-title">{day}</div>
                <div className="card" style={{ padding: 6 }}>
                  {items.map((h) => (
                    <div key={h.id} className="row gap-4" style={{ paddingRight: 6 }}>
                      <Link to={h.path} className="list-row grow">
                        {h.type ? <TypeIcon type={h.type} size="sm" /> : <span className="icon-tile sm neutral"><Search size={15} /></span>}
                        <span className="grow" style={{ minWidth: 0 }}>
                          <div className="strong small">{h.title || h.query}</div>
                          <div className="xs subtle">{h.vehicleLabel}</div>
                        </span>
                        <span className="xs subtle nowrap" title={dateTime(h.at)}>{relTime(h.at)}</span>
                      </Link>
                      <button className="icon-btn sm" onClick={() => remove(h.id)} aria-label={`Remove ${h.title || h.query} from history`}><X size={15} /></button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => { clear(); toast.success('History cleared') }} title="Clear search history?" body="This removes all searches from this device. Favorites are not affected." confirmLabel="Clear history" danger />
    </div>
  )
}

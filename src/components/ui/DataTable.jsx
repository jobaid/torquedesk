import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'

/**
 * Reusable table with search, column sort, optional filter slot and pagination.
 * columns: [{ key, label, sortable, align, render(row), sortValue(row) }]
 */
export default function DataTable({ rows, columns, searchKeys = [], filters, pageSize = 12, initialSearch = '', empty, onRowClick, rowKey = 'id', searchPlaceholder = 'Search…' }) {
  const [q, setQ] = useState(initialSearch)
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    let r = s ? rows.filter((row) => searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(s))) : rows
    if (sort.key) {
      const col = columns.find((c) => c.key === sort.key)
      const get = col.sortValue || ((row) => row[sort.key])
      r = [...r].sort((a, b) => {
        const [x, y] = [get(a), get(b)]
        const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })
        return sort.dir === 'asc' ? cmp : -cmp
      })
    }
    return r
  }, [rows, q, sort, columns, searchKeys])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const p = Math.min(page, pages - 1)
  const slice = filtered.slice(p * pageSize, p * pageSize + pageSize)

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  return (
    <div>
      <div className="table-toolbar">
        <div className="input-wrap" style={{ flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={16} />
          <input className="input" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder={searchPlaceholder} aria-label="Search table" />
        </div>
        {filters}
      </div>
      <div className="table-wrap" style={{ maxHeight: 640 }}>
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.align === 'right' ? 'num' : ''} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sortable ? (
                    <button onClick={() => toggleSort(c.key)}>
                      {c.label}
                      {sort.key === c.key ? (sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowUpDown size={13} style={{ opacity: 0.4 }} />}
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => (
              <tr key={row[rowKey]} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'clickable-row' : ''}>
                {columns.map((c) => <td key={c.key} className={c.align === 'right' ? 'num' : ''}>{c.render ? c.render(row) : row[c.key]}</td>)}
              </tr>
            ))}
            {slice.length === 0 && <tr><td colSpan={columns.length}>{empty || <p className="muted" style={{ textAlign: 'center', padding: 24 }}>No matching rows.</p>}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>{filtered.length === 0 ? '0 results' : `${p * pageSize + 1}–${Math.min(filtered.length, (p + 1) * pageSize)} of ${filtered.length}`}</span>
        <div className="row gap-4">
          <button className="icon-btn sm bordered" onClick={() => setPage(p - 1)} disabled={p === 0} aria-label="Previous page"><ChevronLeft size={16} /></button>
          <span className="num" style={{ padding: '0 6px' }}>Page {p + 1} of {pages}</span>
          <button className="icon-btn sm bordered" onClick={() => setPage(p + 1)} disabled={p >= pages - 1} aria-label="Next page"><ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  )
}

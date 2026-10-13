import { useEffect, useState } from 'react'
import { Users as UsersIcon, Plus, Pencil, Trash2, Shield, X } from 'lucide-react'
import { ownerApi } from '../../store/useOwner'
import { Card, PageHeader, Btn, Field, Input, Select } from './primitives'

const ROLES = [
  { key: 'owner',   label: 'Owner',         desc: 'Full access to every area of the admin portal.' },
  { key: 'manager', label: 'Manager',       desc: 'Day-to-day administration of companies, plans, and billing.' },
  { key: 'support', label: 'Tech Support',  desc: 'Service Desk access to triage and resolve tickets.' },
]
const ROLE_META = Object.fromEntries(ROLES.map((r) => [r.key, r]))

export default function Users() {
  const [users, setUsers] = useState([])
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(null) // null | {} new | user object edit
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    ownerApi('/admin-users').then(setUsers).catch((e) => setErr(e.message)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const remove = async (u) => {
    if (!confirm(`Delete ${u.email}? This cannot be undone.`)) return
    try { await ownerApi(`/admin-users/${u.id}`, { method: 'DELETE' }); load() }
    catch (e) { alert(e.message) }
  }

  return (
    <div>
      <PageHeader
        title="Admin Users"
        subtitle="Owners, managers, and support staff who can sign into the SaaS portal."
        actions={<Btn onClick={() => setEditing({})}><Plus size={14} /> Add user</Btn>}
      />
      {err && <Card style={{ color: '#dc2626', marginBottom: 16 }}>{err}</Card>}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <div style={{ padding: 32, textAlign: 'center' }}>Loading…</div> :
         users.length === 0 ? <div style={{ padding: 32, textAlign: 'center' }}>No admin users yet.</div> :
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th>Last login</Th><Th right>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <Td bold>{u.name}</Td>
                  <Td>{u.email}</Td>
                  <Td><RoleBadge role={u.role} /></Td>
                  <Td>{u.active ? <span style={{ color: '#059669', fontWeight: 600 }}>Active</span> : <span style={{ color: '#dc2626' }}>Disabled</span>}</Td>
                  <Td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</Td>
                  <Td right>
                    <Btn variant="secondary" onClick={() => setEditing(u)}><Pencil size={13} /> Edit</Btn>{' '}
                    <Btn variant="danger" onClick={() => remove(u)}><Trash2 size={13} /> Delete</Btn>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>}
      </Card>

      {editing && <EditModal user={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function EditModal({ user, onClose, onSaved }) {
  const isNew = !user
  const [f, setF] = useState(isNew
    ? { email: '', name: '', role: 'support', password: '', active: true }
    : { email: user.email, name: user.name, role: user.role || 'support', password: '', active: user.active }
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      if (isNew) {
        await ownerApi('/admin-users', { method: 'POST', body: f })
      } else {
        const body = { name: f.name, role: f.role, active: f.active }
        if (f.password) body.password = f.password
        await ownerApi(`/admin-users/${user.id}`, { method: 'PATCH', body })
      }
      onSaved()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>{isNew ? 'Add admin user' : `Edit ${user.email}`}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <form onSubmit={submit} style={{ padding: 20, display: 'grid', gap: 12 }}>
          <Field label="Email">
            <Input value={f.email} onChange={upd('email')} disabled={!isNew} type="email" required />
          </Field>
          <Field label="Full name">
            <Input value={f.name} onChange={upd('name')} required />
          </Field>
          <Field label="Role" hint={ROLE_META[f.role]?.desc}>
            <Select value={f.role} onChange={upd('role')}>
              {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </Select>
          </Field>
          <Field label={isNew ? 'Password (min 8 chars)' : 'New password (leave blank to keep)'}>
            <Input type="password" value={f.password} onChange={upd('password')} minLength={isNew ? 8 : 0} required={isNew} autoComplete="new-password" />
          </Field>
          {!isNew && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={f.active} onChange={upd('active')} /> Account is active
            </label>
          )}
          {err && <div style={{ padding: 10, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <Btn variant="secondary" type="button" onClick={onClose}>Cancel</Btn>
            <Btn type="submit" disabled={busy}>{busy ? 'Saving…' : (isNew ? 'Create user' : 'Save changes')}</Btn>
          </div>
        </form>
      </div>
    </div>
  )
}

function RoleBadge({ role }) {
  const meta = ROLE_META[role] || { label: role || '—' }
  const colors = { owner: { bg: '#ede9fe', fg: '#6d28d9' }, manager: { bg: '#dbeafe', fg: '#1d4ed8' }, support: { bg: '#d1fae5', fg: '#047857' } }
  const c = colors[role] || { bg: '#e2e8f0', fg: '#000' }
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 999, background: c.bg, color: c.fg, fontSize: 11, fontWeight: 600 }}><Shield size={10} /> {meta.label}</span>
}

function Th({ children, right }) {
  return <th style={{ textAlign: right ? 'right' : 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#000', textTransform: 'uppercase', letterSpacing: '.05em', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>{children}</th>
}
function Td({ children, right, bold }) {
  return <td style={{ textAlign: right ? 'right' : 'left', padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #e2e8f0', color: '#000', fontWeight: bold ? 600 : 400 }}>{children}</td>
}

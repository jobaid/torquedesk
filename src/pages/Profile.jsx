import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Star, History, Car, LogOut, Save } from 'lucide-react'
import { useApp, ROLES, toast } from '../store/useApp'
import { api } from '../lib/api'
import { Field } from '../components/ui'
import { formatPhone, initials } from '../lib/format'

export default function Profile() {
  const user = useApp((s) => s.user)
  const updateUser = useApp((s) => s.updateUser)
  const logout = useApp((s) => s.logout)
  const favorites = useApp((s) => s.favorites.length)
  const history = useApp((s) => s.searchHistory.length)
  const vehicles = useApp((s) => s.recentVehicles.length)
  const [f, setF] = useState({ name: user.name, email: user.email, phone: user.phone || '', role: user.role })
  const [sub, setSub] = useState(false)
  const errs = {
    name: !f.name.trim() ? 'Name is required.' : '',
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email) ? 'Enter a valid email address.' : '',
    phone: f.phone && f.phone.replace(/\D/g, '').length !== 10 ? 'Enter a 10-digit phone number.' : '',
  }
  const e = (k) => sub && errs[k]
  const dirty = f.name !== user.name || f.email !== user.email || f.phone !== (user.phone || '') || f.role !== user.role
  const save = async (ev) => {
    ev.preventDefault()
    setSub(true)
    if (Object.values(errs).some(Boolean)) return
    try {
      // Re-issue the session so the server applies the new name/role permissions.
      const res = await api('/auth/login', { method: 'POST', body: { name: f.name.trim(), email: f.email.trim(), role: f.role } })
      updateUser({ name: res.user.name, email: res.user.email, phone: f.phone, role: res.user.role, token: res.token, permissions: res.permissions })
      toast.success('Profile saved')
      setSub(false)
    } catch (e) {
      toast.error('Could not save profile', e.message)
    }
  }

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <div className="card card-pad row gap-16 wrap">
        <span className="avatar lg">{initials(user.name)}</span>
        <div className="grow"><h1>{user.name}</h1><div className="muted">{user.email}</div><span className="badge badge-brand mt-8">{ROLES[user.role]?.label}</span></div>
        <button className="btn btn-secondary" onClick={() => { logout(); toast.info('Signed out') }}><LogOut size={16} />Log out</button>
      </div>
      <div className="grid-3 mt-16">
        <Link to="/favorites" className="card card-clickable card-pad row gap-12"><span className="icon-tile warning"><Star size={18} /></span><div><div className="strong" style={{ fontSize: 20 }}>{favorites}</div><div className="small muted">Favorites</div></div></Link>
        <Link to="/history" className="card card-clickable card-pad row gap-12"><span className="icon-tile info"><History size={18} /></span><div><div className="strong" style={{ fontSize: 20 }}>{history}</div><div className="small muted">Searches</div></div></Link>
        <Link to="/vehicle" className="card card-clickable card-pad row gap-12"><span className="icon-tile"><Car size={18} /></span><div><div className="strong" style={{ fontSize: 20 }}>{vehicles}</div><div className="small muted">Recent vehicles</div></div></Link>
      </div>
      <form className="card mt-16" onSubmit={save} noValidate>
        <div className="card-header"><h2>Account details</h2></div>
        <div className="card-body form-grid">
          <Field label="Full name" required htmlFor="p-n" error={e('name')}><input id="p-n" className={`input${e('name') ? ' invalid' : ''}`} value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} /></Field>
          <Field label="Email" required htmlFor="p-e" error={e('email')}><input id="p-e" type="email" className={`input${e('email') ? ' invalid' : ''}`} value={f.email} onChange={(ev) => setF({ ...f, email: ev.target.value })} /></Field>
          <Field label="Phone" htmlFor="p-p" error={e('phone')}><input id="p-p" type="tel" className={`input${e('phone') ? ' invalid' : ''}`} value={f.phone} onChange={(ev) => setF({ ...f, phone: formatPhone(ev.target.value) })} placeholder="(555) 555-0100" /></Field>
          <Field label="Role" htmlFor="p-r" hint="Demo only — in production roles are assigned by an admin."><select id="p-r" className="select" value={f.role} onChange={(ev) => setF({ ...f, role: ev.target.value })}>{Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</select></Field>
          <div className="span-2 row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" type="submit" disabled={!dirty}><Save size={16} />Save profile</button></div>
        </div>
      </form>
    </div>
  )
}

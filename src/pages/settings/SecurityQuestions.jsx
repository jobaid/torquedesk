import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { SectionHead } from './kit'
import { api } from '../../lib/api'
import { toast } from '../../store/useApp'

export function SecurityQuestions() {
  const [state, setState] = useState(null)
  const [f, setF] = useState({ question1: 0, answer1: '', question2: 1, answer2: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    try {
      const r = await api('/me/security-questions')
      setState(r)
      if (typeof r.question1 === 'number') setF((p) => ({ ...p, question1: r.question1 }))
      if (typeof r.question2 === 'number') setF((p) => ({ ...p, question2: r.question2 }))
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    setErr(''); setBusy(true)
    try {
      await api('/me/security-questions', { method: 'POST', body: f })
      setF({ ...f, answer1: '', answer2: '' })
      toast.success('Security questions saved', 'You will be asked these at next sign-in.')
      await load()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const disable = async () => {
    if (!confirm('Turn off security questions? Your account will only be protected by password (and MFA if enabled).')) return
    setBusy(true)
    try { await api('/me/security-questions/disable', { method: 'POST' }); toast.success('Security questions turned off'); await load() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (!state) return null
  const catalog = state.catalog || []

  return (
    <div className="stack gap-16">
      <SectionHead title="Security questions" description="Pick two questions from the list. You'll be asked both after your password at sign-in." />
      <div className="card card-pad stack gap-12" style={{ maxWidth: 620 }}>
        <div className="row gap-8">
          {state.enabled ? <ShieldCheck size={18} color="#28a745" /> : <ShieldOff size={18} />}
          <div className="strong">{state.enabled ? 'Security questions are enabled' : 'Security questions are off'}</div>
        </div>

        <div className="stack gap-12">
          <label className="stack gap-4">
            <span className="small muted">First question</span>
            <select className="input" value={f.question1} onChange={(e) => setF({ ...f, question1: Number(e.target.value) })}>
              {catalog.map((q, i) => <option key={i} value={i} disabled={i === f.question2}>{q}</option>)}
            </select>
            <input className="input" placeholder="Your answer" value={f.answer1} onChange={(e) => setF({ ...f, answer1: e.target.value })} autoComplete="off" />
          </label>

          <label className="stack gap-4">
            <span className="small muted">Second question</span>
            <select className="input" value={f.question2} onChange={(e) => setF({ ...f, question2: Number(e.target.value) })}>
              {catalog.map((q, i) => <option key={i} value={i} disabled={i === f.question1}>{q}</option>)}
            </select>
            <input className="input" placeholder="Your answer" value={f.answer2} onChange={(e) => setF({ ...f, answer2: e.target.value })} autoComplete="off" />
          </label>

          <div className="small muted">
            Answers are case-insensitive, trimmed of extra spaces, and stored as Argon2id hashes — we never see your plain-text answer.
          </div>

          {err && <div className="callout callout-danger"><div>{err}</div></div>}

          <div className="row gap-8">
            <button className="btn btn-primary" onClick={save} disabled={busy || !f.answer1.trim() || !f.answer2.trim() || f.question1 === f.question2}>
              {busy ? 'Saving…' : (state.enabled ? 'Update questions' : 'Enable security questions')}
            </button>
            {state.enabled && <button className="btn btn-ghost" onClick={disable} disabled={busy}>Turn off</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

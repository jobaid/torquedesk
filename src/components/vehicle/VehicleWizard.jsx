import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Car, Check, CheckCircle2, Loader2, ScanBarcode, Search, OctagonAlert, AlertTriangle } from 'lucide-react'
import { yearsAvailable, makesForYear, modelsFor, modelInfo, TRANSMISSIONS, defaultTransmission, vehicleLabel } from '../../data/vehicles'
import { validateVin, normalizeVin, decodeVin } from '../../lib/vin'
import { Field } from '../ui'

const STEPS = ['Year', 'Make', 'Model', 'Engine', 'Confirm']

/**
 * Guided Year → Make → Model → Engine → Confirm selector with a VIN tab.
 * onSelect(vehicle) is called when the user confirms.
 */
export default function VehicleWizard({ onSelect, initialMode = 'ymm', compact }) {
  const [mode, setMode] = useState(initialMode)
  const [sel, setSel] = useState({})
  const [step, setStep] = useState(0)

  const prefill = (partial) => {
    const next = {}
    if (partial.year) next.year = partial.year
    if (partial.make && partial.year && makesForYear(partial.year).includes(partial.make)) next.make = partial.make
    if (partial.vin) next.vin = partial.vin
    setSel(next)
    setStep(next.make ? 2 : next.year ? 1 : 0)
    setMode('ymm')
  }

  return (
    <div className="stack gap-16">
      <div className="segmented" role="tablist" aria-label="Selection method" style={{ alignSelf: 'flex-start' }}>
        <button role="tab" aria-selected={mode === 'ymm'} onClick={() => setMode('ymm')}><Car size={15} />Year / Make / Model</button>
        <button role="tab" aria-selected={mode === 'vin'} onClick={() => setMode('vin')}><ScanBarcode size={15} />Search by VIN</button>
      </div>
      {mode === 'ymm'
        ? <GuidedSelect sel={sel} setSel={setSel} step={step} setStep={setStep} onSelect={onSelect} compact={compact} />
        : <VinSearch onSelect={onSelect} onPartial={prefill} />}
    </div>
  )
}

function GuidedSelect({ sel, setSel, step, setStep, onSelect, compact }) {
  const [filter, setFilter] = useState('')
  const filterRef = useRef(null)
  useEffect(() => { setFilter('') }, [step])

  const info = sel.make && sel.model ? modelInfo(sel.make, sel.model) : null
  const options = useMemo(() => {
    if (step === 0) return yearsAvailable().map((y) => ({ value: y, label: String(y) }))
    if (step === 1) return makesForYear(sel.year).map((m) => ({ value: m, label: m }))
    if (step === 2) return modelsFor(sel.year, sel.make).map((m) => ({ value: m, label: m, sub: modelInfo(sel.make, m).body }))
    if (step === 3) return info.engines.map((e) => ({ value: e.id, label: e.label, sub: e.detail }))
    return []
  }, [step, sel.year, sel.make, info])

  const filtered = options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()))

  const pick = (value) => {
    if (step === 0) setSel({ year: value, vin: sel.vin })
    if (step === 1) setSel({ year: sel.year, make: value, vin: sel.vin })
    if (step === 2) {
      const mi = modelInfo(sel.make, value)
      setSel({ year: sel.year, make: sel.make, model: value, vin: sel.vin, transmission: defaultTransmission(mi), trim: mi.trims[0] })
    }
    if (step === 3) {
      const e = info.engines.find((x) => x.id === value)
      setSel({ ...sel, engineId: e.id, engineLabel: e.label, engineDetail: e.detail })
    }
    setStep(step + 1)
  }

  const onFilterKey = (e) => {
    if (e.key === 'Enter' && filtered.length) { e.preventDefault(); pick(filtered[0].value) }
  }

  const confirm = () => onSelect({ ...sel, body: info?.body })

  return (
    <div className="stack gap-16">
      <div className="steps-indicator" aria-label="Progress">
        {STEPS.map((label, i) => (
          <span key={label} className="row gap-6">
            <button
              className={`s ${i < step ? 'done' : i === step ? 'current' : ''}`}
              disabled={i > step}
              onClick={() => setStep(i)}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className="n">{i < step ? <Check size={12} /> : i + 1}</span>{label}
            </button>
            {i < STEPS.length - 1 && <span className="sep" aria-hidden="true">→</span>}
          </span>
        ))}
      </div>

      {step > 0 && step < 4 && (
        <div className="row gap-8 wrap small muted">
          <button className="btn btn-ghost btn-sm" onClick={() => setStep(step - 1)}><ArrowLeft size={15} />Back</button>
          <span>{[sel.year, sel.make, sel.model].filter(Boolean).join(' ')}</span>
        </div>
      )}

      {step < 4 ? (
        <>
          <div className="row gap-12 wrap between">
            <h3>Select {STEPS[step].toLowerCase()}</h3>
            {options.length > 8 && (
              <div className="input-wrap" style={{ width: 240 }}>
                <Search size={16} />
                <input ref={filterRef} className="input" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={onFilterKey} placeholder={`Filter ${STEPS[step].toLowerCase()}s…`} aria-label={`Filter ${STEPS[step]}`} autoFocus />
              </div>
            )}
          </div>
          <div className={`pick-grid${step === 0 ? ' years' : ''}${step === 3 ? ' wide' : ''}${compact ? ' compact' : ''}`} role="listbox" aria-label={STEPS[step]}>
            {filtered.map((o) => (
              <button key={o.value} role="option" aria-selected={false} className="pick-tile" onClick={() => pick(o.value)}>
                <span className="strong">{o.label}</span>
                {o.sub && <span className="xs subtle">{o.sub}</span>}
              </button>
            ))}
            {!filtered.length && <p className="muted small">No matches for “{filter}”.</p>}
          </div>
        </>
      ) : (
        <div className="stack gap-16">
          <div className="confirm-card">
            <span className="icon-tile"><Car size={20} /></span>
            <div className="grow">
              <div className="strong" style={{ fontSize: 17 }}>{vehicleLabel(sel)}</div>
              <div className="muted small">{sel.engineDetail}</div>
              {sel.vin && <div className="mono xs subtle mt-4">VIN {sel.vin}</div>}
            </div>
          </div>
          <div className="form-grid">
            <Field label="Trim" htmlFor="vw-trim">
              <select id="vw-trim" className="select" value={sel.trim} onChange={(e) => setSel({ ...sel, trim: e.target.value })}>
                {info.trims.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Transmission" htmlFor="vw-trans">
              <select id="vw-trans" className="select" value={sel.transmission} onChange={(e) => setSel({ ...sel, transmission: e.target.value })}>
                {TRANSMISSIONS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <div className="row gap-8" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setStep(3)}><ArrowLeft size={16} />Back</button>
            <button className="btn btn-primary" onClick={confirm} data-autofocus><CheckCircle2 size={16} />Use this vehicle</button>
          </div>
        </div>
      )}
    </div>
  )
}

function VinSearch({ onSelect, onPartial }) {
  const [vin, setVin] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')
  const v = validateVin(vin)
  const canDecode = v.state === 'valid' || v.state === 'warning'

  const decode = async (e) => {
    e?.preventDefault()
    if (!canDecode) { setErr(v.state === 'partial' ? 'Enter all 17 characters.' : v.message || 'Enter a VIN.'); return }
    setErr(''); setBusy(true); setResult(null)
    try {
      const r = await decodeVin(vin)
      setResult(r)
    } catch {
      setErr('Could not decode this VIN. Try again or select by Year/Make/Model.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack gap-16" onSubmit={decode} noValidate>
      <Field
        label="Vehicle Identification Number (VIN)"
        htmlFor="vin-input"
        required
        error={err || (v.state === 'invalid' ? v.message : '')}
        ok={v.state === 'valid' ? v.message : ''}
        hint={v.state === 'warning' ? undefined : v.state === 'partial' ? v.message : 'Found on the driver-side dash or door jamb. 17 characters, no I, O or Q.'}
      >
        <div className="row gap-8 wrap">
          <input
            id="vin-input"
            className={`input input-lg mono grow ${v.state === 'invalid' ? 'invalid' : v.state === 'valid' ? 'valid' : ''}`}
            style={{ letterSpacing: '0.08em', minWidth: 240 }}
            value={vin}
            onChange={(e) => { setVin(normalizeVin(e.target.value).slice(0, 17)); setErr(''); setResult(null) }}
            placeholder="1HGCM82633A123456"
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={v.state === 'invalid'}
            autoFocus
          />
          <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
            {busy ? <Loader2 size={18} className="spin" /> : <ScanBarcode size={18} />}Decode
          </button>
        </div>
      </Field>
      {v.state === 'warning' && <div className="callout callout-warning"><AlertTriangle size={18} /><div>{v.message}</div></div>}
      <div className="row gap-8 wrap xs subtle">
        Try a sample:
        {['1C4HJWEG6DL657026', '1C6RR7TT3MS518357', '1HGCM82633A004352'].map((s) => (
          <button type="button" key={s} className="chip mono" style={{ height: 26, fontSize: 11.5 }} onClick={() => { setVin(s); setResult(null); setErr('') }}>{s}</button>
        ))}
      </div>

      {busy && <div className="confirm-card"><span className="skeleton" style={{ width: 40, height: 40, borderRadius: 11 }} /><div className="grow stack gap-6"><span className="skeleton" style={{ width: '50%', height: 16 }} /><span className="skeleton" style={{ width: '30%', height: 12 }} /></div></div>}

      {result?.vehicle && (
        <div className="stack gap-12">
          <div className="confirm-card">
            <span className="icon-tile success"><CheckCircle2 size={20} /></span>
            <div className="grow">
              <div className="strong" style={{ fontSize: 17 }}>{vehicleLabel(result.vehicle)}</div>
              <div className="muted small">{result.vehicle.engineDetail} • {result.vehicle.trim}</div>
              <div className="mono xs subtle mt-4">VIN {result.vin} • decoded via {result.source === 'nhtsa' ? 'NHTSA vPIC' : 'local tables'}</div>
            </div>
          </div>
          <div className="row gap-8" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => onPartial({ ...result.vehicle, vin: result.vin })}>Adjust details</button>
            <button type="button" className="btn btn-primary" onClick={() => onSelect({ ...result.vehicle, vin: result.vin })}><CheckCircle2 size={16} />Use this vehicle</button>
          </div>
        </div>
      )}
      {result && !result.vehicle && (
        <div className="callout callout-info">
          <OctagonAlert size={18} />
          <div className="grow">
            <div className="strong">Partially decoded</div>
            <div>
              {result.partial?.year ? `Model year ${result.partial.year}` : 'Year unknown'}
              {result.partial?.make ? ` • ${result.partial.make}` : result.partial?.rawMake ? ` • ${result.partial.rawMake} (not in catalog)` : ' • make not recognized'}
              . Finish the selection with the guided steps.
            </div>
            <button type="button" className="btn btn-soft btn-sm mt-8" onClick={() => onPartial({ ...result.partial, vin: result.vin })}>Continue with guided selection</button>
          </div>
        </div>
      )}
    </form>
  )
}

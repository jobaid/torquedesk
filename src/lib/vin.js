import { CATALOG, makeFromWmi, modelInfo, defaultTransmission } from '../data/vehicles'

const TRANSLIT = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
}
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789'

export function normalizeVin(v) {
  return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Returns { state: 'empty'|'partial'|'invalid'|'valid', message } */
export function validateVin(raw) {
  const vin = normalizeVin(raw)
  if (!vin) return { state: 'empty', message: '' }
  if (/[IOQ]/.test(vin)) return { state: 'invalid', message: 'VINs never contain the letters I, O, or Q.' }
  if (vin.length < 17) return { state: 'partial', message: `${vin.length}/17 characters` }
  if (vin.length > 17) return { state: 'invalid', message: 'A VIN is exactly 17 characters.' }
  if (!checkDigitOk(vin)) {
    return { state: 'warning', message: 'Check digit does not match — verify the VIN was entered correctly.' }
  }
  return { state: 'valid', message: 'Valid VIN format' }
}

export function checkDigitOk(vin) {
  let sum = 0
  for (let i = 0; i < 17; i++) {
    const c = vin[i]
    const val = /\d/.test(c) ? Number(c) : TRANSLIT[c]
    if (val === undefined) return false
    sum += val * WEIGHTS[i]
  }
  const r = sum % 11
  const expected = r === 10 ? 'X' : String(r)
  return vin[8] === expected
}

export function yearFromVin(vin) {
  const code = vin[9]
  const idx = YEAR_CODES.indexOf(code)
  if (idx < 0) return null
  // Position 7 alphabetic → 2010+ cycle for passenger vehicles
  const base = /[A-Z]/.test(vin[6]) ? 2010 : 1980
  let year = base + idx
  const now = new Date().getFullYear() + 1
  if (year > now) year -= 30
  return year
}

function matchCatalog(make, modelName, year, engineL) {
  if (!make || !CATALOG[make]) return null
  const models = CATALOG[make].models
  const target = (modelName || '').toLowerCase()
  const name = Object.keys(models).find((m) => m.toLowerCase() === target)
    || Object.keys(models).find((m) => target && (m.toLowerCase().includes(target) || target.includes(m.toLowerCase())))
  if (!name) return null
  const info = models[name]
  const engine = (engineL && info.engines.find((e) => e.id.startsWith(Number(engineL).toFixed(1)))) || info.engines[0]
  return {
    year, make, model: name,
    engineId: engine.id, engineLabel: engine.label, engineDetail: engine.detail,
    trim: info.trims[0], transmission: defaultTransmission(info), body: info.body,
  }
}

/**
 * Decodes a VIN. Tries the public NHTSA vPIC service first, then falls back
 * to a local WMI/year decode so the feature still works offline.
 */
export async function decodeVin(raw, { signal } = {}) {
  const vin = normalizeVin(raw)
  const year = yearFromVin(vin)
  const localMake = makeFromWmi(vin)
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`, { signal })
    if (res.ok) {
      const data = await res.json()
      const r = data?.Results?.[0]
      if (r && r.Make) {
        const make = Object.keys(CATALOG).find((m) => m.toLowerCase() === r.Make.toLowerCase())
        const y = Number(r.ModelYear) || year
        const matched = matchCatalog(make, r.Model, y, r.DisplacementL)
        if (matched) return { vin, source: 'nhtsa', vehicle: { ...matched, trim: r.Trim && modelInfo(make, matched.model)?.trims.includes(r.Trim) ? r.Trim : matched.trim } }
        return { vin, source: 'nhtsa', partial: { year: y, make: make || null, rawMake: r.Make, rawModel: r.Model } }
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') throw e
    // network unavailable – use local decode
  }
  return { vin, source: 'local', partial: { year, make: localMake } }
}

// Sample vehicle catalog used by the guided selector and VIN decoder.
// Each model lists the engines and trims offered and the year range.

const I4 = (l, hp, fuel = 'Gas') => ({ id: `${l}-i4-${hp}`, label: `${l}L 4-Cylinder`, detail: `${l}L I4 ${hp}hp ${fuel}`, cyl: 4 })
const V6 = (l, hp, fuel = 'Gas') => ({ id: `${l}-v6-${hp}`, label: `${l}L V6`, detail: `${l}L V6 ${hp}hp ${fuel}`, cyl: 6 })
const V8 = (l, hp, fuel = 'Gas') => ({ id: `${l}-v8-${hp}`, label: `${l}L V8`, detail: `${l}L V8 ${hp}hp ${fuel}`, cyl: 8 })
const T3 = (l, hp) => ({ id: `${l}-i3t-${hp}`, label: `${l}L 3-Cyl Turbo`, detail: `${l}L I3 Turbo ${hp}hp Gas`, cyl: 3 })
const T4 = (l, hp) => ({ id: `${l}-i4t-${hp}`, label: `${l}L 4-Cyl Turbo`, detail: `${l}L I4 Turbo ${hp}hp Gas`, cyl: 4 })
const T6 = (l, hp) => ({ id: `${l}-v6t-${hp}`, label: `${l}L V6 Twin-Turbo`, detail: `${l}L V6 Twin-Turbo ${hp}hp Gas`, cyl: 6 })
const HY = (l, hp) => ({ id: `${l}-hyb-${hp}`, label: `${l}L 4-Cyl Hybrid`, detail: `${l}L I4 Hybrid ${hp}hp`, cyl: 4 })

export const CATALOG = {
  Toyota: {
    wmi: ['JTD', 'JTE', 'JTN', '4T1', '4T3', '5TD', '5TF', '2T1', '2T3'],
    models: {
      Camry: { years: [2015, 2025], body: 'Sedan', engines: [I4('2.5', 203), V6('3.5', 301), HY('2.5', 208)], trims: ['LE', 'SE', 'XLE', 'XSE', 'TRD'] },
      Corolla: { years: [2015, 2025], body: 'Sedan', engines: [I4('1.8', 139), I4('2.0', 169), HY('1.8', 121)], trims: ['L', 'LE', 'SE', 'XSE'] },
      RAV4: { years: [2015, 2025], body: 'SUV', engines: [I4('2.5', 203), HY('2.5', 219)], trims: ['LE', 'XLE', 'Adventure', 'Limited', 'TRD Off-Road'] },
      Tacoma: { years: [2016, 2025], body: 'Pickup', engines: [I4('2.7', 159), V6('3.5', 278)], trims: ['SR', 'SR5', 'TRD Sport', 'TRD Off-Road', 'Limited'] },
      Highlander: { years: [2015, 2025], body: 'SUV', engines: [V6('3.5', 295), T4('2.4', 265), HY('2.5', 243)], trims: ['L', 'LE', 'XLE', 'Limited', 'Platinum'] },
    },
  },
  Honda: {
    wmi: ['1HG', '2HG', '5FN', '5J6', '19X', 'JHM', '7FA'],
    models: {
      Accord: { years: [2015, 2025], body: 'Sedan', engines: [T4('1.5', 192), T4('2.0', 252), HY('2.0', 204)], trims: ['LX', 'Sport', 'EX-L', 'Touring'] },
      Civic: { years: [2016, 2025], body: 'Sedan', engines: [I4('2.0', 158), T4('1.5', 180)], trims: ['LX', 'Sport', 'EX', 'Touring', 'Si'] },
      'CR-V': { years: [2015, 2025], body: 'SUV', engines: [I4('2.4', 184), T4('1.5', 190), HY('2.0', 204)], trims: ['LX', 'EX', 'EX-L', 'Touring'] },
      Pilot: { years: [2016, 2025], body: 'SUV', engines: [V6('3.5', 280)], trims: ['LX', 'EX', 'EX-L', 'Touring', 'Elite'] },
    },
  },
  Ford: {
    wmi: ['1FA', '1FT', '1FM', '3FA', '2FM', '1FD'],
    models: {
      'F-150': { years: [2015, 2025], body: 'Pickup', engines: [V6('3.3', 290), T6('2.7', 325), T6('3.5', 400), V8('5.0', 400)], trims: ['XL', 'XLT', 'Lariat', 'King Ranch', 'Platinum'] },
      Escape: { years: [2015, 2025], body: 'SUV', engines: [T3('1.5', 180), T4('2.0', 250), HY('2.5', 192)], trims: ['S', 'SE', 'SEL', 'Titanium'] },
      Explorer: { years: [2015, 2025], body: 'SUV', engines: [T4('2.3', 300), T6('3.0', 400)], trims: ['Base', 'XLT', 'Limited', 'ST', 'Platinum'] },
      Mustang: { years: [2015, 2025], body: 'Coupe', engines: [T4('2.3', 310), V8('5.0', 460)], trims: ['EcoBoost', 'EcoBoost Premium', 'GT', 'GT Premium'] },
    },
  },
  Chevrolet: {
    wmi: ['1G1', '1GC', '1GN', '2G1', '3GN', '3GC', 'KL7'],
    models: {
      'Silverado 1500': { years: [2015, 2025], body: 'Pickup', engines: [V6('4.3', 285), T4('2.7', 310), V8('5.3', 355), V8('6.2', 420)], trims: ['WT', 'Custom', 'LT', 'RST', 'LTZ', 'High Country'] },
      Equinox: { years: [2015, 2025], body: 'SUV', engines: [T4('1.5', 170), I4('2.4', 182)], trims: ['LS', 'LT', 'RS', 'Premier'] },
      Malibu: { years: [2016, 2024], body: 'Sedan', engines: [T4('1.5', 163), T4('2.0', 250)], trims: ['LS', 'RS', 'LT', 'Premier'] },
      Tahoe: { years: [2015, 2025], body: 'SUV', engines: [V8('5.3', 355), V8('6.2', 420)], trims: ['LS', 'LT', 'RST', 'Z71', 'Premier'] },
    },
  },
  GMC: {
    wmi: ['1GK', '1GT', '3GT', '2GK'],
    models: {
      'Yukon XL 1500': { years: [2015, 2025], body: 'SUV', engines: [V8('5.3', 355), V8('6.2', 420)], trims: ['SLE', 'SLT', 'AT4', 'Denali'] },
      'Sierra 1500': { years: [2015, 2025], body: 'Pickup', engines: [V6('4.3', 285), T4('2.7', 310), V8('5.3', 355), V8('6.2', 420)], trims: ['Pro', 'SLE', 'Elevation', 'SLT', 'AT4', 'Denali'] },
      Acadia: { years: [2017, 2025], body: 'SUV', engines: [T4('2.0', 228), V6('3.6', 310)], trims: ['SLE', 'SLT', 'AT4', 'Denali'] },
    },
  },
  Jeep: {
    wmi: ['1C4', '1J4', '1J8'],
    models: {
      Wrangler: { years: [2015, 2025], body: 'SUV', engines: [V6('3.6', 285), T4('2.0', 270)], trims: ['Sport', 'Sahara', 'Rubicon', 'Willys'] },
      'Grand Cherokee': { years: [2015, 2025], body: 'SUV', engines: [V6('3.6', 293), V8('5.7', 357)], trims: ['Laredo', 'Limited', 'Overland', 'Summit'] },
      Cherokee: { years: [2015, 2023], body: 'SUV', engines: [I4('2.4', 180), V6('3.2', 271)], trims: ['Latitude', 'Limited', 'Trailhawk'] },
    },
  },
  Ram: {
    wmi: ['1C6', '3C6', '3D7'],
    models: {
      '1500': { years: [2015, 2025], body: 'Pickup', engines: [V6('3.6', 305), V8('5.7', 395)], trims: ['Tradesman', 'Big Horn', 'Laramie', 'Rebel', 'Limited'] },
      '1500 Classic': { years: [2019, 2024], body: 'Pickup', engines: [V6('3.6', 305), V8('5.7', 395)], trims: ['Tradesman', 'Express', 'Warlock'] },
    },
  },
  Nissan: {
    wmi: ['1N4', '1N6', '3N1', '5N1', 'JN1', 'JN8'],
    models: {
      Altima: { years: [2015, 2025], body: 'Sedan', engines: [I4('2.5', 188), T4('2.0', 248)], trims: ['S', 'SV', 'SR', 'SL'] },
      Rogue: { years: [2015, 2025], body: 'SUV', engines: [I4('2.5', 181), T3('1.5', 201)], trims: ['S', 'SV', 'SL', 'Platinum'] },
    },
  },
  Hyundai: {
    wmi: ['5NP', 'KMH', '5NM', 'KM8'],
    models: {
      Elantra: { years: [2015, 2025], body: 'Sedan', engines: [I4('2.0', 147), T4('1.6', 201)], trims: ['SE', 'SEL', 'Limited', 'N Line'] },
      'Santa Fe': { years: [2015, 2025], body: 'SUV', engines: [I4('2.5', 191), T4('2.5', 277)], trims: ['SE', 'SEL', 'Limited', 'Calligraphy'] },
      Tucson: { years: [2016, 2025], body: 'SUV', engines: [I4('2.5', 187), HY('1.6', 226)], trims: ['SE', 'SEL', 'N Line', 'Limited'] },
    },
  },
}

export const TRANSMISSIONS = ['Automatic', 'Manual', 'CVT']

export const MAKES = Object.keys(CATALOG).sort()

export function yearsAvailable() {
  const years = new Set()
  for (const make of Object.values(CATALOG)) {
    for (const m of Object.values(make.models)) {
      for (let y = m.years[0]; y <= m.years[1]; y++) years.add(y)
    }
  }
  return [...years].sort((a, b) => b - a)
}

export function makesForYear(year) {
  return MAKES.filter((mk) => Object.values(CATALOG[mk].models).some((m) => year >= m.years[0] && year <= m.years[1]))
}

export function modelsFor(year, make) {
  const models = CATALOG[make]?.models || {}
  return Object.keys(models).filter((name) => year >= models[name].years[0] && year <= models[name].years[1])
}

export function modelInfo(make, model) {
  return CATALOG[make]?.models?.[model]
}

export function defaultTransmission(model) {
  return model?.body === 'Coupe' ? 'Manual' : 'Automatic'
}

export function vehicleLabel(v) {
  if (!v) return ''
  return `${v.year} ${v.make} ${v.model}`
}

export function vehicleSub(v) {
  if (!v) return ''
  return [v.engineLabel, v.transmission, v.trim].filter(Boolean).join(' • ')
}

export function vehicleId(v) {
  return [v.year, v.make, v.model, v.engineId, v.trim].join('|')
}

export function makeFromWmi(vin) {
  const wmi = vin.slice(0, 3).toUpperCase()
  for (const [make, data] of Object.entries(CATALOG)) {
    if (data.wmi.includes(wmi)) return make
  }
  return null
}

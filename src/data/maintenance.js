// Maintenance schedule (sample content). Each item applies at every `every` miles.
export const MAINT_ITEMS = [
  { id: 'oil', name: 'Replace engine oil & filter', every: 5000, severe: 5000, normal: 10000, hours: 0.5, procedure: 'oil-change', type: 'Replace' },
  { id: 'rotate', name: 'Rotate tires & check pressures', every: 5000, severe: 5000, normal: 5000, hours: 0.5, procedure: 'tire-rotation', type: 'Service' },
  { id: 'inspect-brakes', name: 'Inspect brake pads, rotors, lines', every: 10000, severe: 5000, normal: 10000, hours: 0.4, procedure: 'brake-pads-front', type: 'Inspect' },
  { id: 'inspect-fluids', name: 'Inspect all fluid levels', every: 5000, severe: 5000, normal: 5000, hours: 0.2, type: 'Inspect' },
  { id: 'cabin', name: 'Replace cabin air filter', every: 15000, severe: 15000, normal: 30000, hours: 0.2, procedure: 'cabin-filter', type: 'Replace' },
  { id: 'air', name: 'Replace engine air filter', every: 30000, severe: 15000, normal: 30000, hours: 0.2, type: 'Replace' },
  { id: 'brake-fluid', name: 'Replace brake fluid', every: 30000, severe: 30000, normal: 30000, hours: 0.8, procedure: 'brake-bleed', type: 'Replace' },
  { id: 'belt-inspect', name: 'Inspect drive belt', every: 30000, severe: 15000, normal: 30000, hours: 0.1, procedure: 'serpentine-belt', type: 'Inspect' },
  { id: 'atf', name: 'Replace automatic transmission fluid', every: 60000, severe: 60000, normal: 60000, hours: 1.0, procedure: 'atf-service', type: 'Replace' },
  { id: 'coolant', name: 'Replace engine coolant', every: 100000, severe: 100000, normal: 100000, hours: 0.9, procedure: 'coolant-service', type: 'Replace' },
  { id: 'plugs', name: 'Replace spark plugs', every: 120000, severe: 60000, normal: 120000, hours: 1.2, procedure: 'spark-plugs', type: 'Replace' },
  { id: 'suspension', name: 'Inspect steering & suspension', every: 15000, severe: 15000, normal: 15000, hours: 0.3, type: 'Inspect' },
]

export const MAINT_INTERVALS = [5000, 10000, 15000, 30000, 45000, 60000, 75000, 90000, 100000, 120000]

export function itemsDueAt(mileage, condition = 'normal') {
  return MAINT_ITEMS.filter((it) => {
    const every = condition === 'severe' ? it.severe : it.normal
    return mileage > 0 && mileage % every === 0
  })
}

export function nextInterval(odometer) {
  return MAINT_INTERVALS.find((m) => m >= odometer) || Math.ceil(odometer / 5000) * 5000
}

// Document math. Uses ONLY the document's frozen settings snapshot (doc.snapshot),
// never the shop's current settings, so historical documents never change.
//
// Line kinds: labor | part | fee | note | discount
// Discount items: { mode: 'amount' | 'percent', value, appliesTo: 'labor' | 'parts' | 'all' }

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100

export function lineTotal(item) {
  if (item.kind === 'note' || item.kind === 'discount') return 0
  return round((Number(item.qty) || 0) * (Number(item.price) || 0))
}

export function discountAmount(item, base) {
  const v = Number(item.value) || 0
  const target = item.appliesTo === 'labor' ? base.labor : item.appliesTo === 'parts' ? base.parts : base.labor + base.parts + base.fees
  const amt = item.mode === 'percent' ? (target * v) / 100 : v
  return round(Math.min(amt, target))
}

/**
 * Shop fee rule:
 *  - amount:  the configured amount (min/max do not apply)
 *  - percent: base × percentage, then raised to minimum / lowered to maximum
 */
export function calcFee(fee, base) {
  if (fee.calcBy === 'amount') return round(Number(fee.amount) || 0)
  let v = (base * (Number(fee.percentage) || 0)) / 100
  if (fee.minimum != null && fee.minimum !== '' && v < Number(fee.minimum)) v = Number(fee.minimum)
  if (fee.maximum != null && fee.maximum !== '' && v > Number(fee.maximum)) v = Number(fee.maximum)
  return round(v)
}

export function feeBase(fee, b) {
  return fee.appliesTo === 'labor' ? b.labor : fee.appliesTo === 'parts' ? b.parts : b.labor + b.parts
}

export function computeTotals(doc) {
  const snap = doc.snapshot || {}
  const items = doc.items || []
  const sum = (pred) => round(items.filter(pred).reduce((a, i) => a + lineTotal(i), 0))
  const base = { labor: sum((i) => i.kind === 'labor'), parts: sum((i) => i.kind === 'part'), fees: sum((i) => i.kind === 'fee') }
  const laborHours = round(items.filter((i) => i.kind === 'labor').reduce((a, i) => a + (Number(i.qty) || 0), 0))

  // Discounts, and how much of them falls on each category (for tax bases)
  const disc = { labor: 0, parts: 0, fees: 0 }
  const discounts = items.filter((i) => i.kind === 'discount').map((i) => {
    const amount = discountAmount(i, base)
    if (i.appliesTo === 'labor') disc.labor += amount
    else if (i.appliesTo === 'parts') disc.parts += amount
    else {
      const all = base.labor + base.parts + base.fees || 1
      disc.labor += (amount * base.labor) / all
      disc.parts += (amount * base.parts) / all
      disc.fees += (amount * base.fees) / all
    }
    return { id: i.id, amount, appliesTo: i.appliesTo }
  })
  const discountTotal = round(discounts.reduce((a, d) => a + d.amount, 0))

  // Shop fees from the snapshot (HazMat, Shop Supplies, …), unless turned off on this document
  const hasWork = base.labor + base.parts > 0
  const feesOff = doc.feesOff || []
  const shopFees = (snap.fees || []).map((f) => {
    const off = feesOff.includes(f.id)
    const amount = !hasWork || off ? 0 : calcFee(f, feeBase(f, base))
    return { ...f, off, amount }
  })
  const shopFeesTotal = round(shopFees.reduce((a, f) => a + f.amount, 0))

  // Taxes: each selected rate is computed separately on the categories it applies to
  const after = (cat, taxableSum) => (base[cat] ? taxableSum * (1 - disc[cat] / base[cat]) : 0)
  const taxableLabor = after('labor', sum((i) => i.kind === 'labor' && i.taxable))
  const taxableParts = after('parts', sum((i) => i.kind === 'part' && i.taxable))
  const taxableFees = after('fees', sum((i) => i.kind === 'fee' && i.taxable)) + shopFees.filter((f) => f.taxable).reduce((a, f) => a + f.amount, 0)
  const selected = new Set(doc.taxIds || [])
  const taxes = (snap.taxes || []).filter((t) => selected.has(t.id)).map((t) => {
    const taxBase = Math.max(0, round((t.appliesLabor ? taxableLabor : 0) + (t.appliesParts ? taxableParts : 0) + (t.appliesFees ? taxableFees : 0)))
    return { id: t.id, name: t.name, rate: t.rate, base: taxBase, amount: round((taxBase * t.rate) / 100) }
  })
  const tax = round(taxes.reduce((a, t) => a + t.amount, 0))
  const combinedRate = Math.round(taxes.reduce((a, t) => a + Number(t.rate), 0) * 10000) / 10000

  const subtotal = round(base.labor + base.parts + base.fees + shopFeesTotal - discountTotal)
  const total = round(subtotal + tax)
  const paid = round((doc.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0))
  return { ...base, laborHours, discounts, discountTotal, shopFees, shopFeesTotal, taxes, tax, combinedRate, subtotal, total, paid, balance: round(total - paid) }
}

/** Cost / markup / margin for a part line (staff-only information). */
export function partEconomics(item) {
  const cost = Number(item.cost) || 0
  const price = Number(item.price) || 0
  if (!cost) return null
  const markup = round(price - cost)
  return { cost, markup, markupPct: cost ? round((markup / cost) * 100) : 0, marginPct: price ? round((markup / price) * 100) : 0 }
}

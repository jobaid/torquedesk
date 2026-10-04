// Run: node src/lib/totals.test.mjs
import assert from 'node:assert/strict'
import { calcFee, computeTotals } from './totals.js'

const supplies = { id: 2, name: 'Shop Supplies', calcBy: 'percent', percentage: 5, minimum: 2, maximum: 35, appliesTo: 'labor_parts', amount: 3 }
// Spec example: base $500 × 5% = $25, inside min/max → $25
assert.equal(calcFee(supplies, 500), 25)
// Below minimum → minimum
assert.equal(calcFee(supplies, 10), 2)
// Above maximum → maximum
assert.equal(calcFee(supplies, 2000), 35)
// Fixed amount ignores min/max
assert.equal(calcFee({ calcBy: 'amount', amount: 2, minimum: 5, maximum: 1 }, 1000), 2)
// No limits configured
assert.equal(calcFee({ calcBy: 'percent', percentage: 3, minimum: null, maximum: null }, 1000), 30)

const snapshot = {
  laborRate: 125,
  taxes: [
    { id: 1, name: 'State', rate: 5, appliesParts: true, appliesLabor: false, appliesFees: false },
    { id: 2, name: 'County', rate: 2, appliesParts: true, appliesLabor: true, appliesFees: false },
  ],
  fees: [{ id: 1, name: 'HazMat', calcBy: 'amount', amount: 2 }, supplies],
}
const doc = {
  snapshot,
  taxIds: [1, 2],
  feesOff: [],
  items: [
    { kind: 'labor', qty: 2, price: 125, taxable: true }, // 250
    { kind: 'part', qty: 1, price: 250, taxable: true }, // 250
  ],
}
const t = computeTotals(doc)
assert.equal(t.labor, 250)
assert.equal(t.parts, 250)
assert.equal(t.shopFeesTotal, 27) // 2 + 25
assert.deepEqual(t.taxes.map((x) => x.amount), [12.5, 10]) // 5% of 250 parts; 2% of 500
assert.equal(t.combinedRate, 7)
assert.equal(t.total, 549.5) // 527 + 22.5

// Turning a fee off on the document removes it
assert.equal(computeTotals({ ...doc, feesOff: [2] }).shopFeesTotal, 2)
// No work → no shop fees
assert.equal(computeTotals({ ...doc, items: [] }).shopFeesTotal, 0)
console.log('totals: all tests passed')

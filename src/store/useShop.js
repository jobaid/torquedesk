import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '../lib/format'
import { api } from '../lib/api'
import { toast } from './useApp'

export const DOC_TYPES = {
  estimate: { label: 'Estimate', short: 'E', tone: 'info' },
  repair_order: { label: 'Repair Order', short: 'RO', tone: 'brand' },
  invoice: { label: 'Invoice', short: 'INV', tone: 'success' },
  statement: { label: 'Statement', short: 'ST', tone: 'neutral' },
}

const hoursAgo = (h) => Date.now() - h * 3600_000

// Demo customers only seed the special legacy "demo" tenant — see
// resetDemoCustomers below and useApp.login's company-change reset. Shop
// tenants start with an empty customer book so no demo bleed-through.
const SEED_CUSTOMERS = [
  { id: 'c1', name: 'Marcus Reyes', phone: '(202) 555-0187', email: 'marcus.reyes@example.com', address: '45 Elm St, Silver Spring, MD', notes: 'Prefers text updates.', createdAt: hoursAgo(400),
    vehicles: [{ id: 'cv1', year: 2021, make: 'GMC', model: 'Yukon XL 1500', engineId: '5.3-v8-355', engineLabel: '5.3L V8', engineDetail: '5.3L V8 355hp Gas', trim: 'SLT', transmission: 'Automatic', vin: '1GKS2GKC5MR123456', plate: 'MD 7KX221', mileage: 48210 }] },
  { id: 'c2', name: 'Priya Natarajan', phone: '(410) 555-0133', email: 'priya.n@example.com', address: '9 Harbor View Ct, Baltimore, MD', notes: '', createdAt: hoursAgo(300),
    vehicles: [{ id: 'cv2', year: 2013, make: 'Jeep', model: 'Wrangler', engineId: '3.6-v6-285', engineLabel: '3.6L V6', engineDetail: '3.6L V6 285hp Gas', trim: 'Sahara', transmission: 'Automatic', vin: '1C4HJWEG6DL657026', plate: 'MD 9FA5986', mileage: 132870 }] },
  { id: 'c3', name: 'Dana Whitfield', phone: '(301) 555-0119', email: 'dwhitfield@example.com', address: '310 Oak Ridge Rd, Columbia, MD', notes: 'Fleet account — net 30.', createdAt: hoursAgo(200),
    vehicles: [{ id: 'cv3', year: 2021, make: 'Ram', model: '1500 Classic', engineId: '5.7-v8-395', engineLabel: '5.7L V8', engineDetail: '5.7L V8 395hp Gas', trim: 'Express', transmission: 'Automatic', vin: '1C6RR7TT3MS518357', plate: 'MD 2TR8812', mileage: 61405 }] },
  { id: 'c4', name: 'Kenji Watanabe', phone: '(443) 555-0164', email: 'kenji.w@example.com', address: '77 Lakeside Dr, Towson, MD', notes: '', createdAt: hoursAgo(100),
    vehicles: [{ id: 'cv4', year: 2024, make: 'Toyota', model: 'Camry', engineId: '2.5-i4-203', engineLabel: '2.5L 4-Cylinder', engineDetail: '2.5L I4 203hp Gas', trim: 'SE', transmission: 'Automatic', vin: '4T1G11AK5RU123987', plate: 'MD 4CM1990', mileage: 12340 }] },
]

export { SEED_CUSTOMERS }

// Debounced document saves: edits apply locally at once and are merged into one PUT.
const pending = {}
const timers = {}
const SAVE_DELAY = 450

function scheduleSave(id, patch, set) {
  pending[id] = { ...(pending[id] || {}), ...patch }
  clearTimeout(timers[id])
  timers[id] = setTimeout(() => saveNow(id, set), SAVE_DELAY)
}

async function saveNow(id, set) {
  clearTimeout(timers[id])
  const body = pending[id]
  if (!body) return
  delete pending[id]
  set((s) => ({ saving: { ...s.saving, [id]: true } }))
  try {
    const doc = await api(`/documents/${id}`, { method: 'PUT', body })
    // Keep any edits made while the request was in flight.
    set((s) => ({ documents: s.documents.map((d) => (d.id === id ? { ...doc, ...(pending[id] || {}) } : d)) }))
  } catch (e) {
    toast.error('Could not save document', e.message)
    try {
      const fresh = await api(`/documents/${id}`)
      set((s) => ({ documents: s.documents.map((d) => (d.id === id ? fresh : d)) }))
    } catch { /* ignore */ }
  } finally {
    set((s) => ({ saving: { ...s.saving, [id]: false } }))
  }
}

/** Flush pending saves immediately (before print, conversions, recalculation). */
export function flushSaves() {
  return Promise.all(Object.keys(pending).map((id) => saveNow(id, useShop.setState)))
}

export const useShop = create(
  persist(
    (set, get) => ({
      customers: [],
      documents: [],
      docsLoaded: false,
      docsError: null,
      saving: {},

      // ---------- customers (stored in this browser) ----------
      addCustomer: (c) => {
        const customer = { id: uid('c'), createdAt: Date.now(), vehicles: [], notes: '', ...c }
        set((s) => ({ customers: [customer, ...s.customers] }))
        return customer
      },
      updateCustomer: (id, patch) => set((s) => ({ customers: s.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      deleteCustomer: (id) => set((s) => ({ customers: s.customers.filter((c) => c.id !== id) })),
      addCustomerVehicle: (customerId, v) => {
        const vehicle = { id: uid('cv'), ...v }
        set((s) => ({ customers: s.customers.map((c) => (c.id === customerId ? { ...c, vehicles: [...c.vehicles, vehicle] } : c)) }))
        return vehicle
      },
      removeCustomerVehicle: (customerId, vid) => set((s) => ({ customers: s.customers.map((c) => (c.id === customerId ? { ...c, vehicles: c.vehicles.filter((v) => v.id !== vid) } : c)) })),
      resetDemoCustomers: () => set({ customers: SEED_CUSTOMERS }),

      // ---------- documents (PostgreSQL via the Go API) ----------
      loadDocuments: async () => {
        try {
          const documents = await api('/documents')
          set({ documents, docsLoaded: true, docsError: null })
        } catch (e) {
          set({ docsError: e.message, docsLoaded: true })
        }
      },

      /** Creates a document on the server, which assigns the number and freezes current settings. */
      createDocument: async (data) => {
        const c = get().customers.find((x) => x.id === data.customerId)
        const v = c?.vehicles.find((x) => x.id === data.vehicleId)
        const body = {
          type: data.type || 'estimate',
          status: data.status || 'open',
          customerId: data.customerId || '',
          customerSnapshot: c ? { id: c.id, name: c.name, phone: c.phone, email: c.email } : null,
          vehicleId: data.vehicleId || '',
          vehicleSnapshot: v ? { year: v.year, make: v.make, model: v.model, trim: v.trim, engineLabel: v.engineLabel, engineDetail: v.engineDetail, vin: v.vin, plate: v.plate } : null,
          writerId: data.writerId ?? c?.preferredWriterId ?? null,
          shopNote: data.shopNote || '',
          items: [],
        }
        let doc = await api('/documents', { method: 'POST', body })
        // Line items are priced with the new document's frozen settings.
        if (data.items?.length) {
          const items = data.items.map((i) => priceWithSnapshot(doc, { id: uid('li'), ...i }))
          doc = await api(`/documents/${doc.id}`, { method: 'PUT', body: { items } })
        }
        set((s) => ({ documents: [doc, ...s.documents] }))
        return doc
      },
      updateDocument: (id, patch) => {
        set((s) => ({ documents: s.documents.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d)) }))
        scheduleSave(id, patch, set)
      },
      deleteDocument: async (id) => {
        clearTimeout(timers[id]); delete pending[id]
        await api(`/documents/${id}`, { method: 'DELETE' })
        set((s) => ({ documents: s.documents.filter((d) => d.id !== id) }))
      },
      applyCurrentSettings: async (id) => {
        await flushSaves()
        const doc = await api(`/documents/${id}/apply-current-settings`, { method: 'POST' })
        set((s) => ({ documents: s.documents.map((d) => (d.id === id ? doc : d)) }))
        return doc
      },

      // Item helpers write the whole items array through updateDocument.
      _items: (docId, fn) => {
        const doc = get().documents.find((d) => d.id === docId)
        if (doc) get().updateDocument(docId, { items: fn(doc.items || [], doc) })
      },
      addItem: (docId, item) => get()._items(docId, (items, doc) => [...items, priceWithSnapshot(doc, { id: uid('li'), ...item })]),
      addItems: (docId, list) => get()._items(docId, (items, doc) => [...items, ...list.map((i) => priceWithSnapshot(doc, { id: uid('li'), ...i }))]),
      updateItem: (docId, itemId, patch) => get()._items(docId, (items) => items.map((i) => (i.id === itemId ? { ...i, ...patch } : i))),
      removeItem: (docId, itemId) => get()._items(docId, (items) => items.filter((i) => i.id !== itemId)),
      moveItem: (docId, itemId, dir) => get()._items(docId, (items) => {
        const arr = [...items]
        const i = arr.findIndex((x) => x.id === itemId)
        const j = i + dir
        if (i < 0 || j < 0 || j >= arr.length) return items
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
        return arr
      }),
      addPayment: async (docId, p) => {
        // Flush pending edits so totals are current before the payment arrives.
        await flushSaves()
        const body = {
          method: normalizePaymentMethod(p.method),
          amount: Number(p.amount),
          paidAt: p.at || Date.now(),
          checkNumber: p.checkNumber || '',
          reference: p.ref || p.reference || '',
          notes: p.notes || '',
        }
        try {
          await api(`/documents/${docId}/payments`, { method: 'POST', body })
          // Refetch to pick up updated totals, paid_total, balance, payment_status.
          const fresh = await api(`/documents/${docId}`)
          set((s) => ({ documents: s.documents.map((d) => (d.id === docId ? fresh : d)) }))
          return fresh
        } catch (e) {
          toast.error('Could not record payment', e.message)
          throw e
        }
      },
      removePayment: async (docId, pid) => {
        try {
          await api(`/payments/${pid}`, { method: 'DELETE' })
          const fresh = await api(`/documents/${docId}`)
          set((s) => ({ documents: s.documents.map((d) => (d.id === docId ? fresh : d)) }))
        } catch (e) {
          toast.error('Could not remove payment', e.message)
          throw e
        }
      },
    }),
    {
      name: 'torque-shop',
      version: 2,
      // Only customers live in the browser; documents and settings come from the server.
      partialize: (s) => ({ customers: s.customers }),
      migrate: (old) => ({ customers: old?.customers || SEED_CUSTOMERS }),
    },
  ),
)

/**
 * Prices a new line with the document's frozen settings:
 * labor marked useDocRate gets the document's labor rate (plus any labor markup);
 * parts with a cost and autoPrice get the document's parts markup.
 */
export function priceWithSnapshot(doc, item) {
  const snap = doc?.snapshot || {}
  const { useDocRate, ...rest } = item
  if (rest.kind === 'labor' && useDocRate) {
    rest.price = applyMarkup(snap.laborRate ?? rest.price, snap.markups, 'labor')
  }
  if (rest.kind === 'part' && rest.autoPrice && Number(rest.cost) > 0) {
    rest.price = applyMarkup(Number(rest.cost), snap.markups, 'parts')
  }
  return rest
}

// Map UI/legacy method names to the server's enum.
export function normalizePaymentMethod(m = '') {
  const s = String(m).trim().toLowerCase().replace(/\s+/g, '_')
  if (['cash', 'check', 'credit_card', 'debit_card', 'financing', 'other'].includes(s)) return s
  if (s === 'card' || s === 'credit') return 'credit_card'
  if (s === 'debit') return 'debit_card'
  return 'other'
}

export function applyMarkup(base, markups = [], appliesTo) {
  const m = (markups || []).find((x) => x.appliesTo === appliesTo)
  if (!m) return Math.round(base * 100) / 100
  const v = m.calcType === 'percent' ? base * (1 + m.percentage / 100) : base + m.amount
  return Math.round(v * 100) / 100
}

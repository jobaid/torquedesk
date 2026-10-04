import { create } from 'zustand'
import { api } from '../lib/api'

/**
 * Shop settings, loaded from the Go API (PostgreSQL). Not persisted in the browser.
 * Keys mirror GET /api/settings: shop, display, licenses, service-writers, technicians,
 * tax-rates, markups, shop-fees, document-preferences, printing, document-options,
 * estimate, header-footer, laborRate, laborRates, numbering.
 */
export const useSettings = create((set, get) => ({
  data: null,
  loading: false,
  error: null,
  errorStatus: 0,

  load: async () => {
    set({ loading: true, error: null, errorStatus: 0 })
    try {
      const data = await api('/settings')
      set({ data, loading: false })
      return data
    } catch (e) {
      set({ loading: false, error: e.message, errorStatus: e.status || 0 })
      throw e
    }
  },

  /** Replace one key of the bundle after a successful write. */
  patch: (key, value) => set((s) => ({ data: s.data ? { ...s.data, [key]: value } : s.data })),

  /** Refetch a list resource. */
  reloadList: async (key, path = key) => {
    const value = await api(`/settings/${path}`)
    get().patch(key, value)
    return value
  },
}))

// ---------- selectors ----------
export const laborRateOf = (d) => d?.laborRate?.rate ?? 0
export const activeStaff = (list = [], keepId) => list.filter((x) => x.active || x.id === keepId)

export const PAYMENT_METHODS = {
  cash: 'Cash', check: 'Check', credit_card: 'Credit Card', debit_card: 'Debit Card', financing: 'Financing', other: 'Other',
}

export const DOC_TYPE_LABELS = { estimate: 'Estimate', repair_order: 'Repair Order', invoice: 'Invoice', statement: 'Statement' }

// Includes the tenant's company id so the public /api/settings/printing/logo
// endpoint (used by <img> on printed documents too) returns THIS shop's logo,
// not the demo tenant's.
export const logoUrl = (printing, companyId) => {
  if (!printing?.logoName) return null
  const base = `/api/settings/printing/logo?v=${printing.logoUpdatedAt}`
  return companyId ? `${base}&company=${encodeURIComponent(companyId)}` : base
}

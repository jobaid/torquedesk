import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '../lib/format'
import { vehicleId, vehicleLabel } from '../data/vehicles'

// Role labels. Permissions come from the server at sign-in (see server/internal/api/auth.go).
export const ROLES = {
  admin: { label: 'Shop Owner / Admin' },
  advisor: { label: 'Service Advisor' },
  technician: { label: 'Technician' },
  apprentice: { label: 'Apprentice (read-only)' },
}

const SEED_NOTIFS = [
  { id: 'n1', title: 'New bulletin: TSB 25-006', body: 'Transmission harsh 1–2 upshift — software update available.', at: Date.now() - 1000 * 60 * 42, read: false, path: '/bulletins/tsb-25-006' },
  { id: 'n2', title: 'Safety recall 24V-312', body: 'Fuel pump impeller may deform. Check VIN for open recalls.', at: Date.now() - 1000 * 60 * 60 * 26, read: false, path: '/bulletins/rc-24v-312' },
  { id: 'n3', title: 'Welcome to TorqueDesk', body: 'Select a vehicle to get started. Press Ctrl+K to search anywhere.', at: Date.now() - 1000 * 60 * 60 * 50, read: true, path: '/vehicle' },
]

export const useApp = create(
  persist(
    (set, get) => ({
      user: null,
      theme: 'system',
      sidebarCollapsed: false,
      vehicle: null,
      recentVehicles: [],
      searchHistory: [],
      favorites: [],
      notifications: SEED_NOTIFS,
      // Per-tenant feature flags from /api/me/features; loaded on boot.
      // null = not yet loaded (treat everything as enabled so first paint
      // doesn't flash-hide the whole sidebar).
      features: null,
      loadFeatures: async () => {
        const token = get().user?.token
        if (!token) return
        try {
          const { api } = await import('../lib/api')
          const f = await api('/me/features')
          set({ features: f || {} })
        } catch { /* ignore; stale value is better than hiding everything */ }
      },
      can_feature: (key) => {
        const f = get().features
        if (!f) return true // not loaded yet
        if (!(key in f)) return true // unknown key = assume on
        return !!f[key]
      },

      // When the tenant changes (new company signs in, or someone logs out and a
      // different company signs in on the same browser), wipe browser-held
      // tenant data: customers (per-browser list), the current vehicle,
      // recent vehicles, search history, favorites. Notifications are system
      // bulletins, not tenant data, so they survive.
      // Dynamic-imported to avoid a cycle with useShop (which imports toast
      // from this file). Non-blocking: the state reset happens on the next tick.
      login: (user) => {
        const prev = get().user
        const newCid = user?.companyId || ''
        const oldCid = prev?.companyId || ''
        if (newCid !== oldCid) {
          import('./useShop').then((m) => {
            m.useShop.setState({ customers: [], documents: [], docsLoaded: false, docsError: null })
          }).catch(() => {})
          set({ vehicle: null, recentVehicles: [], searchHistory: [], favorites: [] })
        }
        set({ user })
      },
      logout: () => {
        // Nuke the persisted stores entirely so no stale token, role, company
        // id, customers, vehicles, favorites, etc. survive. The next sign-in
        // starts from a truly clean slate — avoids the "sign in → still 403"
        // loop caused by any leftover state.
        try { localStorage.removeItem('torque-shop') } catch { /* ignore */ }
        try { localStorage.removeItem('torque-app') } catch { /* ignore */ }
        import('./useShop').then((m) => {
          m.useShop.setState({ customers: [], documents: [], docsLoaded: false, docsError: null })
        }).catch(() => {})
        set({ user: null, vehicle: null, recentVehicles: [], searchHistory: [], favorites: [] })
      },
      updateUser: (patch) => set((s) => ({ user: { ...s.user, ...patch } })),
      can: (perm) => !!get().user?.permissions?.includes(perm),

      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setVehicle: (v) => {
        const vehicle = { ...v, id: vehicleId(v) }
        set((s) => ({
          vehicle,
          recentVehicles: [{ ...vehicle, lastUsed: Date.now() }, ...s.recentVehicles.filter((r) => r.id !== vehicle.id)].slice(0, 8),
        }))
      },
      clearVehicle: () => set({ vehicle: null }),
      removeRecentVehicle: (id) => set((s) => ({ recentVehicles: s.recentVehicles.filter((r) => r.id !== id) })),

      addHistory: (entry) => {
        const v = get().vehicle
        const item = { id: uid('h'), at: Date.now(), vehicleLabel: v ? vehicleLabel(v) : 'No vehicle', ...entry }
        set((s) => ({
          searchHistory: [item, ...s.searchHistory.filter((h) => !(h.query.toLowerCase() === item.query.toLowerCase() && h.path === item.path))].slice(0, 100),
        }))
      },
      removeHistory: (id) => set((s) => ({ searchHistory: s.searchHistory.filter((h) => h.id !== id) })),
      clearHistory: () => set({ searchHistory: [] }),

      isFavorite: (type, id) => get().favorites.some((f) => f.type === type && f.refId === id),
      toggleFavorite: (fav) => {
        const exists = get().favorites.find((f) => f.type === fav.type && f.refId === fav.refId)
        if (exists) {
          set((s) => ({ favorites: s.favorites.filter((f) => f !== exists) }))
          return false
        }
        set((s) => ({ favorites: [{ id: uid('f'), at: Date.now(), ...fav }, ...s.favorites] }))
        return true
      },
      removeFavorite: (id) => set((s) => ({ favorites: s.favorites.filter((f) => f.id !== id) })),

      pushNotification: (n) => set((s) => ({ notifications: [{ id: uid('n'), at: Date.now(), read: false, ...n }, ...s.notifications].slice(0, 30) })),
      markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      markRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      clearNotifications: () => set({ notifications: [] }),
    }),
    { name: 'torque-app', version: 1 },
  ),
)

// Transient UI state (not persisted)
export const useUI = create((set) => ({
  paletteOpen: false,
  vehiclePickerOpen: false,
  drawerOpen: false,
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  openVehiclePicker: () => set({ vehiclePickerOpen: true }),
  closeVehiclePicker: () => set({ vehiclePickerOpen: false }),
  setDrawer: (drawerOpen) => set({ drawerOpen }),
}))

export const useToast = create((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = uid('t')
    const toast = { id, type: 'success', duration: t.type === 'error' ? 7000 : 4000, ...t }
    set((s) => ({ toasts: [...s.toasts, toast].slice(-4) }))
    if (toast.duration) setTimeout(() => get().dismiss(id), toast.duration)
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (title, body) => useToast.getState().push({ type: 'success', title, body }),
  error: (title, body) => useToast.getState().push({ type: 'error', title, body }),
  info: (title, body) => useToast.getState().push({ type: 'info', title, body }),
  warning: (title, body) => useToast.getState().push({ type: 'warning', title, body }),
}

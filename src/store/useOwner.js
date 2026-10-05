// SaaS Owner Portal session, kept entirely separate from the main app's useApp
// store so a company user cannot accidentally be elevated into an owner session
// (and vice versa). Lives under its own localStorage key.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useOwner = create(
  persist(
    (set) => ({
      owner: null, // { token, user: { name, email, role, exp } }
      login: (owner) => set({ owner }),
      logout: () => set({ owner: null }),
    }),
    { name: 'curanex-owner' },
  ),
)

export class OwnerApiError extends Error {
  constructor(status, message, fields, extra) {
    super(message)
    this.status = status
    this.fields = fields || {}
    if (extra) Object.assign(this, extra)
  }
}

export async function ownerApi(path, { method = 'GET', body } = {}) {
  const token = useOwner.getState().owner?.token
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(`/api/owner${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new OwnerApiError(0, 'Cannot reach the CuraNex Owner Portal API. Start the Go server with: npm run api')
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok && !data && res.status >= 500) {
    throw new OwnerApiError(0, 'Cannot reach the CuraNex Owner Portal API server.')
  }
  if (!res.ok) {
    // Only clear the session for true "session gone" 401s. A 401 with mfaRequired
    // means credentials were accepted but the TOTP code is still needed — don't
    // wipe anything, we'll surface the mfaRequired flag to the caller.
    if (res.status === 401 && token && !data?.mfaRequired) useOwner.getState().logout()
    throw new OwnerApiError(res.status, data?.error || `Request failed (${res.status})`, data?.fields, { mfaRequired: !!data?.mfaRequired })
  }
  return data
}

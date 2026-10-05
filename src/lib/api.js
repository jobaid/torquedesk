import { useApp } from '../store/useApp'

export class ApiError extends Error {
  constructor(status, message, fields, extra) {
    super(message)
    this.status = status
    this.fields = fields || {}
    // Server may set extra flags like {authRecoverable: true, missingPerm, role}
    // so the UI can offer "sign in again" instead of a dead-end permission screen.
    if (extra) Object.assign(this, extra)
  }
}

/** Calls the Go API. Throws ApiError with server validation messages. */
export async function api(path, { method = 'GET', body, form } = {}) {
  const token = useApp.getState().user?.token
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(`/api${path}`, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) })
  } catch {
    throw new ApiError(0, 'Cannot reach the TorqueDesk API server. Start it in a terminal with: npm run api')
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  // The Vite dev proxy answers with an empty 5xx when the Go API isn't running.
  if (!res.ok && !data && res.status >= 500) {
    throw new ApiError(0, 'Cannot reach the TorqueDesk API server. Start it in a terminal with: npm run api')
  }
  if (!res.ok) {
    // 401 = session is gone — safe to log out silently.
    // 403 (even with authRecoverable) must NOT auto-logout: that would make a
    // fresh sign-in appear to "fail silently" and bounce the user back to
    // Login with no explanation. Let the Boot/error UI show the real message
    // and offer an explicit sign-out button.
    // Don't wipe the session on an mfaRequired 401 — login is mid-flight and
    // we want the UI to show the TOTP input.
    if (token && res.status === 401 && !data?.mfaRequired) {
      useApp.getState().logout()
    }
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.fields, {
      authRecoverable: !!data?.authRecoverable,
      missingPerm: data?.missingPerm,
      role: data?.role,
      companyStatus: data?.companyStatus,
      mfaRequired: !!data?.mfaRequired,
    })
  }
  return data
}

/** Fetches an authenticated file and opens it in a new tab. */
export async function openFile(path) {
  const token = useApp.getState().user?.token
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new ApiError(res.status, 'Could not open the file.')
  const url = URL.createObjectURL(await res.blob())
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

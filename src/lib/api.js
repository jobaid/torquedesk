import { useApp } from '../store/useApp'

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message)
    this.status = status
    this.fields = fields || {}
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
    if (res.status === 401 && token) useApp.getState().logout()
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.fields)
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

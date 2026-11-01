export class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.status = status }
}
export function createApi({ baseUrl = 'http://localhost:5000', token, onUnauthorized, fetchImpl = fetch }) {
  return async function api(path, { body, method = body ? 'POST' : 'GET', signal } = {}) {
    let response
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api${path}`, {
        method, signal, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch (error) {
      if (error.name === 'AbortError') throw error
      throw new ApiError('Cannot reach Bizi. Check that the backend is running.')
    }
    let data
    try { data = await response.json() } catch { throw new ApiError('The server returned an unreadable response.', response.status) }
    if (!response.ok) {
      if (response.status === 401 && token) onUnauthorized?.()
      throw new ApiError(data.error || data.message || `Request failed (${response.status}).`, response.status)
    }
    return data
  }
}

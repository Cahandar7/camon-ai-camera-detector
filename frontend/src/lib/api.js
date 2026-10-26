// Fired when the session cookie is missing or expired; the app goes back to the login screen
export const UNAUTHORIZED = 'camon:unauthorized'
const signalUnauthorized = () => window.dispatchEvent(new Event(UNAUTHORIZED))

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 && !path.startsWith('/api/auth/')) signalUnauthorized()
  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    } catch {
      /* not JSON */
    }
    const error = new Error(detail)
    error.status = res.status
    throw error
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  me: () => request('/api/auth/me'),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  forgotPassword: (email, lang) => request('/api/auth/forgot', { method: 'POST', body: { email, lang } }),
  checkReset: (token) => request(`/api/auth/reset/check?token=${encodeURIComponent(token)}`),
  resetPassword: (token, password) => request('/api/auth/reset', { method: 'POST', body: { token, new_password: password } }),
  changePassword: (current, password) =>
    request('/api/auth/change-password', { method: 'POST', body: { current_password: current, new_password: password } }),
  health: () => request('/api/health'),
  cameras: () => request('/api/cameras'),
  addCamera: (body) => request('/api/cameras', { method: 'POST', body }),
  updateCamera: (id, body) => request(`/api/cameras/${id}`, { method: 'PUT', body }),
  deleteCamera: (id) => request(`/api/cameras/${id}`, { method: 'DELETE' }),
  testCamera: (url) => request('/api/cameras/test', { method: 'POST', body: { url } }),
  settings: () => request('/api/settings'),
  saveSettings: (body) => request('/api/settings', { method: 'PUT', body }),
  alerts: () => request('/api/alerts'),
  clearAlerts: () => request('/api/alerts', { method: 'DELETE' }),
  discardVideo: (path) => request('/api/videos/discard', { method: 'POST', body: { path } }),
}

/** Upload a demo video as the raw request body; XHR because fetch has no upload progress. */
export function uploadVideo(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/videos?name=${encodeURIComponent(file.name)}`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      let data = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        /* not JSON */
      }
      if (xhr.status === 401) signalUnauthorized()
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new Error(data?.detail || xhr.statusText || 'Upload failed'))
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(file)
  })
}

export const wsUrl = (path) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`
export const streamUrl = (id, key) => `/api/cameras/${id}/stream?k=${key}`
export const snapshotUrl = (id, width, t) => `/api/cameras/${id}/snapshot?w=${width}&t=${t}`

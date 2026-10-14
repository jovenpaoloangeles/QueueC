const BASE = '/api'

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    let data = null
    try { data = await res.json() } catch {}
    const err = new Error(data?.error ? `${method} ${path} → ${res.status}: ${data.error}` : `${method} ${path} → ${res.status}`)
    err.status = res.status
    err.data = data
    throw err
  }
  return res.json()
}

export const createSession = data => req('POST', '/sessions', data)
export const startSession = id => req('PATCH', `/sessions/${id}/start`)
export const endSession = id => req('PATCH', `/sessions/${id}/end`)
export const getPlayers = () => req('GET', '/players')
export const createPlayer = data => req('POST', '/players', data)
export const updatePlayer = (id, data) => req('PATCH', `/players/${id}`, data)
export const checkinPlayer = (sessionId, playerId) =>
  req('POST', `/sessions/${sessionId}/checkin`, { player_id: playerId })
export const setEntryStatus = (entryId, status) =>
  req('PATCH', `/queue/${entryId}/status`, { status })
export const removeEntry = entryId => req('DELETE', `/queue/${entryId}`)
export const startMatch = data => req('POST', '/matches', data)
export const endMatch = (id, scores) => req('PATCH', `/matches/${id}/end`, scores)
export const updateMatchTeams = (id, teams) => req('PATCH', `/matches/${id}/teams`, teams)
export const setQueueOrder = (sessionId, order) => req('PATCH', '/queue/order', { session_id: sessionId, order })
export const getPlayerHistory = playerId => req('GET', `/players/${playerId}/history`)
export const getSuggestion = (sessionId, mode) =>
  req('GET', `/sessions/${sessionId}/suggest?mode=${mode}`)
export const addCourt = (sessionId, label, duration_minutes = null) =>
  req('POST', `/sessions/${sessionId}/courts`, { label, duration_minutes })
export const deleteCourt = courtId =>
  fetch(`${BASE}/courts/${courtId}`, { method: 'DELETE' })
export const updateCourt = (courtId, patch) =>
  req('PATCH', `/courts/${courtId}`, patch)

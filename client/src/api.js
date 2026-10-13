const BASE = '/api'

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`)
  return res.json()
}

export const createSession = data => req('POST', '/sessions', data)
export const endSession = id => req('PATCH', `/sessions/${id}/end`)
export const getPlayers = () => req('GET', '/players')
export const createPlayer = data => req('POST', '/players', data)
export const checkinPlayer = (sessionId, playerId) =>
  req('POST', `/sessions/${sessionId}/checkin`, { player_id: playerId })
export const setEntryStatus = (entryId, status) =>
  req('PATCH', `/queue/${entryId}/status`, { status })
export const startMatch = data => req('POST', '/matches', data)
export const endMatch = (id, scores) => req('PATCH', `/matches/${id}/end`, scores)
export const getPlayerHistory = playerId => req('GET', `/players/${playerId}/history`)
export const getSuggestion = (sessionId, mode) =>
  req('GET', `/sessions/${sessionId}/suggest?mode=${mode}`)

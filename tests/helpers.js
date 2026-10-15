import { expect } from '@playwright/test'
export const base = () => process.env.QC_BASE

const DEFAULT_PLAYERS = [
  'Inter C1', 'Inter C2', 'Inter C3', 'Inter C4',
  'Expert E1', 'Expert E2', 'Upper D1', 'Upper D2',
]

/** Fill the single-screen setup (no server state yet). `courts` = count or
 *  [{label, hours}] rows; `hours` applies to every court when courts is a count;
 *  `startTime` = 'HH:00' (whole hours 06:00–23:00) (left at the screen's default when omitted). */
export async function createSession(page, { name = 'Test Session', courts = 2, hours, startTime } = {}) {
  await page.goto('/')
  await page.getByLabel('Session name').fill(name)
  const rows = Array.isArray(courts) ? courts : null
  await page.getByLabel('Number of courts').fill(String(rows ? rows.length : courts))
  if (startTime) await page.getByLabel('Start time').selectOption(startTime)
  if (rows) {
    for (const [i, r] of rows.entries()) {
      if (r.label != null) await page.getByLabel(`Court ${i + 1} label`).fill(r.label)
      if (r.hours != null) await page.getByLabel(`Court ${i + 1} hours`).fill(String(r.hours))
    }
  } else if (hours != null) {
    for (let i = 0; i < courts; i++) await page.getByLabel(`Court ${i + 1} hours`).fill(String(hours))
  }
}

export async function checkinPlayers(page, names = DEFAULT_PLAYERS) {
  // Setup screen: clicking a pool row toggles it into the selection (the click
  // is debounced ~220ms to tell it from a dblclick); check-in happens on Start.
  for (const name of names) {
    const row = page.getByTestId('player-pool').filter({ has: page.getByText(name, { exact: true }) }).first()
    // center the row — minimal scroll leaves lower rows under the sticky letter header
    await row.evaluate(el => el.scrollIntoView({ block: 'center' }))
    await row.click()
    await expect(row).toHaveAttribute('aria-checked', 'true')
  }
}

export async function startSession(page) {
  await page.getByRole('button', { name: 'Start Session' }).click()
  // setup screen unmounts once the live session arrives via SSE
  await page.getByTestId('session-setup').waitFor({ state: 'detached', timeout: 8000 })
}

/** API-seeded session setup: create + check in + start over HTTP, then one
 * page.goto — same signature as the old UI walk-through (which filled the form
 * and clicked 8 pool rows per call, ~3s of pure setup per test). Court config
 * mirrors SetupScreen defaults (DEFAULT_HOURS '2', next full hour 06:00–23:00). */
const api = async (path, method = 'GET', body) => {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

function defaultStartEpoch(startTime) {
  const d = new Date()
  if (startTime) {
    const [hh, mm] = startTime.split(':').map(Number)
    d.setHours(hh, mm, 0, 0)
  } else {
    d.setHours(Math.min(23, Math.max(6, d.getHours() + 1)), 0, 0, 0)
  }
  return Math.floor(d.getTime() / 1000)
}

export async function fullSetup(page, { courts = 2, playerNames = DEFAULT_PLAYERS, name = 'Test Session', hours, startTime } = {}) {
  const rows = Array.isArray(courts) ? courts : null
  const label = (i, r) => (r?.label ?? '').trim() || `Court ${i + 1}`
  const hoursOf = r => Number(r?.hours ?? hours ?? 2)
  const cfgs = (rows ? rows.map((r, i) => ({ label: label(i, r), duration_minutes: Math.round(hoursOf(r) * 60), opens_after: Math.max(0, Number(r?.opensAfter ?? 0)) }))
    : Array.from({ length: courts }, (_, i) => ({ label: label(i, null), duration_minutes: Math.round(hoursOf(null) * 60), opens_after: 0 })))
  const scheduledStart = defaultStartEpoch(startTime)
  const { session } = await api('/api/sessions', 'POST', {
    name,
    scheduled_start: scheduledStart,
    scheduled_end: scheduledStart + Math.round(Math.max(...cfgs.map(c => c.duration_minutes)) / 60 * 3600),
    court_count: cfgs.length,
    courts: cfgs,
  })
  const { players } = await api('/api/players')
  const entryIds = []
  for (const n of playerNames) {
    const p = players.find(x => x.name === n)
    if (!p) throw new Error(`fullSetup: player not in fixtures/players.json: ${n}`)
    const { entry } = await api(`/api/sessions/${session.id}/checkin`, 'POST', { player_id: p.id })
    entryIds.push(entry.id)
  }
  // check-ins now insert alphabetically; specs seed a specific queue order via
  // playerNames — restore it through the manual reorder endpoint
  if (entryIds.length > 1) {
    await api('/api/queue/order', 'PATCH', { session_id: session.id, order: entryIds })
  }
  await api(`/api/sessions/${session.id}/start`, 'PATCH')
  await page.goto('/')
  // the live view renders on the first SSE frame — wait for the seeded rows so
  // callers can read the queue/grid immediately (the UI flow had them already)
  if (playerNames.length) await expect(page.locator('[data-entry-id]')).toHaveCount(playerNames.length)
}

export async function endMatch(page, courtLabel, { team1 = 21, team2 = 15 } = {}) {
  // Use 'End Match' button directly (avoids strict-mode issues with partial court label matches)
  await page.getByRole('button', { name: 'End Match' }).first().click()
  // two-step flow: the confirm gate appears first, then the finalization form
  const confirmEnd = page.getByTestId('confirm-end-end')
  if (await confirmEnd.isVisible().catch(() => false)) await confirmEnd.click()
  await page.getByLabel('Team 1').fill(String(team1))
  await page.getByLabel('Team 2').fill(String(team2))
  await page.getByRole('button', { name: 'Confirm' }).click()
  // finalized once the modal unmounts
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
}

export async function getQueueNames(page) {
  // the grid is empty until the first SSE frame lands — don't read through it
  await page.locator('[data-entry-id]').first().waitFor({ timeout: 5000 }).catch(() => {})
  return page.locator('[data-entry-id]').evaluateAll(els =>
    els.map(el => el.querySelector('.text-base.font-medium')?.textContent?.trim()).filter(Boolean)
  )
}

/** Synthetic HTML5 drag between two elements (CSS selectors).
 *  Playwright's dragTo does NOT fire React's HTML5 drag handlers; native
 *  DragEvents dispatched on the elements do. dataTransfer must be attached
 *  via defineProperty — the DragEvent constructor silently drops it.
 *  toIndex: -1 = last matching element (default). */
export async function syntheticDrag(page, fromSel, toSel, { fromIndex = 0, toIndex = -1 } = {}) {
  await page.evaluate(({ fromSel, toSel, fromIndex, toIndex }) => {
    const all = document.querySelectorAll(fromSel)
    const from = all[fromIndex < 0 ? all.length + fromIndex : fromIndex]
    const toAll = document.querySelectorAll(toSel)
    const to = toAll[toIndex < 0 ? toAll.length + toIndex : toIndex]
    const mk = type => {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'dataTransfer', { value: new DataTransfer() })
      return ev
    }
    from.dispatchEvent(mk('dragstart'))
    to.dispatchEvent(mk('dragover'))
    to.dispatchEvent(mk('drop'))
    from.dispatchEvent(mk('dragend'))
  }, { fromSel, toSel, fromIndex, toIndex })
}

/** Confirm the "Start match(es)?" dialog if one opened (every start now asks first). */
export async function confirmStart(page) {
  const yes = page.getByTestId('start-confirm-yes')
  await yes.waitFor({ state: 'visible', timeout: 3000 })
  await yes.click()
  await page.getByTestId('start-confirm-dialog').waitFor({ state: 'detached', timeout: 5000 })
}

/** Click the first Start Match button and confirm the dialog. */
export async function clickStartMatch(page) {
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await confirmStart(page)
}

/** Click-select the first n queue cards, then Start Match (court 1).
 *  `expectEndMatch` = wait for an End Match button to appear (set false when
 *  the test starts a match on every court — no End Match left to wait for). */
export async function startDoubles(page, { expectEndMatch = true } = {}) {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await clickStartMatch(page)
  if (expectEndMatch) await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(1)
}

/** API path of every queue entry id + status (one liveState round-trip). */
async function entryStates(page) {
  const st = await liveState(page)
  return Object.fromEntries(st.queue.map(e => [String(e.id), e.status]))
}

/** Wait until every currently-visible queue card carries `status` (SSE tick
 *  landing). Replaces fixed waitForTimeout(300–600) after Rest/Wake/bench UI
 *  actions — resolves as soon as the broadcast arrives, not at a guessed delay. */
export async function expectCardsStatus(page, status) {
  await expect.poll(async () => {
    const ids = await page.locator('[data-entry-id]').evaluateAll(els => els.map(el => el.getAttribute('data-entry-id')))
    if (!ids.length) return false
    const states = await entryStates(page)
    return ids.every(id => states[id] === status)
  }, { timeout: 5000 }).catch(() => { /* caller's own expect gives the error */ })
}

/** Wait until any 'End Match' button exists — i.e. the started match landed. */
export async function expectMatchLive(page) {
  await expect(page.getByRole('button', { name: 'End Match' }).first()).toBeVisible()
}

/** One snapshot of the SSE state payload ({session, queue, courts, ...}). */
export function liveState(page) {
  return page.evaluate(() => new Promise(res => {
    const es = new EventSource('/api/sse')
    es.addEventListener('state', e => { es.close(); res(JSON.parse(e.data)) })
  }))
}

/** Pool row (setup screen) by exact player name. */
export function poolRow(page, name) {
  return page.getByTestId('player-pool').filter({ has: page.getByText(name, { exact: true }) }).first()
}

/** API-seeded On Deck slate from the first 4 waiting entries (pure setup — the
 *  smart-fill/drag UI paths are exercised by the specs that test them). Waits
 *  for the On Deck count so callers can assert immediately. Returns the slate. */
export async function seedSlate(page) {
  const st = await liveState(page)
  const ids = st.queue.filter(e => e.status === 'waiting').slice(0, 4).map(e => e.id)
  if (ids.length < 4) throw new Error(`seedSlate: only ${ids.length} waiting entries`)
  await page.request.fetch(`${base()}/api/matches/slate`, {
    method: 'POST',
    data: { session_id: st.session.id, team1_p1: ids[0], team1_p2: ids[1], team2_p1: ids[2], team2_p2: ids[3] },
  })
  await expect(page.getByTestId('on-deck-count')).toHaveText(String(st.slatedMatches.length + 1), { timeout: 5000 })
  return (await liveState(page)).slatedMatches.at(-1)
}

/** Seed a slate AND start it on the first free court over the API — replaces
 *  the 4-click + Start Match + confirm UI chain where that is pure setup. */
export async function seedLiveMatch(page, { courtId } = {}) {
  const st = await liveState(page)
  const busy = new Set(st.activeMatches.map(m => m.court_number))
  const now = Math.floor(Date.now() / 1000)
  const court = courtId
    ? st.courts.find(c => c.id === courtId)
    : st.courts.find(c => c.enabled && !busy.has(c.id) &&
      (c.active_from == null || now >= c.active_from) &&
      (c.expires_at == null || now < c.expires_at))
  if (!court) throw new Error('seedLiveMatch: no free court')
  const slate = await seedSlate(page)
  const res = await page.request.fetch(`${base()}/api/matches/${slate.id}/start`, {
    method: 'POST', data: { court_id: court.id } })
  if (!res.ok()) throw new Error(`seedLiveMatch: start → ${res.status()} ${await res.text()}`)
  await expect.poll(async () => (await liveState(page)).activeMatches.length,
    { timeout: 5000 }).toBe(st.activeMatches.length + 1)
  return slate
}

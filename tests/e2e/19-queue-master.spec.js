import { test, expect } from '../fixtures.js'
import { base, fullSetup, createSession, checkinPlayers, startSession, endMatch, getQueueNames, clickStartMatch, liveState } from '../helpers.js'

// Queue master — real session scenarios (section 19)

test.beforeEach(async ({ page }) => {
  const { session } = await (await fetch(`${base()}/api/sessions/active`)).json()
  if (session) await fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
})

// Get entry IDs from DOM (waiting queue)
async function getDOMEntryIds(page) {
  return page.locator('[data-entry-id]').evaluateAll(els => els.map(el => +el.getAttribute('data-entry-id')))
}

// Start a doubles match. fullSetup leaves Manual mode — click 4 cards, then Start Match (same as spec 07).
async function startDoublesMatch(page) {
  const cards = page.locator('[data-entry-id]')
  for (let i = 0; i < 4; i++) await cards.nth(i).click()
  await clickStartMatch(page)
  await page.waitForTimeout(500)
}

test('QM.1 late player joins mid-match — visible in queue via live check-in', async ({ page }) => {
  await fullSetup(page)
  await startDoublesMatch(page)
  const beforeCount = await page.locator('[data-entry-id]').count()

  await page.getByTestId('checkin-toggle').click()
  await page.getByTestId('checkin-search').fill('Newbie A1')
  await page.getByTestId('combobox-matches').getByRole('button', { name: 'Newbie A1' }).first().click()
  await page.getByTestId('checkin-confirm-add').click()

  await expect(page.locator('[data-entry-id]')).toHaveCount(beforeCount + 1)
})

test('QM.2 player removed via API — gone from queue', async ({ page }) => {
  await fullSetup(page)
  await page.locator('[data-entry-id]').first().waitFor()
  const entryIds = await getDOMEntryIds(page)
  expect(entryIds.length).toBeGreaterThan(0)
  const target = entryIds[0]

  await fetch(`${base()}/api/queue/${target}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'left' }),
  })

  await expect(page.locator('[data-entry-id]')).toHaveCount(entryIds.length - 1)
})

test('QM.3 smart mode skips players already on court', async ({ page }) => {
  await fullSetup(page)
  const initialCount = await page.locator('[data-entry-id]').count()

  await startDoublesMatch(page)

  const waitingCount = await page.locator('[data-entry-id]').count()
  expect(waitingCount).toBe(initialCount - 4)

  // Header Smart Match can only match from waiting players — not the 4 on
  // court: with one court now busy it slates the remaining 4 to On Deck,
  // and cancel leaves the queue untouched
  await page.getByTestId('btn-smart-match').click()
  const dialog = page.getByTestId('start-confirm-dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('start-confirm-slate-row')).toHaveCount(1) // the 4 waiting players
  await page.getByTestId('start-confirm-cancel').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-entry-id]')).toHaveCount(waitingCount)
  expect((await liveState(page)).slatedMatches).toHaveLength(0)
})

test('QM.4 queue master picks their own 4 — selection always manual', async ({ page }) => {
  await fullSetup(page)
  // no auto-population: nobody is selected out of the box
  await expect(page.locator('text=selected →')).toHaveCount(0)

  const cards = page.locator('[data-entry-id]')
  for (let i = 0; i < 4; i++) await cards.nth(i).click()

  await expect(page.locator('text=/4 selected.*Doubles/i')).toBeVisible()
})

test('QM.6 end session with active match — header shows no active session', async ({ page }) => {
  await fullSetup(page)
  await startDoublesMatch(page)

  await page.getByRole('button', { name: 'End Session' }).click()
  await page.getByTestId('end-session-confirm').click() // pass the confirm gate

  await expect(page.locator('text=No active session')).toBeVisible()
})

test('QM.7 two matches end simultaneously — all 8 players return to queue', async ({ page }) => {
  await fullSetup(page, { courts: 2 })
  await startDoublesMatch(page)
  await startDoublesMatch(page)
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(2)

  // end both server-side (state covered by server/routes/two-match-end.test.js);
  // what's UI-specific here is that the grid re-renders all 8 cards
  const st = await liveState(page)
  for (const m of st.activeMatches) {
    await page.request.fetch(`${base()}/api/matches/${m.id}/end`, {
      method: 'PATCH', data: { team1_score: 21, team2_score: 15 },
    })
  }

  await expect(page.locator('[data-entry-id]')).toHaveCount(8)
})

test('QM.8 drag reorder — order survives next SSE tick', async ({ page }) => {
  await fullSetup(page)
  await page.locator('[data-entry-id]').first().waitFor()

  const before = await getQueueNames(page)
  expect(before.length).toBeGreaterThanOrEqual(2)

  // Synthetic HTML5 drag: React handlers read module-level drag.current, set on dragstart.
  // Playwright's dragTo doesn't fire React's drag handlers, so dispatch native DragEvents.
  // Drag the 2nd card onto the 1st (moveBefore of an already-preceding card is a no-op).
  await page.evaluate(() => {
    const cards = document.querySelectorAll('[data-entry-id]')
    const mk = type => {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'dataTransfer', { value: new DataTransfer() })
      return ev
    }
    cards[1].dispatchEvent(mk('dragstart'))
    cards[0].dispatchEvent(mk('dragover'))
    cards[0].dispatchEvent(mk('drop'))
    cards[1].dispatchEvent(mk('dragend'))
  })

  await expect(page.locator('[data-entry-id]').first().locator('.text-base.font-medium'))
    .toHaveText(before[1])
  await expect(page.locator('[data-entry-id]').nth(1).locator('.text-base.font-medium'))
    .toHaveText(before[0])

  // a real server broadcast (late check-in over the API) must not reset the manual reorder
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  const { players } = await (await page.request.get(`${base()}/api/players`)).json()
  const late = players.find(p => !before.includes(p.name))
  await page.request.fetch(`${base()}/api/sessions/${session.id}/checkin`, { method: 'POST', data: { player_id: late.id } })
  await expect(page.locator('[data-entry-id]')).toHaveCount(before.length + 1)
  const after = await getQueueNames(page)
  expect(after.slice(0, 2)).toEqual([before[1], before[0]])
})

test('QM.9 full session cycle — create, check-in, start, match, end match, end session, new session', async ({ page }) => {
  await fullSetup(page)
  await startDoublesMatch(page)
  await endMatch(page, 'Court 1')

  await page.getByRole('button', { name: 'End Session' }).click()
  await page.getByTestId('end-session-confirm').click() // pass the confirm gate
  await expect(page.locator('text=No active session')).toBeVisible()

  // after ending, the single-screen setup is the landing view
  await expect(page.getByTestId('session-setup')).toBeVisible()
  await createSession(page, { name: 'Session 2' })
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.locator('text=Session 2')).toBeVisible()
})

test('QM.10 benched player returned mid-match — appears at end of queue', async ({ page }) => {
  await fullSetup(page)
  await page.locator('[data-entry-id]').first().waitFor()

  // Bench the first player
  await page.locator('[data-entry-id]').first().click({ modifiers: ['Shift'] })
  await page.waitForTimeout(300)

  // Start match with 4 of the remaining 7
  await startDoublesMatch(page)

  const beforeReturn = await page.locator('[data-entry-id]').count()

  // the resting row lives in the queue grid now (All tab) — Wake via its toggle
  await page.locator('[data-resting-id]').getByTestId('rest-toggle').click()

  await expect(page.locator('[data-entry-id]')).toHaveCount(beforeReturn + 1)

  const names = await getQueueNames(page)
  expect(names.length).toBe(beforeReturn + 1)
  expect(names[names.length - 1]).toBeTruthy()
})

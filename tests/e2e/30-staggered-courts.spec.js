// Staggered court starts (init-phase option A): a court configured with an
// opens-after offset renders as the draft opens-strip ("in mm:ss") and rejects matches until its
// offset elapses, then opens automatically. Offset elapsed time is simulated by
// backdating active_from over the API (same trick as 25-court-expiry's expires_at).
import { test, expect } from '../fixtures.js'
import { base, fullSetup, liveState, seedLiveMatch } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  // startTime = now, so offsets anchor to the actual start (a future scheduled
  // start would push active_from out per the clock-time anchor in sessions.js)
  const now = new Date()
  const startTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  await fullSetup(page, { courts: [{}, { opensAfter: 5 }], startTime })
})

test('30.1 staggered second court shows opens-in state and no start/drop until it opens', async ({ page }) => {
  const { courts } = await (await page.request.get(`${base()}/api/sessions/${(await liveState(page)).session.id}/courts`)).json()
  const late = courts[1]
  expect(late.active_from).not.toBeNull()

  // the late court renders as the amber opens-strip, not a card — no lineup/drop zone
  await expect(page.getByTestId('opens-in-badge')).toHaveText(/^in \d+:\d\d$/)
  await expect(page.getByTestId('opens-in-note')).toContainText('joins the rotation automatically')
  // court 1 offers a Start Match button; the not-yet-open court renders none
  await expect(page.getByTestId('btn-start-match')).toHaveCount(1)
})

test('30.2 after the offset elapses the court opens automatically and accepts a match', async ({ page }) => {
  const st = await liveState(page)
  const late = st.courts[1]
  await page.request.fetch(`${base()}/api/courts/${late.id}`, {
    method: 'PATCH', data: { active_from: Math.floor(Date.now() / 1000) - 1 },
  })
  await expect(page.getByTestId('opens-in-badge')).toHaveCount(0)
  await expect(page.getByTestId('opens-in-note')).toHaveCount(0)
  await expect(page.getByTestId('btn-start-match')).toHaveCount(2)

  // usable end-to-end: a slated match starts on it
  await seedLiveMatch(page, { courtId: late.id })
  expect((await liveState(page)).activeMatches.some(m => m.court_number === late.id)).toBe(true)
})

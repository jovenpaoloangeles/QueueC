// tests/e2e/20-init-phase.spec.js
// Initialization phase: dynamic court config, per-court countdown/expiry,
// 7-tier skills, Search-and-Add combobox (single-screen setup).
import { test, expect } from '../fixtures.js'
import { poolRow, base, createSession, checkinPlayers, startSession, clickStartMatch } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await page.goto('/')
  await page.getByTestId('session-setup').waitFor()
})

// --- Dynamic Court Generator ---

test('20.1 court count field renders matching config rows', async ({ page }) => {
  await expect(page.locator('[data-testid="court-row"]')).toHaveCount(2) // default 2
  await page.getByLabel('Number of courts').fill('5')
  await expect(page.locator('[data-testid="court-row"]')).toHaveCount(5)
  await page.getByLabel('Number of courts').fill('1')
  await expect(page.locator('[data-testid="court-row"]')).toHaveCount(1)
})

test('20.2 court rows get default labels Court 1..N', async ({ page }) => {
  await page.getByLabel('Number of courts').fill('3')
  await expect(page.getByLabel('Court 1 label')).toHaveValue('Court 1')
  await expect(page.getByLabel('Court 2 label')).toHaveValue('Court 2')
  await expect(page.getByLabel('Court 3 label')).toHaveValue('Court 3')
})

test('20.3 custom court label respected on start', async ({ page }) => {
  await page.getByLabel('Court 1 label').fill('Center Court')
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.locator('text=Center Court')).toBeVisible()
})

test('20.4 per-court hours input present (replaces duration selector)', async ({ page }) => {
  const hrs = page.getByLabel('Court 1 hours')
  await expect(hrs).toBeVisible()
  await expect(hrs).toHaveValue('2')
  await expect(page.getByLabel('Court 1 duration')).toHaveCount(0)
})

// --- Per-Court Countdown & Expiry ---

test('20.5 court duration saved and applied on session start', async ({ page }) => {
  await page.getByLabel('Court 1 hours').fill('1')
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  // countdown timer visible on Court 1, ticking down from ~1h
  const countdown = page.locator('[data-testid="court-countdown"]').first()
  await expect(countdown).toBeVisible()
  await expect(countdown).toContainText(/\d+:\d\d/)
})

test('20.7 expired idle court stays visible with extend panel', async ({ page }) => {
  await page.getByLabel('Number of courts').fill('2')
  await page.getByLabel('Court 1 hours').fill('1')
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.locator('text=Court 1')).toBeVisible()

  // Force-expire court 1 via API (backdate expires_at)
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  const { courts } = await (await page.request.get(`${base()}/api/sessions/${session.id}/courts`)).json()
  const court1 = courts.find(c => c.label === 'Court 1')
  await page.request.fetch(`${base()}/api/courts/${court1.id}`, {
    method: 'PATCH', data: { expires_at: Math.floor(Date.now() / 1000) - 60 },
  })
  // expired court no longer accepts play: it stays in view as a red panel
  // with the extend action; court 2 (no timer) is still live
  await expect(page.locator('text=Court 1')).toBeVisible()
  await expect(page.getByTestId('btn-extend-court')).toBeVisible()
  await expect(page.locator('text=Court 2')).toBeVisible()
})

test('20.8 expired court blocks new match start (server-side)', async ({ page }) => {
  await page.getByLabel('Number of courts').fill('1')
  await page.getByLabel('Court 1 hours').fill('1')
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)

  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  const { courts } = await (await page.request.get(`${base()}/api/sessions/${session.id}/courts`)).json()
  const court1 = courts[0]
  await page.request.fetch(`${base()}/api/courts/${court1.id}`, {
    method: 'PATCH', data: { expires_at: Math.floor(Date.now() / 1000) - 60 },
  })
  const entries = await page.evaluate(async (sid) => {
    const r = await fetch(`/api/sessions/${sid}/suggest?mode=singles`)
    return (await r.json()).suggestion
  }, session.id)
  const res = await page.request.post(`${base()}/api/matches`, {
    data: {
      session_id: session.id, court_number: court1.id,
      team1_p1: entries[0], team2_p1: entries[2],
    },
  })
  expect(res.status()).toBe(400)
  expect((await res.json()).error).toContain('expired')
})

test('20.9 expired court mid-match shows Last Game badge and persists until match ends', async ({ page }) => {
  await page.getByLabel('Number of courts').fill('1')
  await page.getByLabel('Court 1 hours').fill('1')
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)

  // start a singles match
  await page.locator('[data-entry-id]').nth(0).click()
  await page.locator('[data-entry-id]').nth(1).click()
  await clickStartMatch(page)
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(1)

  // expire the court mid-game
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  const { courts } = await (await page.request.get(`${base()}/api/sessions/${session.id}/courts`)).json()
  await page.request.fetch(`${base()}/api/courts/${courts[0].id}`, {
    method: 'PATCH', data: { expires_at: Math.floor(Date.now() / 1000) - 10 },
  })

  // graceful finish: court still visible with Last Game badge + End Match still available
  await expect(page.locator('[data-testid="expiring-last-game-badge"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'End Match' })).toBeVisible()

  // end the match → expired court remains in view as the extend panel
  await page.getByRole('button', { name: 'End Match' }).first().click()
  await page.getByTestId('confirm-end-end').click() // pass the confirm gate
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Court 1', { exact: true })).toBeVisible()
  await expect(page.getByTestId('btn-extend-court')).toBeVisible()
})

// --- Search-and-Add Combobox ---

test('20.10 typing filters pool into combobox matches', async ({ page }) => {
  const search = page.getByLabel('Search or add player')
  await search.fill('Inter C')
  await expect(page.locator('[data-testid="combobox-matches"] button')).toHaveCount(4)
})

test('20.11 1-click select from combobox marks the chip selected', async ({ page }) => {
  await page.getByLabel('Search or add player').fill('Inter C1')
  await page.locator('[data-testid="combobox-matches"]').getByRole('button', { name: /Inter C1/ }).click()
  await expect(page.getByTestId('selected-count')).toHaveText('1 selected')
  await expect(poolRow(page, 'Inter C1')).toHaveAttribute('aria-checked', 'true')
})

test('20.12 register new player inline with 7-tier skill dropdown', async ({ page }) => {
  const name = `Rookie ${Date.now().toString(36)}`
  await page.getByLabel('Search or add player').fill(name)
  const prompt = page.locator('[data-testid="register-new-player-prompt"]')
  await expect(prompt).toBeVisible()
  await expect(prompt.locator('select option')).toHaveCount(7)
  await prompt.locator('select').selectOption('professional')
  await prompt.getByRole('button', { name: 'Add Player' }).click()
  const chip = poolRow(page, name)
  await expect(chip).toHaveAttribute('aria-checked', 'true')
  await expect(chip).toContainText('Professional')
})

test('20.13 selected duplicate blocks registration with inline error', async ({ page }) => {
  await checkinPlayers(page, ['Inter C1'])
  const search = page.getByLabel('Search or add player')
  await search.fill('inter c1') // normalized duplicate (case-insensitive)
  await expect(page.locator('[data-testid="duplicate-session-error"]')).toContainText('already selected')
  await expect(page.locator('[data-testid="register-new-player-prompt"]')).toHaveCount(0)
  // draft spec: duplicate attempt disables the Add button (scoped to the
  // duplicate-error block — header '+ Add Player' has the same substring)
  await expect(
    page.locator('[data-testid="duplicate-session-error"]').getByRole('button', { name: 'Add Player' })
  ).toBeDisabled()
})

test('20.14 database collision shows existing profile instead of duplicate create', async ({ page }) => {
  const search = page.getByLabel('Search or add player')
  await search.fill('Upper D1') // exists in DB but not in session
  // existing profile surfaced as a 1-click select option
  await expect(page.locator('[data-testid="combobox-matches"]')).toContainText('Upper D1')
  // and no register prompt for an exact DB match
  await expect(page.locator('[data-testid="register-new-player-prompt"]')).toHaveCount(0)
})

// --- 7-Tier Skill Badges ---

test('20.15 all 7 tiers render distinct badges in the pool', async ({ page }) => {
  const pool = page.getByTestId('player-list')
  await expect(pool).toContainText('Newbie')
  await expect(pool).toContainText('Beginner')
  await expect(pool).toContainText('Lower Intermediate')
  await expect(pool).toContainText('Intermediate')
  await expect(pool).toContainText('Upper Intermediate')
  await expect(pool).toContainText('Expert')
  await expect(pool).toContainText('Professional')
})

// --- Active Player Row: games-played badge + status timer ---

test('20.16 player row shows games played badge [0] and waiting status timer', async ({ page }) => {
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  const card = page.locator('[data-entry-id]').first()
  await expect(card.locator('[data-testid="games-played-badge"]')).toHaveText('[0]')
  const badge = card.locator('[data-testid="status-timer-badge"]')
  // no caption on plain waiting (draft r3 — everyone in the grid is waiting)
  await expect(badge).not.toContainText('Waiting')
  await expect(badge).toContainText(/\d+:\d+/) // wait clock (timer dot emojis retired in the redesign)
})

test('20.17 games played increments after a match ends', async ({ page }) => {
  await checkinPlayers(page, ['Inter C1', 'Inter C2', 'Inter C3', 'Inter C4'])
  await startSession(page)
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await clickStartMatch(page)
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(1)
  await page.getByRole('button', { name: 'End Match' }).first().click()
  await page.getByTestId('confirm-end-end').click() // pass the confirm gate
  await page.getByLabel('Team 1').fill('21')
  await page.getByLabel('Team 2').fill('15')
  await page.getByRole('button', { name: 'Confirm' }).click()
  // all four returned players show [1]
  await expect(page.locator('[data-testid="games-played-badge"]')).toHaveCount(4)
  for (const badge of await page.locator('[data-testid="games-played-badge"]').all()) {
    await expect(badge).toHaveText('[1]')
  }
})

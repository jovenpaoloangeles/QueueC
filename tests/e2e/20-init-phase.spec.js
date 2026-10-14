// tests/e2e/20-init-phase.spec.js
// Initialization phase: dynamic court config, per-court countdown/expiry,
// 7-tier skills, Search-and-Add combobox, inline player edit.
import { test, expect } from '@playwright/test'
import { BASE, createSession, checkinPlayers, startSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await page.goto('/')
  await page.getByRole('button', { name: '+ Start New Session' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForSelector('[role="dialog"]')
})

// --- Dynamic Court Generator ---

test('20.1 court count field renders matching config rows', async ({ page }) => {
  await expect(page.locator('[data-testid="dynamic-court-rows"] input')).toHaveCount(2) // default 2
  await page.getByLabel('Courts').fill('5')
  await expect(page.locator('[data-testid="dynamic-court-rows"] input')).toHaveCount(5)
  await page.getByLabel('Courts').fill('1')
  await expect(page.locator('[data-testid="dynamic-court-rows"] input')).toHaveCount(1)
})

test('20.2 court rows get default labels Court 1..N', async ({ page }) => {
  await page.getByLabel('Courts').fill('3')
  await expect(page.getByLabel('Court 1 label')).toHaveValue('Court 1')
  await expect(page.getByLabel('Court 2 label')).toHaveValue('Court 2')
  await expect(page.getByLabel('Court 3 label')).toHaveValue('Court 3')
})

test('20.3 custom court label respected on create', async ({ page }) => {
  await page.getByLabel('Court 1 label').fill('Center Court')
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await expect(page.locator('text=Center Court')).toBeVisible()
})

test('20.4 per-court duration selector present in modal', async ({ page }) => {
  const dur = page.getByLabel('Court 1 duration')
  await expect(dur).toBeVisible()
  await expect(dur.locator('option')).toHaveCount(8) // no-timer + 6 presets + Custom
})

// --- Per-Court Countdown & Expiry ---

test('20.5 court duration saved and applied on session start', async ({ page }) => {
  await page.getByLabel('Court 1 duration').selectOption('60')
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  // countdown timer visible on Court 1, ticking down from ~1h
  const countdown = page.locator('[data-testid="court-countdown"]').first()
  await expect(countdown).toBeVisible()
  await expect(countdown).toContainText(/\d+:\d\d/)
})

test('20.6 court without duration shows no countdown', async ({ page }) => {
  await page.getByLabel('Courts').fill('1')
  await page.getByLabel('Court 1 duration').selectOption('') // no timer
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.locator('[data-testid="court-countdown"]')).toHaveCount(0)
})

test('20.7 expired idle court stays visible with extend panel', async ({ page }) => {
  await page.getByLabel('Courts').fill('2')
  await page.getByLabel('Court 1 duration').selectOption('60')
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.locator('text=Court 1')).toBeVisible()

  // Force-expire court 1 via API (backdate expires_at)
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  const { courts } = await (await page.request.get(`${BASE}/api/sessions/${session.id}/courts`)).json()
  const court1 = courts.find(c => c.label === 'Court 1')
  await page.request.fetch(`${BASE}/api/courts/${court1.id}`, {
    method: 'PATCH', data: { expires_at: Math.floor(Date.now() / 1000) - 60 },
  })
  await page.waitForTimeout(1200) // SSE tick
  // expired court no longer accepts play: it stays in view as a red panel
  // with the extend action; court 2 (no timer) is still live
  await expect(page.locator('text=Court 1')).toBeVisible()
  await expect(page.getByTestId('btn-extend-court')).toBeVisible()
  await expect(page.locator('text=Court 2')).toBeVisible()
})

test('20.8 expired court blocks new match start (server-side)', async ({ page }) => {
  await page.getByLabel('Courts').fill('1')
  await page.getByLabel('Court 1 duration').selectOption('60')
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)

  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  const { courts } = await (await page.request.get(`${BASE}/api/sessions/${session.id}/courts`)).json()
  const court1 = courts[0]
  await page.request.fetch(`${BASE}/api/courts/${court1.id}`, {
    method: 'PATCH', data: { expires_at: Math.floor(Date.now() / 1000) - 60 },
  })
  const entries = await page.evaluate(async (sid) => {
    const r = await fetch(`/api/sessions/${sid}/suggest?mode=singles`)
    return (await r.json()).suggestion
  }, session.id)
  const res = await page.request.post(`${BASE}/api/matches`, {
    data: {
      session_id: session.id, court_number: court1.id,
      team1_p1: entries[0], team2_p1: entries[2],
    },
  })
  expect(res.status()).toBe(400)
  expect((await res.json()).error).toContain('expired')
})

test('20.9 expired court mid-match shows Last Game badge and persists until match ends', async ({ page }) => {
  await page.getByLabel('Courts').fill('1')
  await page.getByLabel('Court 1 duration').selectOption('60')
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await page.getByRole('button', { name: 'Manual' }).click()

  // start a singles match
  await page.locator('[data-entry-id]').nth(0).click()
  await page.locator('[data-entry-id]').nth(1).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(1)

  // expire the court mid-game
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  const { courts } = await (await page.request.get(`${BASE}/api/sessions/${session.id}/courts`)).json()
  await page.request.fetch(`${BASE}/api/courts/${courts[0].id}`, {
    method: 'PATCH', data: { expires_at: Math.floor(Date.now() / 1000) - 10 },
  })
  await page.waitForTimeout(1200)

  // graceful finish: court still visible with Last Game badge + End Match still available
  await expect(page.locator('[data-testid="expiring-last-game-badge"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'End Match' })).toBeVisible()

  // end the match → expired court remains in view as the extend panel
  await page.getByRole('button', { name: 'End Match' }).first().click()
  await page.getByTestId('confirm-end-end').click() // pass the confirm gate
  await page.getByRole('button', { name: 'Confirm' }).click()
  await page.waitForTimeout(1200)
  await expect(page.locator('text=Court 1')).toBeVisible()
  await expect(page.getByTestId('btn-extend-court')).toBeVisible()
})

// --- Search-and-Add Combobox ---

test('20.10 typing filters pool into combobox matches', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  const search = page.getByLabel('Search or add player')
  await search.fill('Inter C')
  await expect(page.locator('[data-testid="combobox-matches"] button')).toHaveCount(4)
})

test('20.11 1-click check-in from combobox', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await page.getByLabel('Search or add player').fill('Inter C1')
  await page.locator('[data-testid="combobox-matches"]').getByRole('button', { name: /Inter C1/ }).click()
  await page.waitForTimeout(500)
  await expect(page.locator('ol').locator('text=Inter C1')).toBeVisible()
  await expect(page.locator('text=Queue · 1')).toBeVisible()
})

test('20.12 register new player inline with 7-tier skill dropdown', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  const name = `Rookie ${Date.now().toString(36)}`
  await page.getByLabel('Search or add player').fill(name)
  const prompt = page.locator('[data-testid="register-new-player-prompt"]')
  await expect(prompt).toBeVisible()
  await expect(prompt.locator('select option')).toHaveCount(7)
  await prompt.locator('select').selectOption('professional')
  await prompt.getByRole('button', { name: 'Add Player' }).click()
  await page.waitForTimeout(600)
  await expect(page.locator('ol').locator(`text=${name}`)).toBeVisible()
  await expect(page.locator('ol').locator(`text=${name}`).locator('..')).toContainText('professional')
})

test('20.13 session duplicate blocks registration with inline error', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await checkinPlayers(page, ['Inter C1'])
  const search = page.getByLabel('Search or add player')
  await search.fill('inter c1') // normalized duplicate (case-insensitive)
  await expect(page.locator('[data-testid="duplicate-session-error"]')).toContainText('already active in this session')
  await expect(page.locator('[data-testid="register-new-player-prompt"]')).toHaveCount(0)
  // draft spec: duplicate attempt disables the Add button (scoped to the
  // duplicate-error block — header '+ Add Player' has the same substring)
  await expect(
    page.locator('[data-testid="duplicate-session-error"]').getByRole('button', { name: 'Add Player' })
  ).toBeDisabled()
})

test('20.14 database collision shows existing profile instead of duplicate create', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  const search = page.getByLabel('Search or add player')
  await search.fill('Upper D1') // exists in DB but not in session
  // existing profile surfaced as a 1-click check-in option
  await expect(page.locator('[data-testid="combobox-matches"]')).toContainText('Upper D1')
  // and no register prompt for an exact DB match
  await expect(page.locator('[data-testid="register-new-player-prompt"]')).toHaveCount(0)
})

// --- 7-Tier Skill Badges ---

test('20.15 all 7 tiers render distinct badges in the pool', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  const pool = page.locator('[data-testid="player-pool"]')
  await expect(pool).toContainText('newbie')
  await expect(pool).toContainText('beginner')
  await expect(pool).toContainText('lower intermediate')
  await expect(pool).toContainText('intermediate')
  await expect(pool).toContainText('upper intermediate')
  await expect(pool).toContainText('expert')
  await expect(pool).toContainText('professional')
})

// --- Active Player Row: games-played badge + status timer ---

test('20.16 player row shows games played badge [0] and waiting status timer', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  const card = page.locator('[data-entry-id]').first()
  await expect(card.locator('[data-testid="games-played-badge"]')).toHaveText('[0]')
  const badge = card.locator('[data-testid="status-timer-badge"]')
  await expect(badge).toContainText('Waiting')
  await expect(badge).toContainText('🟡')
})

test('20.17 games played increments after a match ends', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await checkinPlayers(page, ['Inter C1', 'Inter C2', 'Inter C3', 'Inter C4'])
  await startSession(page)
  await page.getByRole('button', { name: 'Manual' }).click() // avoid smart pre-selection toggling off
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'End Match' }).first().click()
  await page.getByTestId('confirm-end-end').click() // pass the confirm gate
  await page.getByLabel('Team 1').fill('21')
  await page.getByLabel('Team 2').fill('15')
  await page.getByRole('button', { name: 'Confirm' }).click()
  await page.waitForTimeout(800)
  // all four returned players show [1]
  await expect(page.locator('[data-testid="games-played-badge"]')).toHaveCount(4)
  for (const badge of await page.locator('[data-testid="games-played-badge"]').all()) {
    await expect(badge).toHaveText('[1]')
  }
})

// --- On-the-Fly Player Edit ---

test('20.18 edit player name + skill from queue rows', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await checkinPlayers(page, ['Inter C1'])
  await page.getByRole('button', { name: 'Edit Inter C1' }).click()
  const row = page.locator('ol li').first()
  await row.getByLabel(/^Edit name/).fill('Inter C1 Renamed')
  await row.getByLabel(/^Edit skill/).selectOption('expert')
  await row.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(600)
  await expect(page.locator('ol').locator('text=Inter C1 Renamed')).toBeVisible()
  await expect(page.locator('ol li').first()).toContainText('expert')
})

test('20.19 inline edit duplicate name rejected', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await page.getByRole('button', { name: 'Edit Inter C1' }).click()
  const row = page.locator('ol li').first()
  await row.getByLabel(/^Edit name/).fill('inter c2') // collides with Inter C2
  await row.getByRole('button', { name: 'Save' }).click()
  await expect(row).toContainText('Player name already exists')
})

test('20.20 edited skill propagates to persistent DB (player pool after re-checkin)', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  // unique player: earlier tests may have renamed fixture players persistently
  const name = `SkillSync ${Date.now().toString(36)}`
  const created = await (await page.request.post(`${BASE}/api/players`, {
    data: { name, skill_level: 'intermediate' },
  })).json()
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  await page.request.post(`${BASE}/api/sessions/${session.id}/checkin`, {
    data: { player_id: created.player.id },
  })
  await page.waitForTimeout(800) // SSE tick to render the queue row
  await page.getByRole('button', { name: `Edit ${name}` }).click()
  const row = page.locator('ol li').first() // only player checked in; name is now an input value
  await row.getByLabel(/^Edit skill/).selectOption('professional')
  await row.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(600)
  // skill syncs to the players table via PATCH /api/players/:id
  const { players } = await (await page.request.get(`${BASE}/api/players`)).json()
  const p = players.find(x => x.id === created.player.id)
  expect(p.skill_level).toBe('professional')
})
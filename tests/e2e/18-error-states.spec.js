// tests/e2e/18-error-states.spec.js
import { test, expect } from '../fixtures.js'
import { execSync } from 'node:child_process'
import { base, fullSetup, createSession, checkinPlayers, startSession, startDoubles } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
})

test('18.1 page reload mid-session restores state', async ({ page }) => {
  await fullSetup(page)
  await page.reload()
  await page.waitForTimeout(1000) // SSE reconnect
  await expect(page.locator('text=Queue ·')).toBeVisible()
  await expect(page.locator('[data-entry-id]')).toHaveCount(8)
})

test('18.4 empty queue shows empty state', async ({ page }) => {
  // Already cleaned up in beforeEach — just start fresh with 2 players
  await createSession(page)
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  // Bench both
  await page.locator('[data-entry-id]').first().click({ modifiers: ['Shift'] })
  await page.waitForTimeout(300)
  await page.locator('[data-entry-id]').first().click({ modifiers: ['Shift'] })
  await page.waitForTimeout(300)
  // Queue grid should be empty — no player cards
  await expect(page.locator('[data-entry-id]')).toHaveCount(0)
})

test('18.2 SSE reconnects and state resumes', async ({ page }) => {
  await fullSetup(page, { courts: 1 })
  // black out SSE, then reload — app shows landing (state arrives only via SSE)
  await page.route('**/api/sse', route => route.abort())
  await page.reload()
  await expect(page.locator('text=No active session')).toBeVisible()
  // state changes server-side while SSE is down
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  const { players } = await (await page.request.get(`${base()}/api/players`)).json()
  const newbie = players.find(p => p.name === 'Newbie A1')
  await page.request.post(`${base()}/api/sessions/${session.id}/checkin`, {
    data: { player_id: newbie.id },
  })
  // restore SSE — client retries every 3s
  await page.unroute('**/api/sse')
  await expect(page.locator('text=Test Session')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('[data-entry-id]')).toHaveCount(9)
})

test('18.5 all players playing — queue empty, resting tray empty', async ({ page }) => {
  await fullSetup(page, { courts: 2 })
  await startDoubles(page)
  await startDoubles(page)
  await expect(page.locator('[data-entry-id]')).toHaveCount(0)
  await expect(page.locator('text=Drop a player here to bench them')).toBeVisible()
})

test('18.6 end session with active match — match preserved in DB', async ({ page, server }) => {
  await fullSetup(page, { courts: 1 })
  await startDoubles(page)
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  await page.getByRole('button', { name: 'End Session' }).click()
  await expect(page.locator('text=No active session')).toBeVisible()
  const rows = execSync(
    `sqlite3 ${server.dbPath} "SELECT COUNT(*) FROM matches WHERE session_id = ${session.id} AND ended_at IS NULL"`
  ).toString().trim()
  expect(rows).toBe('1')
})

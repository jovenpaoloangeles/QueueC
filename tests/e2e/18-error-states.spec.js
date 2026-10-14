// tests/e2e/18-error-states.spec.js
import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { BASE, fullSetup, createSession, checkinPlayers, startSession, startDoubles } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
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
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  const { players } = await (await page.request.get(`${BASE}/api/players`)).json()
  const newbie = players.find(p => p.name === 'Newbie A1')
  await page.request.post(`${BASE}/api/sessions/${session.id}/checkin`, {
    data: { player_id: newbie.id },
  })
  // restore SSE — client retries every 3s
  await page.unroute('**/api/sse')
  await expect(page.locator('text=Test Session')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('[data-entry-id]')).toHaveCount(9)
})

test('18.3 starting match on disabled court not possible', async ({ page }) => {
  await fullSetup(page, { courts: 2 })
  await page.locator('text=Open').locator('..').locator('input[type="checkbox"]').first().click()
  await page.waitForTimeout(400)
  await expect(page.locator('text=Court 1')).toHaveCount(0)
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  // only the enabled court offers Start Match
  await expect(page.getByRole('button', { name: 'Start Match' })).toHaveCount(1)
})

test('18.5 all players playing — queue empty, resting tray empty', async ({ page }) => {
  await fullSetup(page, { courts: 2 })
  await startDoubles(page)
  await startDoubles(page)
  await expect(page.locator('[data-entry-id]')).toHaveCount(0)
  await expect(page.locator('text=Drop a player here to bench them')).toBeVisible()
})

test('18.6 end session with active match — match preserved in DB', async ({ page }) => {
  await fullSetup(page, { courts: 1 })
  await startDoubles(page)
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  await page.getByRole('button', { name: 'End Session' }).click()
  await expect(page.locator('text=No active session')).toBeVisible()
  const rows = execSync(
    `sqlite3 /tmp/queuec-test.db "SELECT COUNT(*) FROM matches WHERE session_id = ${session.id} AND ended_at IS NULL"`
  ).toString().trim()
  expect(rows).toBe('1')
})

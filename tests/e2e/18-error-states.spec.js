// tests/e2e/18-error-states.spec.js
import { test, expect } from '@playwright/test'
import { BASE, fullSetup, createSession, checkinPlayers, startSession } from '../helpers.js'

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

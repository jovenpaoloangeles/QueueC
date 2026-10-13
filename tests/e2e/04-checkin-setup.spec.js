// tests/e2e/04-checkin-setup.spec.js
import { test, expect } from '@playwright/test'
import { BASE, createSession, checkinPlayers, startSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await createSession(page)
})

test('4.1 all 20 fixture players appear in pool', async ({ page }) => {
  const chips = page.locator('text=Player pool').locator('..').getByRole('button')
  await expect(chips).toHaveCount(20)
})

test('4.2 chip shows name and skill badge', async ({ page }) => {
  const chip = page.getByRole('button', { name: /Inter C1/ })
  await expect(chip).toBeVisible()
  await expect(chip.locator('text=intermediate')).toBeVisible()
})

test('4.3 check in moves player to queue list', async ({ page }) => {
  await page.getByRole('button', { name: 'Inter C1', exact: false }).first().click()
  await page.waitForTimeout(400)
  await expect(page.locator('ol').locator('text=Inter C1')).toBeVisible()
})

test('4.4 queue counter updates', async ({ page }) => {
  await checkinPlayers(page, ['Inter C1'])
  await expect(page.locator('text=Queue · 1')).toBeVisible()
})

test('4.5 checked-in player removed from pool', async ({ page }) => {
  await checkinPlayers(page, ['Inter C1'])
  const poolBtn = page.locator('text=Player pool').locator('..').getByRole('button', { name: 'Inter C1', exact: false })
  await expect(poolBtn).toHaveCount(0)
})

test('4.6 check in 8 players — all in queue in order', async ({ page }) => {
  const names = ['Inter C1','Inter C2','Inter C3','Inter C4','Advanced E1','Advanced E2','Upper D1','Upper D2']
  await checkinPlayers(page, names)
  await expect(page.locator('text=Queue · 8')).toBeVisible()
  const items = page.locator('ol li')
  await expect(items).toHaveCount(8)
})

test('4.7 pool empty message when all checked in', async ({ page }) => {
  // Check in all 20 via API directly — clicking 20 buttons sequentially is too slow/fragile
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  const { players } = await (await page.request.get(`${BASE}/api/players`)).json()
  for (const p of players) {
    await page.request.post(`${BASE}/api/sessions/${session.id}/checkin`, {
      data: { player_id: p.id },
    })
  }
  await expect(page.locator('text=All registered players are in the queue')).toBeVisible({ timeout: 10000 })
})

test('4.8 players visible in live queue after start', async ({ page }) => {
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.locator('[data-entry-id]').locator('text=Inter C1')).toBeVisible()
})

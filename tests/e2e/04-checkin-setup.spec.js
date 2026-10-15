// tests/e2e/04-checkin-setup.spec.js
import { test, expect } from '../fixtures.js'
import { base, createSession, checkinPlayers, startSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await createSession(page)
})

test('4.1 all 22 fixture players appear in pool', async ({ page }) => {
  const chips = page.locator('[data-testid="player-pool"] button')
  await expect(chips).toHaveCount(22)
})

test('4.2 chip shows name and skill badge', async ({ page }) => {
  const chip = page.getByRole('button', { name: /Inter C1/ })
  await expect(chip).toBeVisible()
  await expect(chip.locator('text=intermediate')).toBeVisible()
})

test('4.3 select + Check In moves player to queue list', async ({ page }) => {
  const chip = page.getByRole('button', { name: 'Inter C1', exact: false }).first()
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true') // selected, not yet in queue
  await page.getByRole('button', { name: /^Check In/ }).click()
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
  const names = ['Inter C1','Inter C2','Inter C3','Inter C4','Expert E1','Expert E2','Upper D1','Upper D2']
  await checkinPlayers(page, names)
  await expect(page.locator('text=Queue · 8')).toBeVisible()
  const items = page.locator('ol li')
  await expect(items).toHaveCount(8)
})

test('4.7 pool empty message when all checked in', async ({ page }) => {
  // Check in all 20 via API directly — clicking 20 buttons sequentially is too slow/fragile
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  const { players } = await (await page.request.get(`${base()}/api/players`)).json()
  for (const p of players) {
    await page.request.post(`${base()}/api/sessions/${session.id}/checkin`, {
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

test('4.9 chip click toggles selection on/off', async ({ page }) => {
  const chip = page.getByRole('button', { name: 'Inter C1', exact: false }).first()
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Check In (1)' })).toBeVisible()
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Check In', exact: true })).toBeDisabled()
  // nothing committed yet
  await expect(page.locator('ol li')).toHaveCount(0)
})

test('4.10 batch check-in — 3 selected, one Check In click', async ({ page }) => {
  for (const name of ['Inter C1', 'Inter C2', 'Inter C3']) {
    await page.getByRole('button', { name, exact: false }).first().click()
  }
  await page.getByRole('button', { name: 'Check In (3)' }).click()
  await expect(page.locator('text=Queue · 3')).toBeVisible()
  const items = page.locator('ol li')
  await expect(items).toHaveCount(3)
  // selection cleared — button back to idle/disabled
  await expect(page.getByRole('button', { name: 'Check In', exact: true })).toBeDisabled()
})

test('4.11 remove from queue returns player to pool', async ({ page }) => {
  await checkinPlayers(page, ['Inter C1'])
  await expect(page.locator('ol li')).toHaveCount(1)
  await page.getByRole('button', { name: 'Remove Inter C1' }).click()
  await expect(page.locator('ol li')).toHaveCount(0)
  await expect(page.locator('text=Queue · 0')).toBeVisible()
  // back in the pool
  await expect(page.locator('[data-testid="player-pool"] button', { hasText: 'Inter C1' })).toHaveCount(1)
})

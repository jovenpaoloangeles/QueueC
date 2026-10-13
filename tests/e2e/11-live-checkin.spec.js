// tests/e2e/11-live-checkin.spec.js
import { test, expect } from '@playwright/test'
import { BASE, createSession, checkinPlayers, startSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  // Only check in 4 players — leaves 16 available for live check-in
  await createSession(page)
  await checkinPlayers(page, ['Inter C1', 'Inter C2', 'Inter C3', 'Inter C4'])
  await startSession(page)
})

test('11.1 "+ Check In" button visible', async ({ page }) => {
  await expect(page.getByRole('button', { name: '+ Check In' })).toBeVisible()
})

test('11.2 panel shows players not in session', async ({ page }) => {
  await page.getByRole('button', { name: '+ Check In' }).click()
  // Advanced E1 was not checked in — should be in panel
  await expect(page.locator('text=Advanced E1')).toBeVisible()
})

test('11.3 checking in appends to queue end', async ({ page }) => {
  const beforeCount = await page.locator('[data-entry-id]').count()
  await page.getByRole('button', { name: '+ Check In' }).click()
  await page.getByRole('button', { name: 'Advanced E1', exact: false }).click()
  await page.waitForTimeout(400)
  await expect(page.locator('[data-entry-id]')).toHaveCount(beforeCount + 1)
})

test('11.4 panel closes after check-in', async ({ page }) => {
  await page.getByRole('button', { name: '+ Check In' }).click()
  await page.getByRole('button', { name: 'Advanced E1', exact: false }).click()
  await page.waitForTimeout(400)
  await expect(page.locator('text=Advanced E1').locator('../..').getByRole('button', { name: 'Advanced E1', exact: false })).toHaveCount(0)
})

test('11.5 checked-in player absent from panel', async ({ page }) => {
  await page.getByRole('button', { name: '+ Check In' }).click()
  await page.getByRole('button', { name: 'Advanced E1', exact: false }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: '+ Check In' }).click()
  await expect(page.locator('text=Advanced E1')).toHaveCount(0)
})

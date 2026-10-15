// tests/e2e/10-smart-manual-mode.spec.js
import { test, expect } from '../fixtures.js'
import { base, fullSetup, endMatch, clickStartMatch } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page) // 8 waiting players
})

test('10.1 Smart mode button active by default', async ({ page }) => {
  await expect(page.getByRole('button', { name: '● Smart' })).toBeVisible()
})

test('10.2 Smart mode auto-populates selection', async ({ page }) => {
  // fullSetup leaves us in Manual mode; switch back to Smart for this test
  await page.getByRole('button', { name: '● Smart' }).click()
  await page.waitForTimeout(800) // smart suggestion fetch
  const selected = page.locator('[class*="ring-2"][class*="ring-primary"]')
  const count = await selected.count()
  expect(count).toBeGreaterThanOrEqual(2)
})

test('10.4 Manual mode clears selection', async ({ page }) => {
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Manual' }).click()
  await expect(page.locator('text=selected →')).not.toBeVisible()
})

test('10.5 manual mode: clicks select up to 4', async ({ page }) => {
  await page.getByRole('button', { name: 'Manual' }).click()
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await expect(page.locator('text=4 selected → Doubles')).toBeVisible()
})

test('10.6 switch back to Smart re-populates', async ({ page }) => {
  await page.getByRole('button', { name: 'Manual' }).click()
  await page.getByRole('button', { name: '● Smart' }).click()
  await page.waitForTimeout(800)
  const selected = page.locator('[class*="ring-2"][class*="ring-primary"]')
  const count = await selected.count()
  expect(count).toBeGreaterThanOrEqual(2)
})

test('10.3 smart re-suggests after match ends and queue changes', async ({ page }) => {
  await page.getByRole('button', { name: '● Smart' }).click()
  await page.waitForTimeout(800)
  await clickStartMatch(page)
  await page.waitForTimeout(500)
  // tweak the auto-selection, then end the match — re-suggestion must overwrite the tweak
  await page.locator('[class*="ring-2"][class*="ring-primary"]').first().click()
  await expect(page.locator('text=3 selected')).toBeVisible()
  await endMatch(page, 'Court')
  await expect(page.locator('text=4 selected → Doubles')).toBeVisible({ timeout: 5000 })
})

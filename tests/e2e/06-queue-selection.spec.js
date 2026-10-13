// tests/e2e/06-queue-selection.spec.js
import { test, expect } from '@playwright/test'
import { BASE, fullSetup } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

test('6.1 click player — selected, badge shows 1', async ({ page }) => {
  await page.locator('[data-entry-id]').first().click()
  await expect(page.locator('text=1').first()).toBeVisible()
})

test('6.2 2 selected → Singles label', async ({ page }) => {
  await page.locator('[data-entry-id]').nth(0).click()
  await page.locator('[data-entry-id]').nth(1).click()
  await expect(page.locator('text=2 selected → Singles')).toBeVisible()
})

test('6.3 4 selected → Doubles label', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await expect(page.locator('text=4 selected → Doubles')).toBeVisible()
})

test('6.4 5th click does nothing', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.locator('[data-entry-id]').nth(4).click()
  await expect(page.locator('text=4 selected → Doubles')).toBeVisible()
})

test('6.5 click selected player deselects', async ({ page }) => {
  await page.locator('[data-entry-id]').nth(0).click()
  await page.locator('[data-entry-id]').nth(1).click()
  await page.locator('[data-entry-id]').nth(0).click()
  await expect(page.locator('text=1 selected')).toBeVisible()
})

test('6.7 badges show correct sequential numbers', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  for (const n of ['1', '2', '3', '4']) {
    await expect(page.locator(`[class*="rounded-full"][class*="bg-primary"]`).locator(`text=${n}`)).toBeVisible()
  }
})

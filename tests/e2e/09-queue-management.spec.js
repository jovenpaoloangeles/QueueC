// tests/e2e/09-queue-management.spec.js
import { test, expect } from '@playwright/test'
import { BASE, fullSetup } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

test('9.4 shift-click benches player', async ({ page }) => {
  const card = page.locator('[data-entry-id]').first()
  const name = await card.locator('.text-base.font-medium').textContent()
  await card.click({ modifiers: ['Shift'] })
  await page.waitForTimeout(400)
  await expect(page.locator('[data-drop="resting"]').locator(`text=${name?.trim()}`)).toBeVisible()
})

test('9.5 resting tray shows benched player', async ({ page }) => {
  await page.locator('[data-entry-id]').first().click({ modifiers: ['Shift'] })
  await page.waitForTimeout(400)
  await expect(page.locator('[data-drop="resting"]').getByRole('button')).toHaveCount(1)
})

test('9.6 resting player absent from queue grid', async ({ page }) => {
  const card = page.locator('[data-entry-id]').first()
  const name = await card.locator('.text-base.font-medium').textContent()
  await card.click({ modifiers: ['Shift'] })
  await page.waitForTimeout(400)
  await expect(page.locator('[data-entry-id]').locator(`text=${name?.trim()}`)).toHaveCount(0)
})

test('9.8 Return button restores to waiting', async ({ page }) => {
  const card = page.locator('[data-entry-id]').first()
  const name = await card.locator('.text-base.font-medium').textContent()
  await card.click({ modifiers: ['Shift'] })
  await page.waitForTimeout(400)
  await page.locator('[data-drop="resting"]').getByRole('button', { name: /↩/ }).click()
  await page.waitForTimeout(400)
  await expect(page.locator('[data-entry-id]').locator(`text=${name?.trim()}`)).toBeVisible()
})

test('9.11 bench selected player removes from selection', async ({ page }) => {
  await page.locator('[data-entry-id]').nth(0).click()
  await page.locator('[data-entry-id]').nth(1).click()
  await page.locator('[data-entry-id]').nth(0).click({ modifiers: ['Shift'] })
  await page.waitForTimeout(300)
  await expect(page.locator('text=1 selected')).toBeVisible()
})

test('9.12 tray shows placeholder when empty', async ({ page }) => {
  await expect(page.locator('text=Drop a player here to bench them')).toBeVisible()
})

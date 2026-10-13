// tests/e2e/12-live-courts.spec.js
import { test, expect } from '@playwright/test'
import { BASE, fullSetup } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page, { courts: 2 })
})

test('12.1 "Open" checkbox on each court card', async ({ page }) => {
  const checkboxes = page.locator('text=Open').locator('..').locator('input[type="checkbox"]')
  await expect(checkboxes).toHaveCount(2)
})

test('12.2 uncheck Open — court hidden', async ({ page }) => {
  const checkbox = page.locator('text=Open').locator('..').locator('input[type="checkbox"]').first()
  await checkbox.uncheck()
  await page.waitForTimeout(400)
  await expect(page.locator('text=Court 1')).toHaveCount(0)
})

test('12.3 re-check Open — court reappears', async ({ page }) => {
  const checkbox = page.locator('text=Open').locator('..').locator('input[type="checkbox"]').first()
  await checkbox.uncheck()
  await page.waitForTimeout(300)
  await checkbox.check()
  await page.waitForTimeout(300)
  await expect(page.locator('text=Court 1')).toBeVisible()
})

test('12.4 disabling court mid-match does not end it', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  const checkbox = page.locator('text=Open').locator('..').locator('input[type="checkbox"]').first()
  await checkbox.uncheck()
  await page.waitForTimeout(300)
  // Match is still in DB — re-enable to verify
  await checkbox.check()
  await page.waitForTimeout(300)
  await expect(page.getByRole('button', { name: 'End Match' })).toBeVisible()
})

test('12.8 two courts independent', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(2)
})

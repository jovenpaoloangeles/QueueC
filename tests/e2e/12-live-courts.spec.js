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
  await checkbox.click() // use click; uncheck() re-verifies state but card is removed by SSE
  await page.waitForTimeout(400)
  await expect(page.locator('text=Court 1')).toHaveCount(0)
})

test('12.3 re-check Open — court reappears', async ({ page }) => {
  // Click to disable Court 1 (card removed from DOM); then re-enable via API and verify
  const checkbox = page.locator('text=Open').locator('..').locator('input[type="checkbox"]').first()
  await checkbox.click() // disables court 1; CourtCard is removed from DOM
  await page.waitForTimeout(400)
  // Court 1 is gone; re-enable it via the courts API directly
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  const { courts } = await (await page.request.get(`${BASE}/api/sessions/${session.id}/courts`)).json()
  const court1 = courts.find(c => c.label === 'Court 1')
  await page.request.fetch(`${BASE}/api/courts/${court1.id}`, {
    method: 'PATCH', data: { enabled: 1 },
  })
  await page.waitForTimeout(400)
  await expect(page.locator('text=Court 1')).toBeVisible()
})

test('12.4 disabling court mid-match does not end it', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  const checkbox = page.locator('text=Open').locator('..').locator('input[type="checkbox"]').first()
  await checkbox.click() // disables court; CourtCard removed from DOM
  await page.waitForTimeout(400)
  // Re-enable via API since the card (and its checkbox) is gone
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  const { courts } = await (await page.request.get(`${BASE}/api/sessions/${session.id}/courts`)).json()
  const court1 = courts.find(c => c.label === 'Court 1')
  await page.request.fetch(`${BASE}/api/courts/${court1.id}`, {
    method: 'PATCH', data: { enabled: 1 },
  })
  await page.waitForTimeout(400)
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

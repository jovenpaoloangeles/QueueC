// tests/e2e/08-match-end.spec.js
import { test, expect } from '@playwright/test'
import { BASE, fullSetup, endMatch } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
  // Start a doubles match on court 1
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
})

test('8.1 End Match button opens modal', async ({ page }) => {
  await page.getByRole('button', { name: 'End Match' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('8.2 modal title shows court label', async ({ page }) => {
  await page.getByRole('button', { name: 'End Match' }).first().click()
  await expect(page.getByRole('dialog').locator('text=Court')).toBeVisible()
})

test('8.3 score inputs default to 0', async ({ page }) => {
  await page.getByRole('button', { name: 'End Match' }).first().click()
  await expect(page.getByLabel('Team 1')).toHaveValue('0')
  await expect(page.getByLabel('Team 2')).toHaveValue('0')
})

test('8.4 score inputs accept 0–99', async ({ page }) => {
  await page.getByRole('button', { name: 'End Match' }).first().click()
  await page.getByLabel('Team 1').fill('21')
  await expect(page.getByLabel('Team 1')).toHaveValue('21')
})

test('8.5 confirm returns players to queue', async ({ page }) => {
  await endMatch(page, 'Court 1')
  await expect(page.locator('[data-entry-id]')).toHaveCount(8)
})

test('8.7 court returns to idle state', async ({ page }) => {
  await endMatch(page, 'Court 1')
  await expect(page.locator('text=Select 2 or 4 players').first()).toBeVisible()
})

test('8.10 cancel keeps match running', async ({ page }) => {
  await page.getByRole('button', { name: 'End Match' }).first().click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'End Match' })).toBeVisible()
})

test('8.11 score 0–0 accepted', async ({ page }) => {
  await page.getByRole('button', { name: 'End Match' }).first().click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await page.waitForTimeout(400)
  await expect(page.locator('text=Select 2 or 4 players').first()).toBeVisible()
})

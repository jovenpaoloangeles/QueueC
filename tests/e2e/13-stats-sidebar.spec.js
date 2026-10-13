// tests/e2e/13-stats-sidebar.spec.js
import { test, expect } from '@playwright/test'
import { BASE, fullSetup, endMatch } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

test('13.1 player count tile matches check-in count', async ({ page }) => {
  await expect(page.locator('text=Players').locator('..').locator('[class*="font-mono"]')).toHaveText('8')
})

test('13.2 match count starts at 0', async ({ page }) => {
  await expect(page.locator('text=Matches').locator('..').locator('[class*="font-mono"]')).toHaveText('0')
})

test('13.3 match count increments after end', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  await endMatch(page, 'Court')
  await expect(page.locator('text=Matches').locator('..').locator('[class*="font-mono"]')).toHaveText('1')
})

test('13.9 "+ Add Player" shows form', async ({ page }) => {
  await page.getByRole('button', { name: /Add Player/i }).click()
  await expect(page.locator('input[placeholder], input[type="text"]').last()).toBeVisible()
})

test('13.11 skill-level select has 5 options', async ({ page }) => {
  await page.getByRole('button', { name: /Add Player/i }).click()
  await page.locator('button[role="combobox"]').last().click()
  const options = page.locator('[role="option"], [role="listitem"]')
  await expect(options).toHaveCount(5)
})

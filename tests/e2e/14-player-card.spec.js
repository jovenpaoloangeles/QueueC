// tests/e2e/14-player-card.spec.js
import { test, expect } from '@playwright/test'
import { BASE, fullSetup } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

test('14.1 card shows name, skill badge, wait timer, minutes played', async ({ page }) => {
  const card = page.locator('[data-entry-id]').first()
  await expect(card.locator('.text-base.font-medium')).toBeVisible()
  await expect(card.locator('[class*="text-2xs"]')).toBeVisible() // skill badge
  await expect(card.locator('[class*="font-mono"]')).toBeVisible() // wait timer
  await expect(card.locator('text=played')).toBeVisible()
})

test('14.2 wait timer increments each second', async ({ page }) => {
  const timer = page.locator('[data-entry-id]').first().locator('[class*="font-mono"][class*="tabular-nums"]')
  const t1 = await timer.textContent()
  await page.waitForTimeout(2000)
  const t2 = await timer.textContent()
  expect(t1).not.toEqual(t2)
})

test('14.4 selection badge shows 1-based index', async ({ page }) => {
  for (let i = 0; i < 3; i++) await page.locator('[data-entry-id]').nth(i).click()
  await expect(page.locator('[class*="rounded-full"][class*="bg-primary"]').locator('text=3')).toBeVisible()
})

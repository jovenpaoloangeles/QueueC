// tests/e2e/07-match-start.spec.js
import { test, expect } from '@playwright/test'
import { BASE, fullSetup } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

test('7.1 Start Match disabled with no selection', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Start Match' }).first()).toBeDisabled()
})

test('7.2 court hints "Select 2 or 4 players" with no selection', async ({ page }) => {
  await expect(page.locator('text=Select 2 or 4 players').first()).toBeVisible()
})

test('7.3 court hints "Drop players here" with 2 selected', async ({ page }) => {
  await page.locator('[data-entry-id]').nth(0).click()
  await page.locator('[data-entry-id]').nth(1).click()
  await expect(page.locator('text=Drop players here').first()).toBeVisible()
})

test('7.4 singles start via button', async ({ page }) => {
  await page.locator('[data-entry-id]').nth(0).click()
  await page.locator('[data-entry-id]').nth(1).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
  await expect(page.locator('text=singles').first()).toBeVisible()
})

test('7.5 doubles start via button', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
  await expect(page.locator('text=doubles').first()).toBeVisible()
})

test('7.6 started players removed from queue', async ({ page }) => {
  const firstCard = page.locator('[data-entry-id]').first()
  const name = await firstCard.locator('.text-base.font-medium').textContent()
  await firstCard.click()
  await page.locator('[data-entry-id]').nth(1).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
  await expect(page.locator('[data-entry-id]').locator(`text=${name?.trim()}`)).toHaveCount(0)
})

test('7.7 court shows format badge after match starts', async ({ page }) => {
  // doubles: 4 players
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
  await expect(page.locator('text=doubles').first()).toBeVisible()
})

test('7.8 court shows elapsed timer from 0:00', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
  await expect(page.locator('text=/0:0[012]/')).toBeVisible()
})

test('7.9 match timer increments', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
  const timer = page.locator('[class*="font-mono"][class*="tabular-nums"]').first()
  const t1 = await timer.textContent()
  await page.waitForTimeout(2000)
  const t2 = await timer.textContent()
  expect(t1).not.toEqual(t2)
})

test('7.16 two courts run simultaneously', async ({ page }) => {
  // Session has 2 courts; start a match on each
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  await expect(page.locator('text=End Match')).toHaveCount(2)
})

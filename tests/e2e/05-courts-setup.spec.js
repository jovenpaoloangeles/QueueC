// tests/e2e/05-courts-setup.spec.js
import { test, expect } from '@playwright/test'
import { BASE, createSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await createSession(page, { courts: 2 })
})

test('5.1 2 courts listed by default', async ({ page }) => {
  const courtRows = page.locator('text=Courts').locator('..').locator('[class*="rounded-md border"]')
  await expect(courtRows).toHaveCount(2)
})

test('5.2 court labels are Court 1 and Court 2', async ({ page }) => {
  await expect(page.locator('text=Court 1')).toBeVisible()
  await expect(page.locator('text=Court 2')).toBeVisible()
})

test('5.3 add court creates Court 3', async ({ page }) => {
  await page.getByRole('button', { name: '+ Add Court' }).click()
  await page.waitForTimeout(400)
  await expect(page.locator('text=Court 3')).toBeVisible()
})

test('5.4 remove court deletes it', async ({ page }) => {
  const rows = page.locator('text=Courts').locator('..').locator('[class*="rounded-md border"]')
  await rows.last().getByRole('button', { name: 'Remove' }).click()
  await page.waitForTimeout(400)
  await expect(rows).toHaveCount(1)
})

test('5.5 remove all courts shows empty message', async ({ page }) => {
  const rows = page.locator('text=Courts').locator('..').locator('[class*="rounded-md border"]')
  await rows.nth(1).getByRole('button', { name: 'Remove' }).click()
  await page.waitForTimeout(300)
  await rows.nth(0).getByRole('button', { name: 'Remove' }).click()
  await page.waitForTimeout(300)
  await expect(page.locator('text=No courts yet')).toBeVisible()
})

test('5.6 set active_from time', async ({ page }) => {
  const row = page.locator('text=Courts').locator('..').locator('[class*="rounded-md border"]').first()
  await row.locator('input[type="time"]').first().fill('18:00')
  await page.waitForTimeout(400)
  await expect(row.locator('input[type="time"]').first()).toHaveValue('18:00')
})

test('5.8 disable court — checkbox unchecked', async ({ page }) => {
  const row = page.locator('text=Courts').locator('..').locator('[class*="rounded-md border"]').first()
  await row.locator('input[type="checkbox"]').uncheck()
  await page.waitForTimeout(300)
  await expect(row.locator('input[type="checkbox"]')).not.toBeChecked()
})

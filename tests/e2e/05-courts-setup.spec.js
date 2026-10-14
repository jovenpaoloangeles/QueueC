// tests/e2e/05-courts-setup.spec.js
import { test, expect } from '@playwright/test'
import { BASE, createSession, checkinPlayers, startSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await createSession(page, { courts: 2 })
})

test('5.1 2 courts listed by default', async ({ page }) => {
  const courtRows = page.locator('text=Courts').locator('../..').locator('[class*="rounded-md border"]')
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
  const rows = page.locator('text=Courts').locator('../..').locator('[class*="rounded-md border"]')
  await rows.last().getByRole('button', { name: 'Remove' }).click()
  await page.waitForTimeout(400)
  await expect(rows).toHaveCount(1)
})

test('5.5 remove all courts shows empty message', async ({ page }) => {
  const rows = page.locator('text=Courts').locator('../..').locator('[class*="rounded-md border"]')
  await rows.nth(1).getByRole('button', { name: 'Remove' }).click()
  await page.waitForTimeout(300)
  await rows.nth(0).getByRole('button', { name: 'Remove' }).click()
  await page.waitForTimeout(300)
  await expect(page.locator('text=No courts yet')).toBeVisible()
})

test('5.6 set active_from hour', async ({ page }) => {
  const row = page.locator('text=Courts').locator('../..').locator('[class*="rounded-md border"]').first()
  const sel = row.getByLabel('Court 1 active from')
  await sel.selectOption({ label: '18:00' })
  await page.waitForTimeout(400)
  // controlled by server round-trip — still showing the chosen hour
  expect(await sel.evaluate(el => el.selectedOptions[0]?.textContent)).toBe('18:00')
})

test('5.7 set active_until hour', async ({ page }) => {
  const row = page.locator('text=Courts').locator('../..').locator('[class*="rounded-md border"]').first()
  const sel = row.getByLabel('Court 1 active until')
  await sel.selectOption({ label: '21:00' })
  await page.waitForTimeout(400)
  expect(await sel.evaluate(el => el.selectedOptions[0]?.textContent)).toBe('21:00')
})

test('5.11 hour options span session window', async ({ page }) => {
  const row = page.locator('text=Courts').locator('../..').locator('[class*="rounded-md border"]').first()
  const sel = row.getByLabel('Court 1 active from')
  // default session 18:00–21:00 → blank + 4 exact hours
  await expect(sel.locator('option')).toHaveCount(5)
  const labels = await sel.locator('option').allTextContents()
  expect(labels).toEqual(['—', '18:00', '19:00', '20:00', '21:00'])
})

test('5.8 disable court — checkbox unchecked', async ({ page }) => {
  const row = page.locator('text=Courts').locator('../..').locator('[class*="rounded-md border"]').first()
  // Use click instead of uncheck: controlled component reverts before SSE, uncheck() misdetects state
  await row.locator('input[type="checkbox"]').click()
  await page.waitForTimeout(600)
  await expect(row.locator('input[type="checkbox"]')).not.toBeChecked()
})

test('5.9 disabled court absent from live view', async ({ page }) => {
  // Disable court 1
  const row = page.locator('text=Courts').locator('../..').locator('[class*="rounded-md border"]').first()
  await row.locator('input[type="checkbox"]').click()
  await page.waitForTimeout(600)
  // Check in 2 players and start session
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  // Court 1 should be absent (only Court 2 visible)
  await expect(page.locator('text=Court 1')).toHaveCount(0)
  await expect(page.locator('text=Court 2')).toBeVisible()
})

test('5.10 re-enabled court reappears in live view', async ({ page }) => {
  const row = page.locator('text=Courts').locator('../..').locator('[class*="rounded-md border"]').first()
  await row.locator('input[type="checkbox"]').click() // disable
  await page.waitForTimeout(600)
  await row.locator('input[type="checkbox"]').click() // re-enable
  await page.waitForTimeout(600)
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.locator('text=Court 1')).toBeVisible()
})

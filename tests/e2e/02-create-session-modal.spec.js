// tests/e2e/02-create-session-modal.spec.js
import { test, expect } from '@playwright/test'
import { BASE } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await page.reload()
  await page.getByRole('button', { name: '+ Start New Session' }).click()
  await page.waitForSelector('[role="dialog"]')
})

test('2.1 modal opens with fields', async ({ page }) => {
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('Name')).toBeVisible()
})

test('2.2 default session name is "Evening Session"', async ({ page }) => {
  await expect(page.getByLabel('Name')).toHaveValue('Evening Session')
})

test('2.3 start/end times pre-filled', async ({ page }) => {
  const start = page.getByLabel('Start')
  await expect(start).not.toHaveValue('')
})

test('2.4 courts field defaults to 2', async ({ page }) => {
  await expect(page.getByLabel('Courts')).toHaveValue('2')
})

test('2.5 Cancel closes modal without session', async ({ page }) => {
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('text=No active session')).toBeVisible()
})

test('2.6 ESC closes modal', async ({ page }) => {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('2.7 backdrop click closes modal', async ({ page }) => {
  await page.mouse.click(10, 10)
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('2.8 custom name appears in header', async ({ page }) => {
  await page.getByLabel('Name').fill('Friday Badminton')
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await expect(page.locator('text=Friday Badminton')).toBeVisible()
})

test('2.9 court_count respected', async ({ page }) => {
  await page.getByLabel('Courts').fill('3')
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  const courts = page.locator('text=Court')
  await expect(courts).toHaveCount(3)
})

test('2.10 modal closes automatically via SSE', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Session' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
})

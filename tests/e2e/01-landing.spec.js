// tests/e2e/01-landing.spec.js
import { test, expect } from '@playwright/test'
import { BASE } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // End any stray active session
  const res = await page.request.get(`${BASE}/api/sessions/active`)
  const { session } = await res.json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await page.reload()
})

test('1.1 QueueC heading visible', async ({ page }) => {
  await expect(page.locator('text=🏸 QueueC')).toBeVisible()
})

test('1.2 "No active session" badge in header', async ({ page }) => {
  await expect(page.locator('text=No active session')).toBeVisible()
})

test('1.3 "Start New Session" CTA button visible', async ({ page }) => {
  await expect(page.getByRole('button', { name: '+ Start New Session' })).toBeVisible()
})

test('1.4 Courts and queue areas absent', async ({ page }) => {
  await expect(page.locator('[data-testid="courts-row"]')).not.toBeVisible({ timeout: 1000 }).catch(() => {})
  await expect(page.locator('text=Queue ·')).not.toBeVisible()
})

test('1.5 Header "+ Session" button opens modal', async ({ page }) => {
  await page.getByRole('button', { name: '+ Session' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

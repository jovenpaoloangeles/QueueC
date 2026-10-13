// tests/e2e/03-session-lifecycle.spec.js
import { test, expect } from '@playwright/test'
import { BASE, createSession, checkinPlayers, startSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
})

test('3.1 setup screen appears after create', async ({ page }) => {
  await createSession(page)
  await expect(page.locator('text=Not started')).toBeVisible()
})

test('3.2 "Not started" badge in header', async ({ page }) => {
  await createSession(page)
  await expect(page.locator('header, [class*="h-14"]').locator('text=Not started')).toBeVisible()
})

test('3.3 Start disabled with 0 players', async ({ page }) => {
  await createSession(page)
  await expect(page.getByRole('button', { name: 'Start Session' })).toBeDisabled()
})

test('3.4 Start disabled with 1 player', async ({ page }) => {
  await createSession(page)
  await checkinPlayers(page, ['Inter C1'])
  await expect(page.getByRole('button', { name: 'Start Session' })).toBeDisabled()
})

test('3.5 Start enabled with 2+ players', async ({ page }) => {
  await createSession(page)
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await expect(page.getByRole('button', { name: 'Start Session' })).toBeEnabled()
})

test('3.6 Start transitions to live view', async ({ page }) => {
  await createSession(page)
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.locator('text=Queue ·')).toBeVisible()
})

test('3.7 live view shows courts and queue', async ({ page }) => {
  await createSession(page)
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.locator('text=Court 1')).toBeVisible()
  await expect(page.locator('text=Queue ·')).toBeVisible()
})

test('3.8 elapsed timer badge appears', async ({ page }) => {
  await createSession(page)
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.locator('text=●')).toBeVisible()
})

test('3.9 elapsed timer increments', async ({ page }) => {
  await createSession(page)
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  const badge = page.locator('text=/● \\d+:\\d+/')
  const first = await badge.textContent()
  await page.waitForTimeout(2000)
  const second = await badge.textContent()
  expect(first).not.toEqual(second)
})

test('3.10 session name persists in header', async ({ page }) => {
  await createSession(page, { name: 'Persistence Test' })
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.locator('text=Persistence Test')).toBeVisible()
})

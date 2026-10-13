// tests/e2e/17-layout.spec.js
import { test, expect } from '@playwright/test'
import { BASE, createSession, checkinPlayers, startSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
})

test('17.1 1-court fills courts band', async ({ page }) => {
  await createSession(page, { courts: 1 })
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  const courtCards = page.locator('text=Court 1').locator('../..')
  await expect(courtCards).toHaveCount(1)
})

test('17.2 2-court — 2 court cards', async ({ page }) => {
  await createSession(page, { courts: 2 })
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  // Count distinct court labels
  await expect(page.locator('text=/^Court \\d+$/')).toHaveCount(2)
})

test('17.3 5-court — 5 court cards', async ({ page }) => {
  await createSession(page, { courts: 5 })
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.locator('text=/^Court \\d+$/')).toHaveCount(5)
})

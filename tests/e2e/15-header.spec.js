// tests/e2e/15-header.spec.js
import { test, expect } from '../fixtures.js'
import { base, createSession, checkinPlayers, startSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
})

test('15.1 session name in header', async ({ page }) => {
  await createSession(page, { name: 'Header Test' })
  await expect(page.locator('text=Header Test')).toBeVisible()
})

test('15.2 scheduled time range shown', async ({ page }) => {
  await createSession(page, { name: 'Header Test' })
  // Time range format: HH:MM–HH:MM (scoped to header to avoid SetupScreen duplicate)
  await expect(page.locator('[data-testid="header-time-range"]')).toBeVisible()
})

test('15.4 elapsed timer absent during setup', async ({ page }) => {
  await createSession(page, { name: 'Header Test' })
  await expect(page.locator('text=●')).not.toBeVisible()
})

test('15.5 "+ Session" always visible', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Session' })).toBeVisible()
  await createSession(page)
  await expect(page.getByRole('button', { name: '+ Session' })).toBeVisible()
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.getByRole('button', { name: '+ Session' })).toBeVisible()
})

test('15.3 elapsed timer badge visible after session starts', async ({ page }) => {
  await createSession(page)
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await expect(page.locator('text=●')).toHaveCount(0) // not during setup
  await startSession(page)
  await expect(page.getByText(/● \d/)).toBeVisible()
})

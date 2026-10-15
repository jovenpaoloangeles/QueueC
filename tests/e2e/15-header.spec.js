// tests/e2e/15-header.spec.js
import { test, expect } from '../fixtures.js'
import { base, createSession, checkinPlayers, startSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
})

test('15.1 session name in header (no parens → single line)', async ({ page }) => {
  await createSession(page, { name: 'Header Test' })
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  // defensive path: no ' (' in the name → full name on the single name line, no date line
  const block = page.getByTestId('header-session-name')
  await expect(block).toBeVisible()
  await expect(block).toHaveText('HEADER TEST') // name line only (uppercased), no date line
})

test('15.2 scheduled time range shown', async ({ page }) => {
  await createSession(page, { name: 'Header Test', startTime: '19:00', hours: 2 })
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  // Time range format: HH:MM–HH:MM (scoped to header to avoid SetupScreen duplicate)
  await expect(page.locator('[data-testid="header-time-range"]')).toBeVisible()
})

test('15.6 session name renders as ASTIRISK over date (two lines)', async ({ page }) => {
  // empty name → server default "ASTIRISK (DD-Mon-YYYY)" → name line + date line
  await createSession(page, { name: '' })
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  const block = page.getByTestId('header-session-name')
  const lines = block.locator('span')
  await expect(lines).toHaveCount(2)
  await expect(lines.nth(0)).toHaveText('ASTIRISK')
  await expect(lines.nth(1)).toHaveText(/^\d{2}-[A-Z][a-z]{2}-\d{4}$/)
  await expect(lines.nth(0)).toBeVisible()
  await expect(lines.nth(1)).toBeVisible()
})

test('15.4 elapsed timer absent during setup', async ({ page }) => {
  await createSession(page, { name: 'Header Test' })
  await expect(page.locator('text=●')).not.toBeVisible()
})

test('15.5 "New Session" only while a session is live', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('btn-new-session')).toHaveCount(0)
  await createSession(page)
  await expect(page.getByTestId('btn-new-session')).toHaveCount(0)
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.getByTestId('btn-new-session')).toBeVisible()
})

test('15.3 elapsed timer badge visible after session starts', async ({ page }) => {
  await createSession(page)
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await expect(page.locator('text=●')).toHaveCount(0) // not during setup
  await startSession(page)
  await expect(page.getByText(/● \d/)).toBeVisible()
})

// tests/e2e/24-app-wiring.spec.js — header Smart Match + theme wiring
import { test, expect } from '../fixtures.js'
import { base, createSession, checkinPlayers, startSession, confirmStart } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
})

test('24.1 Smart Match with free court + 4+ waiting starts a match and toasts', async ({ page }) => {
  await createSession(page, { courts: 1 })
  await checkinPlayers(page, ['Inter C1', 'Inter C2', 'Inter C3', 'Inter C4', 'Expert E1', 'Expert E2'])
  await startSession(page)
  await page.getByTestId('btn-smart-match').click()
  await confirmStart(page)
  const toast = page.getByTestId('toast')
  await expect(toast).toBeVisible()
  await expect(toast).toContainText(/Matched 1 court/)
})

test('24.2 Smart Match with nobody waiting toasts a friendly message', async ({ page }) => {
  await createSession(page, { courts: 1 })
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await page.getByTestId('btn-smart-match').click() // singles takes both players
  await confirmStart(page)
  await expect(page.getByTestId('toast')).toContainText(/Matched 1 court/)
  await page.getByTestId('btn-smart-match').click() // nobody left waiting
  const toast = page.getByTestId('toast')
  await expect(toast).toBeVisible()
  await expect(toast).toContainText(/Nothing to auto-match/)
})

test('24.3 dark toggle flips <html>.dark and persists across reload', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')
  await page.evaluate(() => localStorage.removeItem('queuec-theme'))
  await page.reload()
  await expect(html).not.toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Toggle dark mode' }).click()
  await expect(html).toHaveClass(/dark/)
  await page.reload()
  await expect(html).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Toggle dark mode' }).click()
  await expect(html).not.toHaveClass(/dark/)
})

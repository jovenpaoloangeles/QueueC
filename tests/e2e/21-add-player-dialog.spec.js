// tests/e2e/21-add-player-dialog.spec.js
// Smoke spec for the live-session Add Player dialog (header button).
import { test, expect } from '../fixtures.js'
import { base, createSession, checkinPlayers, startSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await createSession(page)
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
})

test('21.1 register new player from dialog closes dialog, toasts, queues', async ({ page }) => {
  await page.locator('[data-entry-id]').first().waitFor()
  const beforeCount = await page.locator('[data-entry-id]').count()

  await page.getByTestId('btn-add-player').click()
  const dialog = page.getByTestId('add-player-dialog')
  await expect(dialog).toBeVisible()

  // unique name — the players table persists across tests
  const name = `Dlg Smoke ${Date.now().toString(36)}`
  await page.getByLabel('Search or add player').fill(name)
  await page.getByTestId('register-new-player-prompt').getByRole('button', { name: 'Add Player' }).click()

  // dialog closes and feedback is explicit
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('toast')).toContainText('Checked in:')
  await expect(page.locator('[data-entry-id]')).toHaveCount(beforeCount + 1)
})

test('21.2 check in existing player from dialog closes dialog, toasts, queues', async ({ page }) => {
  await page.locator('[data-entry-id]').first().waitFor()
  const beforeCount = await page.locator('[data-entry-id]').count()

  await page.getByTestId('btn-add-player').click()
  const dialog = page.getByTestId('add-player-dialog')
  await expect(dialog).toBeVisible()

  await page.getByLabel('Search or add player').fill('Newbie A1')
  await page.getByTestId('combobox-matches').getByRole('button', { name: 'Newbie A1' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('toast')).toContainText('Checked in:')
  await expect(page.locator('[data-entry-id]')).toHaveCount(beforeCount + 1)
})

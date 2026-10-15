// tests/e2e/21-add-player-dialog.spec.js
// Live-session check-in popover: search-or-register via the "+ Check In" button
// (the header Add Player button and its dialog were removed as redundant).
import { test, expect } from '../fixtures.js'
import { base, createSession, checkinPlayers, startSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await createSession(page)
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
})

test('21.0 header has no Add Player button; panel empty until search', async ({ page }) => {
  await expect(page.getByTestId('btn-add-player')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '+ Add Player' })).toHaveCount(0)
  await page.getByRole('button', { name: '+ Check In' }).click()
  await expect(page.getByTestId('checkin-search')).toBeVisible()
  await expect(page.getByTestId('checkin-hint')).toBeVisible()
  await expect(page.getByTestId('combobox-matches')).toHaveCount(0)
})

test('21.1 register new player from popover: toasts, queues, pool refetches', async ({ page }) => {
  await page.locator('[data-entry-id]').first().waitFor()
  const beforeCount = await page.locator('[data-entry-id]').count()

  await page.getByRole('button', { name: '+ Check In' }).click()
  // unique name — the players table persists across tests
  const name = `Dlg Smoke ${Date.now().toString(36)}`
  await page.getByTestId('checkin-search').fill(name)
  await page.getByTestId('register-new-player-prompt').getByRole('button', { name: 'Add Player' }).click()

  await expect(page.getByTestId('toast')).toContainText('Checked in:')
  await expect(page.locator('[data-entry-id]')).toHaveCount(beforeCount + 1)
  // search cleared, panel still open
  await expect(page.getByTestId('checkin-search')).toHaveValue('')
})

test('21.2 check in existing player via search row', async ({ page }) => {
  await page.locator('[data-entry-id]').first().waitFor()
  const beforeCount = await page.locator('[data-entry-id]').count()

  await page.getByRole('button', { name: '+ Check In' }).click()
  await page.getByTestId('checkin-search').fill('Newbie A1')
  await page.getByTestId('combobox-matches').getByRole('button', { name: 'Newbie A1' }).click()

  await expect(page.getByTestId('toast')).toContainText('Checked in:')
  await expect(page.locator('[data-entry-id]')).toHaveCount(beforeCount + 1)
})

test('21.3 duplicate-in-session surfaces the inline error, no register prompt', async ({ page }) => {
  await page.getByRole('button', { name: '+ Check In' }).click()
  await page.getByTestId('checkin-search').fill('Inter C1')
  await expect(page.getByTestId('duplicate-session-error')).toContainText('already active in this session')
  await expect(page.getByTestId('register-new-player-prompt')).toHaveCount(0)
  await expect(page.getByTestId('duplicate-session-error').getByRole('button', { name: 'Add Player' })).toBeDisabled()
})

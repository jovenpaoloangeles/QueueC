// Remove-from-pool (check-in undo): the queue card's Remove action arms a
// confirm dialog — Keep aborts, Confirm DELETEs the entry and the card leaves
// the grid. The server-side 409-playing guard is covered API-level in
// server/routes/queue-remove.test.js; playing cards never render the button.
import { test, expect } from '../fixtures.js'
import { base, fullSetup, getQueueNames, startDoubles } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

test('31.1 Remove asks for confirmation; Keep aborts', async ({ page }) => {
  const before = await getQueueNames(page)
  await page.getByTestId('remove-player').first().click()
  const dialog = page.getByTestId('remove-player-dialog')
  await expect(dialog).toBeVisible()
  await page.getByTestId('remove-player-abort').click()
  await expect(dialog).not.toBeVisible()
  expect(await getQueueNames(page)).toEqual(before)
})

test('31.2 Confirm removes the player from the pool', async ({ page }) => {
  const name = (await getQueueNames(page))[0].trim()
  await page.getByTestId('remove-player').first().click()
  await page.getByTestId('remove-player-confirm').click()
  await expect(page.getByTestId('remove-player-dialog')).not.toBeVisible()
  // the card leaves the grid entirely — not merely disabled
  await expect(page.locator('[data-entry-id]').filter({ hasText: name })).toHaveCount(0)
  expect(await getQueueNames(page)).not.toContain(name)
})

test('31.3 playing cards offer no Remove; resting cards do', async ({ page }) => {
  await startDoubles(page)
  await expect(page.locator('[data-playing-id]').getByTestId('remove-player')).toHaveCount(0) // the 4 on court
  await page.getByTestId('rest-toggle').first().click()
  await expect(page.locator('[data-resting-id]')).toBeVisible()
  await expect(page.locator('[data-resting-id]').getByTestId('remove-player')).toHaveCount(1)
})

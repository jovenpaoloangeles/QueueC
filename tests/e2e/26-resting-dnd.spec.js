// tests/e2e/26-resting-dnd.spec.js — resting DnD without the (removed) resting tray:
// benching happens via shift-click / Rest button, waking via drag onto queue rows or
// the queue list, and resting rows stay visible under the Rest tab.
import { test, expect } from '../fixtures.js'
import { base, fullSetup, syntheticDrag, startDoubles } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

const nameOf = card => card.locator('.text-base.font-medium').textContent().then(s => s.trim())
// bench the first waiting player via the row's Rest button (the tray is gone)
const restFirst = async page => {
  const card = page.locator('[data-entry-id]').first()
  const name = await nameOf(card)
  await card.getByTestId('rest-toggle').click()
  await expect(page.getByTestId('queue-tab-rest')).toContainText('(1)')
  return name
}

test('26.2 dragging a resting row onto another queue row wakes the player', async ({ page }) => {
  const name = await restFirst(page)
  await page.locator('[data-resting-id]').dragTo(page.locator('[data-entry-id]').nth(1))
  await expect(page.locator('[data-resting-id]')).toHaveCount(0)
  await expect(page.locator('[data-entry-id]').filter({ hasText: name })).toHaveCount(1)
})

test('26.3 dragging a resting row onto the queue list area wakes the player', async ({ page }) => {
  const name = await restFirst(page)
  await page.locator('[data-resting-id]').dragTo(page.locator('[data-queue-list]'), { targetPosition: { x: 4, y: 4 } })
  await expect(page.locator('[data-resting-id]')).toHaveCount(0)
  await expect(page.locator('[data-entry-id]').filter({ hasText: name })).toHaveCount(1)
})

test('26.4 synthetic drag of a resting row back onto a queue row wakes it', async ({ page }) => {
  const name = await restFirst(page)
  await syntheticDrag(page, '[data-resting-id]', '[data-entry-id]', { toIndex: 0 })
  await expect(page.locator('[data-resting-id]')).toHaveCount(0)
  await expect(page.locator('[data-entry-id]').filter({ hasText: name })).toHaveCount(1)
})

test('26.6 resting players stay visible under the Rest tab', async ({ page }) => {
  const name = await restFirst(page)
  await page.getByTestId('queue-tab-rest').click()
  await expect(page.locator('[data-resting-id]').filter({ hasText: name })).toBeVisible()
  await expect(page.locator('[data-entry-id]')).toHaveCount(0)
  // and under All
  await page.getByTestId('queue-tab-all').click()
  await expect(page.locator('[data-resting-id]').filter({ hasText: name })).toBeVisible()
})

test('26.7 All tab shows playing players; Wait and Rest tabs do not', async ({ page }) => {
  await startDoubles(page) // 4 players go In Game on court 1
  // All (the default tab) lists them too — playing cards carry data-playing-id
  await expect(page.locator('[data-playing-id]')).toHaveCount(4)
  await expect(page.locator('[data-playing-id]').first()).toContainText('In Game')
  await page.getByTestId('queue-tab-wait').click()
  await expect(page.locator('[data-playing-id]')).toHaveCount(0)
  await page.getByTestId('queue-tab-rest').click()
  await expect(page.locator('[data-playing-id]')).toHaveCount(0)
})

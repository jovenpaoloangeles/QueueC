// tests/e2e/09-queue-management.spec.js
import { test, expect } from '../fixtures.js'
import { base, fullSetup, getQueueNames, syntheticDrag, clickStartMatch } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

test('9.4 shift-click benches player', async ({ page }) => {
  const card = page.locator('[data-entry-id]').first()
  const name = await card.locator('.text-base.font-medium').textContent()
  await card.click({ modifiers: ['Shift'] })
  await page.waitForTimeout(400)
  await expect(page.locator('[data-resting-id]').locator(`text=${name?.trim()}`)).toBeVisible()
})

test('9.5 Rest tab shows benched player', async ({ page }) => {
  await page.locator('[data-entry-id]').first().click({ modifiers: ['Shift'] })
  await page.waitForTimeout(400)
  await expect(page.getByTestId('queue-tab-rest')).toContainText('(1)')
  await page.getByTestId('queue-tab-rest').click()
  await expect(page.locator('[data-resting-id]')).toHaveCount(1)
})

test('9.6 resting player absent from queue grid', async ({ page }) => {
  const card = page.locator('[data-entry-id]').first()
  const name = await card.locator('.text-base.font-medium').textContent()
  await card.click({ modifiers: ['Shift'] })
  await page.waitForTimeout(400)
  await expect(page.locator('[data-entry-id]').locator(`text=${name?.trim()}`)).toHaveCount(0)
})

test('9.8 Wake button restores to waiting', async ({ page }) => {
  const card = page.locator('[data-entry-id]').first()
  const name = await card.locator('.text-base.font-medium').textContent()
  await card.click({ modifiers: ['Shift'] })
  await page.waitForTimeout(400)
  await page.locator('[data-resting-id]').getByTestId('rest-toggle').click()
  await page.waitForTimeout(400)
  await expect(page.locator('[data-entry-id]').locator(`text=${name?.trim()}`)).toBeVisible()
})

test('9.11 bench selected player removes from selection', async ({ page }) => {
  await page.locator('[data-entry-id]').nth(0).click()
  await page.locator('[data-entry-id]').nth(1).click()
  await page.locator('[data-entry-id]').nth(0).click({ modifiers: ['Shift'] })
  await page.waitForTimeout(300)
  await expect(page.locator('text=1 selected')).toBeVisible()
})

test('9.12 Rest tab shows count zero when nobody is resting', async ({ page }) => {
  await expect(page.getByTestId('queue-tab-rest')).toContainText('(0)')
})

test('9.1 drag player A after player B — order reflected in grid', async ({ page }) => {
  const before = await getQueueNames(page)
  await syntheticDrag(page, '[data-entry-id]', '[data-entry-id]', { fromIndex: 1, toIndex: 0 })
  await expect(page.locator('[data-entry-id]').first().locator('.text-base.font-medium')).toHaveText(before[1])
  await expect(page.locator('[data-entry-id]').nth(1).locator('.text-base.font-medium')).toHaveText(before[0])
})

test('9.2 SSE tick does not reset manual reorder', async ({ page }) => {
  const before = await getQueueNames(page)
  await syntheticDrag(page, '[data-entry-id]', '[data-entry-id]', { fromIndex: 1, toIndex: 0 })
  await page.waitForTimeout(1600) // ≥1 SSE broadcast
  const after = await getQueueNames(page)
  expect(after[0]).toBe(before[1])
  expect(after[1]).toBe(before[0])
})

test('9.3 newly checked-in player appended to end of order', async ({ page }) => {
  await page.getByTestId('checkin-toggle').click()
  await page.getByTestId('checkin-search').fill('Newbie A1')
  await page.getByTestId('combobox-matches').getByRole('button', { name: 'Newbie A1' }).click()
  await page.waitForTimeout(400)
  const names = await getQueueNames(page)
  expect(names[names.length - 1]).toBe('Newbie A1')
})

test('9.7 resting player absent from selection candidates', async ({ page }) => {
  const name = (await getQueueNames(page))[0].trim()
  await page.locator('[data-entry-id]').first().click({ modifiers: ['Shift'] })
  await page.waitForTimeout(400)
  // select 4 waiting players manually (the benched player is not among them —
  // resting rows leave the grid entirely)
  const cards = page.locator('[data-entry-id]')
  for (let i = 0; i < 4; i++) await cards.nth(i).click()
  await clickStartMatch(page)
  await page.waitForTimeout(500)
  // bench player never made it to court
  for (const side of await page.locator('[data-team-side]').allTextContents()) {
    expect(side).not.toContain(name)
  }
  await page.getByTestId('queue-tab-rest').click()
  await expect(page.locator('[data-resting-id]')).toContainText(name)
})

test('9.9 Rest button benches a player', async ({ page }) => {
  const name = (await getQueueNames(page))[0].trim()
  await page.locator('[data-entry-id]').first().getByTestId('rest-toggle').click()
  await expect(page.getByTestId('queue-tab-rest')).toContainText('(1)')
  await page.getByTestId('queue-tab-rest').click()
  await expect(page.locator('[data-resting-id]')).toContainText(name)
  await expect(page.locator('[data-entry-id]')).toHaveCount(0)
})

test('9.10 Wake button on a resting row returns them to waiting', async ({ page }) => {
  const name = (await getQueueNames(page))[0].trim()
  await page.locator('[data-entry-id]').first().getByTestId('rest-toggle').click()
  await expect(page.getByTestId('queue-tab-rest')).toContainText('(1)')
  await page.getByTestId('queue-tab-rest').click()
  await page.locator('[data-resting-id]').getByTestId('rest-toggle').click()
  // the player is now waiting — visible under All, not the Rest tab
  await page.getByTestId('queue-tab-all').click()
  await expect(page.locator('[data-entry-id]').filter({ hasText: name })).toBeVisible()
  await expect(page.locator('[data-resting-id]')).toHaveCount(0)
})

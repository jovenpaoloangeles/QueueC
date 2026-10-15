// tests/e2e/07-match-start.spec.js
import { test, expect } from '../fixtures.js'
import { base, fullSetup, getQueueNames, syntheticDrag, startDoubles } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

test('7.1 Start Match disabled with no selection', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Start Match' }).first()).toBeDisabled()
})

test('7.2 court hints "Select 2 or 4 players" with no selection', async ({ page }) => {
  await expect(page.locator('text=Select 2 or 4 players').first()).toBeVisible()
})

test('7.3 court hints "Drop players here" with 2 selected', async ({ page }) => {
  await page.locator('[data-entry-id]').nth(0).click()
  await page.locator('[data-entry-id]').nth(1).click()
  await expect(page.locator('text=Drop players here').first()).toBeVisible()
})

test('7.4 singles start via button', async ({ page }) => {
  await page.locator('[data-entry-id]').nth(0).click()
  await page.locator('[data-entry-id]').nth(1).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
  await expect(page.locator('text=singles').first()).toBeVisible()
})

test('7.5 doubles start via button', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
  await expect(page.locator('text=doubles').first()).toBeVisible()
})

test('7.6 started players removed from queue', async ({ page }) => {
  const firstCard = page.locator('[data-entry-id]').first()
  const name = await firstCard.locator('.text-base.font-medium').textContent()
  await firstCard.click()
  await page.locator('[data-entry-id]').nth(1).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
  await expect(page.locator('[data-entry-id]').locator(`text=${name?.trim()}`)).toHaveCount(0)
})

test('7.7 court shows format badge after match starts', async ({ page }) => {
  // doubles: 4 players
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
  await expect(page.locator('text=doubles').first()).toBeVisible()
})

test('7.8 court shows elapsed timer from 0:00', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
  await expect(page.locator('text=/0:0[012]/').first()).toBeVisible()
})

test('7.9 match timer increments', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
  const timer = page.locator('[class*="font-mono"][class*="tabular-nums"]').first()
  const t1 = await timer.textContent()
  await page.waitForTimeout(2000)
  const t2 = await timer.textContent()
  expect(t1).not.toEqual(t2)
})

test('7.16 two courts run simultaneously', async ({ page }) => {
  // Session has 2 courts; start a match on each
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  await expect(page.locator('text=End Match')).toHaveCount(2)
})

// 7.10–7.13: drag-to-court arming. Court drop handler lives on the inactive
// court's CardContent; last [data-drop^="court-"] is court 2's content area.
test('7.10 drag 1 player to court — arms court, adds to selection', async ({ page }) => {
  const name = (await getQueueNames(page))[0]
  await syntheticDrag(page, '[data-entry-id]', '[data-drop^="court-"]', { toIndex: -1 })
  await expect(page.locator('[data-drop^="court-"]').last().locator(`text=${name}`)).toBeVisible()
  await expect(page.locator('text=1 selected')).toBeVisible()
})

test('7.11 armed court fills slot 0 with the dropped player', async ({ page }) => {
  const names = await getQueueNames(page)
  await syntheticDrag(page, '[data-entry-id]', '[data-drop^="court-"]', { toIndex: -1 })
  // court-level drop lands in the first empty slot of the last idle court
  const slot0 = page.locator('[data-drop^="court-"]').last().locator('[data-testid="slot-0"]')
  await expect(slot0).toBeVisible()
  await expect(slot0).toContainText(names[0])
})

test('7.12 armed court with 2 shows Start Singles', async ({ page }) => {
  const names = await getQueueNames(page)
  await syntheticDrag(page, '[data-entry-id]', '[data-drop^="court-"]', { toIndex: -1 })
  await syntheticDrag(page, '[data-entry-id]', '[data-drop^="court-"]', { fromIndex: 1, toIndex: -1 })
  // second drop fills slot 1; exactly 2 filled slots arms Start Singles
  const court = page.locator('[data-drop^="court-"]').last()
  await expect(court.locator('[data-testid="slot-1"]')).toContainText(names[1])
  await expect(page.getByTestId('btn-start-singles')).toBeVisible()
})

test('7.13 drag 4th player to armed court — match auto-starts', async ({ page }) => {
  await syntheticDrag(page, '[data-entry-id]', '[data-drop^="court-"]', { toIndex: -1 })
  await syntheticDrag(page, '[data-entry-id]', '[data-drop^="court-"]', { fromIndex: 1, toIndex: -1 })
  await syntheticDrag(page, '[data-entry-id]', '[data-drop^="court-"]', { fromIndex: 2, toIndex: -1 })
  await syntheticDrag(page, '[data-entry-id]', '[data-drop^="court-"]', { fromIndex: 3, toIndex: -1 })
  // 4 players dropped → auto-start
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(1)
  await expect(page.locator('[data-entry-id]')).toHaveCount(4)
})

test('7.14 drag playing player to idle court — rejected', async ({ page }) => {
  await startDoubles(page)
  // court 2 is idle; drag a player from court 1's team panel onto it
  await syntheticDrag(page, '[data-team-side="1"] span', '[data-drop^="court-"]', { fromIndex: -1, toIndex: -1 })
  // no arm: no pill / Start Singles on court 2, court 1 teams unchanged
  await expect(page.getByRole('button', { name: 'Start Singles' })).toHaveCount(0)
  await expect(page.locator('[data-team-side="1"]')).toContainText('Inter C1')
})

test('7.15 drag resting player to court — lands in a lineup slot', async ({ page }) => {
  const name = (await getQueueNames(page))[0].trim()
  await page.locator('[data-entry-id]').first().click({ modifiers: ['Shift'] })
  await page.waitForTimeout(400)
  await syntheticDrag(page, '[data-drop="resting"] button', '[data-drop^="court-"]', { toIndex: -1 })
  // the court-level drop routes into the first empty slot (slots take resting
  // players straight out of rest), so the player shows up there…
  const slot0 = page.locator('[data-drop^="court-"]').last().locator('[data-testid="slot-0"]')
  await expect(slot0).toContainText(name)
  // …but stays resting until woken — no match can start from the lineup yet
  await expect(page.getByRole('button', { name: 'Start Singles' })).toHaveCount(0)
})

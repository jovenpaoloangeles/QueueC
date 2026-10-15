// tests/e2e/27-start-confirm.spec.js — every start (manual + Smart Match) asks for confirmation first
import { test, expect } from '../fixtures.js'
import { base, fullSetup, startDoubles, liveState, syntheticDrag, confirmStart } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

const dialog = page => page.getByTestId('start-confirm-dialog')
// drop queue card #i into the first court's slot #i (drag-to-slot flow)
const dropOnCourt = (page, _courtId, i) =>
  syntheticDrag(page, '[data-entry-id]', '[data-drop="slot"]', { fromIndex: i, toIndex: i })

test('27.1 Start Match opens a dialog; Cancel keeps court idle + selection; Confirm starts', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await expect(dialog(page)).toBeVisible()
  await expect(page.getByTestId('start-confirm-row')).toHaveCount(1)
  await expect(page.getByTestId('start-confirm-balance')).toBeVisible()
  await expect(page.getByTestId('start-confirm-yes')).toHaveText('Start')

  await page.getByTestId('start-confirm-cancel').click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(0)
  await expect(page.getByText('4 selected')).toBeVisible()           // selection intact
  expect((await liveState(page)).activeMatches).toHaveLength(0)

  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.keyboard.press('Enter')                                    // Enter confirms
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(1)
})

test('27.2 Esc cancels the dialog', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  expect((await liveState(page)).activeMatches).toHaveLength(0)
})

test('27.3 filling the 4th slot on an idle court asks first; Cancel keeps the draft', async ({ page }) => {
  const { courts } = await liveState(page)
  const c1 = courts[0].id
  for (let i = 0; i < 4; i++) await dropOnCourt(page, c1, i)
  await expect(dialog(page)).toBeVisible()
  expect((await liveState(page)).activeMatches).toHaveLength(0)       // not started yet

  await page.getByTestId('start-confirm-cancel').click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByTestId('slot-3').first()).not.toBeEmpty()     // draft still has 4
  expect((await liveState(page)).activeMatches).toHaveLength(0)

  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await confirmStart(page)
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(1)
})

test('27.4 Start Singles asks for confirmation', async ({ page }) => {
  const { courts } = await liveState(page)
  const c1 = courts[0].id
  await dropOnCourt(page, c1, 0)
  await dropOnCourt(page, c1, 1)
  await page.getByTestId('btn-start-singles').first().click()
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page)).toContainText('Singles')
  expect((await liveState(page)).activeMatches).toHaveLength(0)
  await confirmStart(page)
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(1)
  expect((await liveState(page)).activeMatches[0].format).toBe('singles')
})

test('27.5 Smart Match shows the proposed lineup; Cancel changes nothing; Confirm starts', async ({ page }) => {
  await page.getByTestId('btn-smart-match').click()
  await expect(dialog(page)).toBeVisible()
  await expect(page.getByTestId('start-confirm-row')).toHaveCount(2)  // 2 courts
  await expect(page.getByTestId('start-confirm-yes')).toHaveText('Start 2 matches')
  await page.getByTestId('start-confirm-cancel').click()
  await expect(dialog(page)).toHaveCount(0)
  let st = await liveState(page)
  expect(st.activeMatches).toHaveLength(0)
  expect(st.queue.filter(q => q.status === 'waiting')).toHaveLength(8)

  await page.getByTestId('btn-smart-match').click()
  await confirmStart(page)
  await expect(page.getByTestId('toast')).toContainText(/Matched 2 courts/)
  st = await liveState(page)
  expect(st.activeMatches).toHaveLength(2)
})

test('27.6 live court shows no lineup matrix; slating goes through the On Deck builder', async ({ page }) => {
  await startDoubles(page)
  // the live card keeps the match UI but drops its 'Next match lineup' matrix
  await expect(page.locator('text=Next match lineup')).toHaveCount(0)
  const liveCard = page.locator('[data-drop^="court-"]').first()      // court 1 is live
  await expect(liveCard.locator('[data-drop="slot"]')).toHaveCount(0)
  await expect(liveCard.getByTestId('btn-clear-draft')).toHaveCount(0)
  // pre-building the next lineup lives in the On Deck builder instead
  if (!(await page.getByTestId('ondeck-body').isVisible().catch(() => false))) {
    await page.getByTestId('ondeck-collapse').click() // collapsed default (r5-2) — expand first
  }
  if (!(await page.getByTestId('ondeck-builder').isVisible().catch(() => false))) {
    await page.getByTestId('ondeck-builder-toggle').click()
  }
  for (let i = 0; i < 4; i++) {
    await syntheticDrag(page, '[data-entry-id]', '[data-testid^="ondeck-new-slot-"]', { fromIndex: i, toIndex: i })
  }
  await page.getByTestId('ondeck-add').click()
  await expect(page.getByTestId('toast')).toContainText(/On Deck/)
  await expect(dialog(page)).toHaveCount(0)                          // no start dialog — nothing starts
  expect((await liveState(page)).slatedMatches).toHaveLength(1)
  expect((await liveState(page)).activeMatches).toHaveLength(1)      // court 1 unchanged
})

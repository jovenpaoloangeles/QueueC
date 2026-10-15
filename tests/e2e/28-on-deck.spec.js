// tests/e2e/28-on-deck.spec.js — always-on On Deck panel: empty state, manual builder, multiple slates, smart add, reorder
import { test, expect } from '../fixtures.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { base, fullSetup, startDoubles, endMatch, liveState, syntheticDrag, confirmStart } from '../helpers.js'

const here = dirname(fileURLToPath(import.meta.url))
const NAMES = JSON.parse(readFileSync(join(here, '../fixtures/players.json'), 'utf8')).slice(0, 16).map(p => p.name)

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page, { playerNames: NAMES })
})

const panel = page => page.getByTestId('on-deck-strip')
const openBuilder = async page => {
  if (!(await page.getByTestId('ondeck-builder').isVisible().catch(() => false))) {
    await page.getByTestId('ondeck-builder-toggle').click()
  }
  await expect(page.getByTestId('ondeck-builder')).toBeVisible()
}
// click-select the first 4 queue cards, pour them into the builder, add
async function addViaSelection(page) {
  await openBuilder(page)
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByTestId('ondeck-use-selection').click()
  for (let i = 0; i < 4; i++) await expect(page.getByTestId(`ondeck-new-slot-${i}`)).not.toHaveText('Drop…')
  await page.getByTestId('ondeck-add').click()
  await expect(page.getByTestId('ondeck-new-slot-0')).toHaveText('Drop…')
}

test('28.1 panel is always mounted: empty state, and still there after ending the only match', async ({ page }) => {
  await expect(panel(page)).toBeVisible()
  await expect(page.getByTestId('on-deck-empty')).toContainText('Nothing on deck')
  await expect(page.getByTestId('on-deck-count')).toHaveText('0')
  await expect(page.getByTestId('ondeck-smart-add')).toBeVisible()
  await startDoubles(page)
  await expect(panel(page)).toBeVisible()
  await endMatch(page, 'Court 1')
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(0)
  await expect(panel(page)).toBeVisible()
  await expect(page.getByTestId('on-deck-empty')).toBeVisible()
})

test('28.2 builder: click-to-fill from selection adds numbered cards; queue dims then releases', async ({ page }) => {
  await startDoubles(page)
  const before = await page.locator('[data-entry-id]').count()
  await openBuilder(page)
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByTestId('ondeck-use-selection').click()
  await expect(page.getByTestId('drafted-tag')).toHaveCount(4)       // builder ids dim the queue
  await page.getByTestId('ondeck-add').click()
  await expect(page.getByTestId('on-deck-pos-1')).toContainText('Up next')
  await expect(page.getByTestId('on-deck-count')).toHaveText('1')
  await expect(page.getByTestId('on-deck-empty')).toHaveCount(0)
  await expect(page.locator('[data-entry-id]')).toHaveCount(before - 4)
  await expect(page.getByTestId('drafted-tag')).toHaveCount(0)

  await addViaSelection(page)
  await expect(page.getByTestId('on-deck-pos-2')).toBeVisible()
  await expect(page.getByTestId('on-deck-count')).toHaveText('2')
  await expect(page.getByTestId('on-deck-tag')).toHaveCount(2)
  expect((await liveState(page)).slatedMatches).toHaveLength(2)
})

test('28.3 builder: drag from the queue fills slots; clear button empties one', async ({ page }) => {
  await openBuilder(page)
  for (let i = 0; i < 4; i++) {
    await syntheticDrag(page, '[data-entry-id]', '[data-testid^="ondeck-new-slot-"]', { fromIndex: i, toIndex: i })
  }
  await expect(page.getByTestId('drafted-tag')).toHaveCount(4)
  await page.getByTestId('ondeck-new-clear-3').click()
  await expect(page.getByTestId('drafted-tag')).toHaveCount(3)
  await expect(page.getByTestId('ondeck-add')).toBeDisabled()
  await syntheticDrag(page, '[data-entry-id]:not(:has([data-testid="drafted-tag"]))', '[data-testid="ondeck-new-slot-3"]', { fromIndex: 0, toIndex: 0 })
  await expect(page.getByTestId('ondeck-add')).toBeEnabled()
  await page.getByTestId('ondeck-add').click()
  await expect(page.getByTestId('on-deck-pos-1')).toBeVisible()
  expect((await liveState(page)).slatedMatches).toHaveLength(1)
})

test('28.4 Smart add: dialog lists slates; Cancel changes nothing; Confirm creates them', async ({ page }) => {
  await page.getByTestId('ondeck-smart-add').click()
  const dlg = page.getByTestId('start-confirm-dialog')
  await expect(dlg).toBeVisible()
  await expect(dlg).toContainText('Add to On Deck?')
  const rows = await page.getByTestId('start-confirm-slate-row').count()
  expect(rows).toBeGreaterThanOrEqual(1)
  await expect(page.getByTestId('start-confirm-row')).toHaveCount(0)   // slate-only: no court starts
  await page.getByTestId('start-confirm-cancel').click()
  await expect(dlg).toHaveCount(0)
  let st = await liveState(page)
  expect(st.slatedMatches).toHaveLength(0)
  expect(st.activeMatches).toHaveLength(0)

  await page.getByTestId('ondeck-smart-add').click()
  await confirmStart(page)
  await expect(page.getByTestId('toast')).toContainText(/On Deck/)
  await expect(page.getByTestId('on-deck-pos-1')).toBeVisible()
  st = await liveState(page)
  expect(st.slatedMatches).toHaveLength(rows)
  expect(st.activeMatches).toHaveLength(0)
})

test('28.5 reorder: moving #2 up swaps the order', async ({ page }) => {
  await startDoubles(page)
  await addViaSelection(page)
  await addViaSelection(page)
  const names = async () => (await liveState(page)).slatedMatches.map(m => m.id)
  const [a, b] = await names()
  const textOf = id => page.getByTestId(`slate-row-${id}`).innerText()
  const textA = await textOf(a)
  await expect(page.getByTestId(`slate-up-${a}`)).toBeDisabled()
  await expect(page.getByTestId(`slate-down-${b}`)).toBeDisabled()
  await page.getByTestId(`slate-up-${b}`).click()
  await expect.poll(names).toEqual([b, a])
  // card for B now first (#1) and A second (#2)
  await expect(page.getByTestId('on-deck-pos-1')).toBeVisible()
  const cards = page.locator('[data-testid^="slate-row-"]')
  await expect(cards.nth(0)).toHaveAttribute('data-testid', `slate-row-${b}`)
  await expect(cards.nth(1)).toHaveAttribute('data-testid', `slate-row-${a}`)
  expect(await cards.nth(1).innerText()).toContain((textA.match(/Team A\n([^\n]+)/) ?? [])[1] ?? '')
})

test('28.6 ending the live match promotes slate #1; the rest renumbers; panel stays mounted', async ({ page }) => {
  await startDoubles(page)
  await addViaSelection(page)
  await addViaSelection(page)
  const [first, second] = (await liveState(page)).slatedMatches.map(m => m.id)
  await endMatch(page, 'Court 1')
  await expect.poll(async () => (await liveState(page)).slatedMatches.map(m => m.id)).toEqual([second])
  const st = await liveState(page)
  expect(st.activeMatches.map(m => m.id)).toContain(first)
  await expect(panel(page)).toBeVisible()
  await expect(page.getByTestId('on-deck-pos-1')).toBeVisible()
  await expect(page.getByTestId('on-deck-pos-2')).toHaveCount(0)
  await expect(page.getByTestId('on-deck-count')).toHaveText('1')
  await expect(page.getByTestId(`slate-row-${second}`)).toBeVisible()
})

test('28.7 cancelling a slate returns its players to the queue', async ({ page }) => {
  await startDoubles(page)
  await addViaSelection(page)
  const before = await page.locator('[data-entry-id]').count()
  const [id] = (await liveState(page)).slatedMatches.map(m => m.id)
  await page.getByTestId(`slate-cancel-${id}`).click()
  await expect(page.locator('[data-entry-id]')).toHaveCount(before + 4)
  await expect(page.getByTestId('on-deck-empty')).toBeVisible()
  await expect(panel(page)).toBeVisible()
})

// tests/e2e/28-on-deck.spec.js — always-on On Deck panel: empty state, manual builder, multiple slates, smart add, reorder
// Live matches / slates that are pure setup are seeded over the API (seedLiveMatch /
// seedSlate); the real UI paths are kept where they are the thing under test:
// 28.1 click-start, 28.2 smart-fill, 28.3 builder drags, 28.11 slate-editor drag.
import { test, expect } from '../fixtures.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { base, fullSetup, startDoubles, endMatch, liveState, syntheticDrag, seedSlate, seedLiveMatch } from '../helpers.js'

const here = dirname(fileURLToPath(import.meta.url))
const NAMES = JSON.parse(readFileSync(join(here, '../fixtures/players.json'), 'utf8')).slice(0, 16).map(p => p.name)

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page, { playerNames: NAMES })
  await expandDeck(page)
})

const panel = page => page.getByTestId('on-deck-strip')
// deck starts collapsed by default (r5-2) — every test here drives the expanded panel
const expandDeck = async page => {
  if (!(await page.getByTestId('ondeck-body').isVisible().catch(() => false))) {
    await page.getByTestId('ondeck-collapse').click()
  }
  await expect(page.getByTestId('ondeck-body')).toBeVisible()
}
const openBuilder = async page => {
  if (!(await page.getByTestId('ondeck-builder').isVisible().catch(() => false))) {
    await page.getByTestId('ondeck-builder-toggle').click()
  }
  await expect(page.getByTestId('ondeck-builder')).toBeVisible()
}
// ✨ Smart-fill the builder from the waiting queue, then add the lineup
async function addViaSmartFill(page) {
  await openBuilder(page)
  await page.getByTestId('ondeck-smart-fill').click()
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

test('28.2 builder: smart fill populates slots for review; drafted players leave the queue then return', async ({ page }) => {
  await startDoubles(page)
  const before = await page.locator('[data-entry-id]').count()
  await openBuilder(page)
  await page.getByTestId('ondeck-smart-fill').click()
  for (let i = 0; i < 4; i++) await expect(page.getByTestId(`ondeck-new-slot-${i}`)).not.toHaveText('Drop…')
  await expect(page.locator('[data-entry-id]')).toHaveCount(before - 4)  // builder ids pull players out of the queue
  // fill ≠ slate: nothing on deck until the QM reviews and adds
  await expect(page.getByTestId('on-deck-count')).toHaveText('0')
  await expect(page.getByTestId('on-deck-empty')).toBeVisible()
  expect((await liveState(page)).slatedMatches).toHaveLength(0)
  // the slate card carries exactly the four reviewed slot players
  const slotNames = []
  for (let i = 0; i < 4; i++) slotNames.push((await page.getByTestId(`ondeck-new-slot-${i}`).innerText()).replace(/[\s×]+$/, '').trim())
  await page.getByTestId('ondeck-add').click()
  await expect(page.getByTestId('on-deck-pos-1')).toContainText('Up next')
  await expect(page.getByTestId('on-deck-count')).toHaveText('1')
  await expect(page.getByTestId('on-deck-empty')).toHaveCount(0)
  const cardText = await page.locator('[data-testid^="slate-row-"]').first().innerText()
  for (const n of slotNames) expect(cardText).toContain(n)
  await expect(page.locator('[data-entry-id]')).toHaveCount(before - 4)
  await expect(page.locator('[data-entry-id]').filter({ hasText: slotNames[0] })).toHaveCount(0) // still out of the pool (slated)

  await addViaSmartFill(page)
  await expect(page.getByTestId('on-deck-pos-2')).toBeVisible()
  await expect(page.getByTestId('on-deck-count')).toHaveText('2')
  await expect(page.getByTestId('on-deck-tag')).toHaveCount(2)
  expect((await liveState(page)).slatedMatches).toHaveLength(2)
})

test('28.3 builder: drag from the queue fills slots; clear button empties one', async ({ page }) => {
  await openBuilder(page)
  const before = await page.locator('[data-entry-id]').count()
  for (let i = 0; i < 4; i++) {
    await syntheticDrag(page, '[data-entry-id]', '[data-testid^="ondeck-new-slot-"]', { fromIndex: i, toIndex: i })
  }
  await expect(page.locator('[data-entry-id]')).toHaveCount(before - 4)  // drafted players leave the queue
  await page.getByTestId('ondeck-new-clear-3').click()
  await expect(page.locator('[data-entry-id]')).toHaveCount(before - 3)  // cleared slot's player returns
  await expect(page.getByTestId('ondeck-add')).toBeDisabled()
  await syntheticDrag(page, '[data-entry-id]', '[data-testid="ondeck-new-slot-3"]', { fromIndex: 0, toIndex: 0 })
  await expect(page.getByTestId('ondeck-add')).toBeEnabled()
  await page.getByTestId('ondeck-add').click()
  await expect(page.getByTestId('on-deck-pos-1')).toBeVisible()
  expect((await liveState(page)).slatedMatches).toHaveLength(1)
})

test('28.4 header Smart add: fills the builder for review (no dialog), then Add slates it', async ({ page }) => {
  await page.getByTestId('ondeck-smart-add').click()
  // no confirm dialog — the builder IS the review surface
  await expect(page.getByTestId('start-confirm-dialog')).toHaveCount(0)
  await expect(page.getByTestId('ondeck-builder')).toBeVisible()
  for (let i = 0; i < 4; i++) await expect(page.getByTestId(`ondeck-new-slot-${i}`)).not.toHaveText('Drop…')
  expect((await liveState(page)).slatedMatches).toHaveLength(0)
  expect((await liveState(page)).activeMatches).toHaveLength(0)

  await page.getByTestId('ondeck-add').click()
  await expect(page.getByTestId('toast')).toContainText(/On Deck/)
  await expect(page.getByTestId('on-deck-pos-1')).toBeVisible()
  const st = await liveState(page)
  expect(st.slatedMatches).toHaveLength(1)
  expect(st.activeMatches).toHaveLength(0)
})

test('28.4b smart fill with <4 waiting: toast and empty slots', async ({ page }) => {
  // fresh session with only 3 check-ins — automatch can't plan a slate
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page, { playerNames: NAMES.slice(0, 3) })
  await expandDeck(page) // mid-test fullSetup reloads to collapsed default
  await openBuilder(page)
  await page.getByTestId('ondeck-smart-fill').click()
  await expect(page.getByTestId('toast')).toContainText('Nothing to add — need 4 waiting players')
  for (let i = 0; i < 4; i++) await expect(page.getByTestId(`ondeck-new-slot-${i}`)).toHaveText('Drop…')
  expect((await liveState(page)).slatedMatches).toHaveLength(0)
})

test('28.5 reorder: moving #2 up swaps the order', async ({ page }) => {
  await seedLiveMatch(page)
  await seedSlate(page)
  await seedSlate(page)
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
  await seedLiveMatch(page)
  await seedSlate(page)
  await seedSlate(page)
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
  await seedLiveMatch(page)
  await seedSlate(page)
  const before = await page.locator('[data-entry-id]').count()
  const [id] = (await liveState(page)).slatedMatches.map(m => m.id)
  await page.getByTestId(`slate-cancel-${id}`).click()
  await expect(page.getByTestId('ondeck-cancel-dialog')).toBeVisible()
  await page.getByTestId('ondeck-cancel-confirm').click()
  await expect(page.locator('[data-entry-id]')).toHaveCount(before + 4)
  await expect(page.getByTestId('on-deck-empty')).toBeVisible()
  await expect(panel(page)).toBeVisible()
})

test('28.8 cancelling a slate asks for confirmation; Keep aborts', async ({ page }) => {
  await seedLiveMatch(page)
  await seedSlate(page)
  const before = await page.locator('[data-entry-id]').count()
  const [id] = (await liveState(page)).slatedMatches.map(m => m.id)
  await page.getByTestId(`slate-cancel-${id}`).click()
  // destructive action must confirm first — nothing cancelled until confirmed
  const dialog = page.getByTestId('ondeck-cancel-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Cancel this lineup?')
  await expect(dialog).toContainText('Players return to the queue.')
  expect((await liveState(page)).slatedMatches).toHaveLength(1)
  await expect(page.locator('[data-entry-id]')).toHaveCount(before) // still staged/dimmed
  // Keep = abort: slate untouched
  await page.getByTestId('ondeck-cancel-abort').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId(`slate-row-${id}`)).toBeVisible()
  expect((await liveState(page)).slatedMatches).toHaveLength(1)
  await expect(page.locator('[data-entry-id]')).toHaveCount(before)
})

test('28.9 Start now: a slated lineup goes live on a chosen free court immediately', async ({ page }) => {
  await seedLiveMatch(page) // Court 1 live
  await seedSlate(page) // 4 more checked in → slate on deck
  const [id] = (await liveState(page)).slatedMatches.map(m => m.id)
  const courts = (await liveState(page)).courts
  const freeCourt = courts.find(c => c.label === 'Court 2')
  expect(freeCourt).toBeTruthy()
  const before = await page.locator('[data-entry-id]').count()

  await expect(page.getByTestId(`slate-start-${id}`)).toBeEnabled()
  await page.getByTestId(`slate-start-${id}`).click()
  const dialog = page.getByTestId('ondeck-start-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Start this lineup now?')
  await expect(page.getByTestId(`slate-start-court-${freeCourt.id}`)).toContainText('Court 2')
  // the court button IS the confirm — clicking starts immediately
  await page.getByTestId(`slate-start-court-${freeCourt.id}`).click()

  const st = await liveState(page)
  expect(st.slatedMatches).toHaveLength(0)
  expect(st.activeMatches).toHaveLength(2)
  const live = st.activeMatches.find(m => m.id === id)
  expect(live.court_number).toBe(freeCourt.id)
  expect(live.slate_seq).toBeNull()
  // players were hidden as 'staged' already; they're hidden as 'playing' now
  await expect(page.locator('[data-entry-id]')).toHaveCount(before)
  await expect(page.getByTestId(`slate-row-${id}`)).toHaveCount(0)
  await expect(page.getByTestId('toast')).toContainText('Lineup started on Court 2')
})

test('28.10 Start now: abort keeps the slate; disabled while no court is free', async ({ page }) => {
  await seedLiveMatch(page)
  await seedSlate(page)
  const [id] = (await liveState(page)).slatedMatches.map(m => m.id)

  // abort path: Cancel in the dialog leaves the slate untouched
  await page.getByTestId(`slate-start-${id}`).click()
  const dialog = page.getByTestId('ondeck-start-dialog')
  await expect(dialog).toBeVisible()
  await page.getByTestId('slate-start-abort').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId(`slate-row-${id}`)).toBeVisible()
  expect((await liveState(page)).slatedMatches).toHaveLength(1)
  expect((await liveState(page)).activeMatches).toHaveLength(1)

  // occupy Court 2 too → no free court → the button disables
  await seedLiveMatch(page)
  await expect.poll(async () => (await liveState(page)).activeMatches).toHaveLength(2)

  // a third slate now has no free court → Start now disabled
  await seedSlate(page)
  const slateIds = (await liveState(page)).slatedMatches.map(m => m.id)
  const third = slateIds[slateIds.length - 1] // newest = highest seq (slateIds[0] is the first slate)
  await expect(page.getByTestId(`slate-start-${third}`)).toBeDisabled()

  // free a court again → Start now re-enables. Freeing while any slate exists
  // auto-promotes the lowest, so cancel both slates first (players return),
  // end the match with nothing on deck, then slate fresh.
  for (const sid of [id, third]) {
    await page.getByTestId(`slate-cancel-${sid}`).click()
    await page.getByTestId('ondeck-cancel-confirm').click()
    await expect(page.getByTestId(`slate-row-${sid}`)).toHaveCount(0)
  }
  await endMatch(page, 'Court 1')
  await expect.poll(async () => (await liveState(page)).activeMatches).toHaveLength(1)
  await seedSlate(page)
  const [reid] = (await liveState(page)).slatedMatches.map(m => m.id)
  await expect(page.getByTestId(`slate-start-${reid}`)).toBeEnabled()
})

test('28.11 editing participants: removing a slated player returns them to the waiting pool immediately', async ({ page }) => {
  await seedLiveMatch(page)
  await seedSlate(page)
  const state = await liveState(page)
  const slate = state.slatedMatches[0]
  const removedId = slate.team1_p1
  const removedName = slate.team1_p1_name
  expect((await liveState(page)).queue.find(e => e.id === removedId)).toBeUndefined() // staged: out of the pool

  // edit the lineup: clear slot 0, drop a waiting player in, save
  await page.getByTestId(`slate-edit-${slate.id}`).click()
  await page.getByTestId('slate-slot-clear-0').click()
  await expect(page.getByTestId('slate-slot-0')).toContainText('Drop…')
  const subId = await page.locator('[data-entry-id]').first().getAttribute('data-entry-id')
  await syntheticDrag(page, `[data-entry-id="${subId}"]`, '[data-testid="slate-slot-0"]')
  await page.getByTestId('slate-save').click()
  await expect(page.getByTestId('slate-save')).toBeHidden() // editor closed on success

  // the removed player is back in the waiting pool without a reload — via SSE,
  // rendered again as a normal queue card
  await expect.poll(async () => (await liveState(page)).queue.find(e => e.id === removedId)?.status).toBe('waiting')
  const card = page.locator(`[data-queue-list] [data-entry-id="${removedId}"]`)
  await expect(card).toBeVisible()
  // and the slate really plays the substitute
  const after = await liveState(page)
  expect(after.slatedMatches[0].team1_p1).not.toBe(removedId)
})

// tests/e2e/29-layout.spec.js — resizable bento layout: dividers drag (mouse +
// keyboard), On Deck collapse, and localStorage persistence across reloads.
import { test, expect } from '../fixtures.js'
import { base, fullSetup } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

async function bandHeight(page, testid) {
  return (await page.getByTestId(testid).boundingBox())?.height ?? 0
}

test('29.1 dividers exist', async ({ page }) => {
  await expect(page.getByTestId('divider-courts')).toBeVisible()
  await expect(page.getByTestId('divider-sidebar')).toBeVisible()
  // divider-deck only exists while On Deck is expanded (collapsed by default, r5-2)
  await page.getByTestId('ondeck-collapse').click()
  await expect(page.getByTestId('divider-deck')).toBeVisible()
})

async function courtsBandHeight(page) {
  return page.evaluate(() =>
    document.querySelector('main').firstElementChild.getBoundingClientRect().height)
}

test('29.2 dragging divider-courts resizes the courts band', async ({ page }) => {
  // r6 global budget: courts sit AT the budget max in an 800px window (queue
  // floor 340 + chrome) — grow room needs a taller one
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.waitForTimeout(200)
  const divider = page.getByTestId('divider-courts')
  await expect(divider).toBeVisible()

  const courtsBefore = await courtsBandHeight(page)

  const box = await divider.boundingBox()
  const x = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(x, startY)
  await page.mouse.down()
  await page.mouse.move(x, startY + 80, { steps: 8 })
  await page.mouse.up()
  const courtsAfter = await courtsBandHeight(page)
  expect(Math.abs(courtsAfter - courtsBefore - 80)).toBeLessThanOrEqual(10)
})

test('29.3 courts band height persists across reload', async ({ page }) => {
  const divider = page.getByTestId('divider-courts')
  const box = await divider.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + 60, { steps: 6 })
  await page.mouse.up()
  const afterDrag = await courtsBandHeight(page)

  await page.reload()
  await expect(page.locator('[data-entry-id]').first()).toBeVisible()
  const afterReload = await courtsBandHeight(page)
  expect(Math.abs(afterReload - afterDrag)).toBeLessThanOrEqual(1)
})

test('29.4 on deck collapse toggles and persists', async ({ page }) => {
  // collapsed BY DEFAULT (r5-2): slim bar shows ON DECK title + count, builder/slate rows hidden
  await expect(page.getByTestId('ondeck-body')).toBeHidden()
  await expect(page.getByTestId('on-deck-count')).toBeVisible()
  await expect(page.getByTestId('on-deck-strip')).toContainText('On Deck')
  await expect(page.getByTestId('divider-deck')).toHaveCount(0)

  // expand — persists across reload
  await page.getByTestId('ondeck-collapse').click()
  await expect(page.getByTestId('ondeck-body')).toBeVisible()
  await expect(page.getByTestId('divider-deck')).toBeVisible()
  await page.reload()
  await expect(page.locator('[data-entry-id]').first()).toBeVisible()
  await expect(page.getByTestId('ondeck-body')).toBeVisible()

  // collapse again — persists too
  await page.getByTestId('ondeck-collapse').click()
  await expect(page.getByTestId('ondeck-body')).toBeHidden()
  await page.reload()
  await expect(page.locator('[data-entry-id]').first()).toBeVisible()
  await expect(page.getByTestId('ondeck-body')).toBeHidden()
})

test('29.5 keyboard arrows resize the courts band', async ({ page }) => {
  const divider = page.getByTestId('divider-courts')
  await divider.focus()
  const before = await courtsBandHeight(page)
  await page.keyboard.press('ArrowUp')
  const after = await courtsBandHeight(page)
  expect(Math.abs(after - before)).toBeGreaterThanOrEqual(8)
})

// r6 global budget: no band may push another's content out of view — main
// never overflows (scrollHeight <= clientHeight) at any divider extreme.
async function assertBudgetHolds(page) {
  const m = await page.locator('main').evaluate(el => ({
    overflow: el.scrollHeight - el.clientHeight,
    queueH: el.lastElementChild.getBoundingClientRect().height,
  }))
  expect(m.overflow).toBeLessThanOrEqual(1)
  expect(m.queueH).toBeGreaterThanOrEqual(300) // queue keeps (near) its floor
}

async function drag(page, testid, dy) {
  const box = await page.getByTestId(testid).boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + dy, { steps: 8 })
  await page.mouse.up()
}

test('29.6 dragging the courts divider to its extreme keeps every band on screen', async ({ page }) => {
  for (const [, viewport] of Object.entries({ w800: { width: 1280, height: 800 }, w768: { width: 1366, height: 768 } })) {
    await page.setViewportSize(viewport)
    await page.waitForTimeout(200) // resize listener + clamp effect settle
    await drag(page, 'divider-courts', 2000) // far past any max
    await expect(page.getByTestId('divider-courts')).toBeVisible()
    await assertBudgetHolds(page)
    // and back up to the minimum — courts shrink, queue never vanishes
    await drag(page, 'divider-courts', -2000)
    await assertBudgetHolds(page)
  }
})

test('29.7 dragging the deck divider to its extreme keeps every band on screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(200)
  await page.getByTestId('ondeck-collapse').click()
  await expect(page.getByTestId('divider-deck')).toBeVisible()
  await drag(page, 'divider-deck', 2000)
  await assertBudgetHolds(page)
})

test('29.8 a layout persisted on a tall window self-corrects in a short one', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('queuec-layout', JSON.stringify({ courtsH: 950, deckH: 400, deckOpen: false, sidebarW: 420 }))
  })
  await page.reload()
  await expect(page.locator('[data-entry-id]').first()).toBeVisible()
  await assertBudgetHolds(page)
  // re-expanding On Deck clamps deckH into the current budget too
  await page.getByTestId('ondeck-collapse').click()
  await assertBudgetHolds(page)
})

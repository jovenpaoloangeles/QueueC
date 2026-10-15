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
  await expect(page.getByTestId('divider-deck')).toBeVisible()
  await expect(page.getByTestId('divider-sidebar')).toBeVisible()
})

async function courtsBandHeight(page) {
  return page.evaluate(() =>
    document.querySelector('main').firstElementChild.getBoundingClientRect().height)
}

test('29.2 dragging divider-courts resizes the courts band', async ({ page }) => {
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
  // collapsed: slim bar shows ON DECK title + count, builder/slate rows hidden
  await page.getByTestId('ondeck-collapse').click()
  await expect(page.getByTestId('ondeck-body')).toBeHidden()
  await expect(page.getByTestId('on-deck-count')).toBeVisible()
  await expect(page.getByTestId('on-deck-strip')).toContainText('On Deck')
  await expect(page.getByTestId('divider-deck')).toHaveCount(0)

  await page.reload()
  await expect(page.locator('[data-entry-id]').first()).toBeVisible()
  await expect(page.getByTestId('ondeck-body')).toBeHidden()

  // expand again
  await page.getByTestId('ondeck-collapse').click()
  await expect(page.getByTestId('ondeck-body')).toBeVisible()
  await expect(page.getByTestId('divider-deck')).toBeVisible()
})

test('29.5 keyboard arrows resize the courts band', async ({ page }) => {
  const divider = page.getByTestId('divider-courts')
  await divider.focus()
  const before = await courtsBandHeight(page)
  await page.keyboard.press('ArrowUp')
  const after = await courtsBandHeight(page)
  expect(Math.abs(after - before)).toBeGreaterThanOrEqual(8)
})

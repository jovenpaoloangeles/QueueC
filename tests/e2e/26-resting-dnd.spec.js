// tests/e2e/26-resting-dnd.spec.js — real (browser-native) HTML5 drag onto/out of the Resting tray
import { test, expect } from '../fixtures.js'
import { base, fullSetup, startDoubles } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

const tray = page => page.locator('[data-drop="resting"]')
const nameOf = card => card.locator('.text-base.font-medium').textContent().then(s => s.trim())

test('26.1 dragging a waiting card onto the tray rests the player', async ({ page }) => {
  const card = page.locator('[data-entry-id]').first()
  const name = await nameOf(card)
  const before = await page.locator('[data-entry-id]').count()
  await card.dragTo(tray(page))
  await expect(tray(page).getByRole('button', { name: new RegExp(name) })).toBeVisible()
  await expect(page.locator('[data-entry-id]')).toHaveCount(before - 1)
  await expect(page.getByTestId('queue-tab-rest')).toContainText('(1)')
})

test('26.2 dragging a resting chip back onto a queue row wakes the player', async ({ page }) => {
  const card = page.locator('[data-entry-id]').first()
  const name = await nameOf(card)
  await card.dragTo(tray(page))
  const chip = tray(page).getByRole('button', { name: new RegExp(name) })
  await expect(chip).toBeVisible()
  await chip.dragTo(page.locator('[data-entry-id]').nth(1))
  await expect(tray(page).getByRole('button')).toHaveCount(0)
  await expect(page.locator('[data-entry-id]').filter({ hasText: name })).toHaveCount(1)
})

test('26.3 dragging a resting chip onto the queue list area wakes the player', async ({ page }) => {
  const card = page.locator('[data-entry-id]').first()
  const name = await nameOf(card)
  await card.dragTo(tray(page))
  const chip = tray(page).getByRole('button', { name: new RegExp(name) })
  await expect(chip).toBeVisible()
  await chip.dragTo(page.locator('[data-queue-list]'), { targetPosition: { x: 4, y: 4 } })
  await expect(tray(page).getByRole('button')).toHaveCount(0)
  await expect(page.locator('[data-entry-id]').filter({ hasText: name })).toHaveCount(1)
})

test('26.4 resting row under Rest tab can be dragged back to waiting', async ({ page }) => {
  const card = page.locator('[data-entry-id]').first()
  const name = await nameOf(card)
  await card.dragTo(tray(page))
  await expect(page.getByTestId('queue-tab-rest')).toContainText('(1)')
  await page.getByTestId('queue-tab-all').click()
  await page.locator('[data-resting-id]').dragTo(page.locator('[data-entry-id]').first())
  await expect(page.locator('[data-resting-id]')).toHaveCount(0)
  await expect(page.locator('[data-entry-id]').filter({ hasText: name })).toHaveCount(1)
})

test('26.5 a playing player dragged onto the tray is rejected', async ({ page }) => {
  await startDoubles(page)
  const playing = page.locator('[data-team-side] span[draggable="true"]').first()
  const name = (await playing.textContent()).trim()
  await playing.dragTo(tray(page))
  await page.waitForTimeout(500)
  await expect(tray(page).getByRole('button')).toHaveCount(0)
  await expect(page.locator('[data-team-side]').filter({ hasText: name }).first()).toBeVisible()
  const { queue } = await page.evaluate(() => new Promise(res => {
    const es = new EventSource('/api/sse')
    es.addEventListener('state', e => { es.close(); res(JSON.parse(e.data)) })
  }))
  expect(queue.find(e => e.name === name).status).toBe('playing')
})

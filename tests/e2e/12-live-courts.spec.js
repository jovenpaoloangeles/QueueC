// tests/e2e/12-live-courts.spec.js
import { test, expect } from '../fixtures.js'
import { base, fullSetup, syntheticDrag, startDoubles, clickStartMatch } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page, { courts: 2 })
})

// live-card sides are per-player chips now: name + tier badge per line —
// read the name lines only
const sideNames = async (page, side) =>
  (await page.locator(`[data-team-side="${side}"]`).innerText())
    .split('\n').map(s => s.trim())
    .filter(s => s && !/^(new|beg|lower int|upper int|int|expert)$/i.test(s))

test('12.1 court cards have no "Open" checkbox', async ({ page }) => {
  await expect(page.locator('text=Court 1').first()).toBeVisible()
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0)
})

test('12.8 two courts independent', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await clickStartMatch(page)
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(1)
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await clickStartMatch(page)
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(2)
})

// Team rearrange. TeamPlayer spans are the draggable player sources; the
// TeamPanel root is the drop target (and its own drag source for full swap).
test('12.5 drag player from team 1 to team 2 — slot swap', async ({ page }) => {
  await startDoubles(page)
  // start order: team1 = C1+C2, team2 = C3+C4; drag C1 onto team 2 panel
  await syntheticDrag(page, '[data-team-side="1"] span', '[data-team-side="2"]', { fromIndex: 1, toIndex: 0 })
  // rearrange swaps same-slot: team1_p1 ↔ team2_p1 → C3+C2 vs C1+C4
  await expect(page.locator('[data-team-side="1"]')).toContainText('Inter C3') // SSE tick
  expect(await sideNames(page, 1)).toEqual(['Inter C3', 'Inter C2'])
  expect(await sideNames(page, 2)).toEqual(['Inter C1', 'Inter C4'])
})

test('12.6 drag team 1 panel to team 2 — full swap', async ({ page }) => {
  await startDoubles(page)
  await syntheticDrag(page, '[data-team-side="1"]', '[data-team-side="2"]', { fromIndex: 0, toIndex: 0 })
  await expect(page.locator('[data-team-side="1"]')).toContainText('Inter C3') // SSE tick
  expect(await sideNames(page, 1)).toEqual(['Inter C3', 'Inter C4'])
  expect(await sideNames(page, 2)).toEqual(['Inter C1', 'Inter C2'])
})

test('12.7 drag own-team player to own team — no change', async ({ page }) => {
  await startDoubles(page)
  await syntheticDrag(page, '[data-team-side="1"] span', '[data-team-side="1"]', { fromIndex: 1, toIndex: 0 })
  expect(await sideNames(page, 1)).toEqual(['Inter C1', 'Inter C2'])
  expect(await sideNames(page, 2)).toEqual(['Inter C3', 'Inter C4'])
})

// tests/e2e/12-live-courts.spec.js
import { test, expect } from '@playwright/test'
import { BASE, fullSetup, syntheticDrag, startDoubles } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page, { courts: 2 })
})

test('12.1 "Open" checkbox on each court card', async ({ page }) => {
  const checkboxes = page.locator('text=Open').locator('..').locator('input[type="checkbox"]')
  await expect(checkboxes).toHaveCount(2)
})

test('12.2 uncheck Open — court hidden', async ({ page }) => {
  const checkbox = page.locator('text=Open').locator('..').locator('input[type="checkbox"]').first()
  await checkbox.click() // use click; uncheck() re-verifies state but card is removed by SSE
  await page.waitForTimeout(400)
  await expect(page.locator('text=Court 1')).toHaveCount(0)
})

test('12.3 re-check Open — court reappears', async ({ page }) => {
  // Click to disable Court 1 (card removed from DOM); then re-enable via API and verify
  const checkbox = page.locator('text=Open').locator('..').locator('input[type="checkbox"]').first()
  await checkbox.click() // disables court 1; CourtCard is removed from DOM
  await page.waitForTimeout(400)
  // Court 1 is gone; re-enable it via the courts API directly
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  const { courts } = await (await page.request.get(`${BASE}/api/sessions/${session.id}/courts`)).json()
  const court1 = courts.find(c => c.label === 'Court 1')
  await page.request.fetch(`${BASE}/api/courts/${court1.id}`, {
    method: 'PATCH', data: { enabled: 1 },
  })
  await page.waitForTimeout(400)
  await expect(page.locator('text=Court 1')).toBeVisible()
})

test('12.4 disabling court mid-match does not end it', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  const checkbox = page.locator('text=Open').locator('..').locator('input[type="checkbox"]').first()
  await checkbox.click() // disables court; CourtCard removed from DOM
  await page.waitForTimeout(400)
  // Re-enable via API since the card (and its checkbox) is gone
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  const { courts } = await (await page.request.get(`${BASE}/api/sessions/${session.id}/courts`)).json()
  const court1 = courts.find(c => c.label === 'Court 1')
  await page.request.fetch(`${BASE}/api/courts/${court1.id}`, {
    method: 'PATCH', data: { enabled: 1 },
  })
  await page.waitForTimeout(400)
  await expect(page.getByRole('button', { name: 'End Match' })).toBeVisible()
})

test('12.8 two courts independent', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(2)
})

// Team rearrange. TeamPlayer spans are the draggable player sources; the
// TeamPanel root is the drop target (and its own drag source for full swap).
test('12.5 drag player from team 1 to team 2 — slot swap', async ({ page }) => {
  await startDoubles(page)
  // start order: team1 = C1+C2, team2 = C3+C4; drag C1 onto team 2 panel
  await syntheticDrag(page, '[data-team-side="1"] span', '[data-team-side="2"]', { fromIndex: 1, toIndex: 0 })
  // rearrange swaps same-slot: team1_p1 ↔ team2_p1 → C3+C2 vs C1+C4
  await expect(page.locator('[data-team-side="1"]')).toHaveText('Inter C3 + Inter C2')
  await expect(page.locator('[data-team-side="2"]')).toHaveText('Inter C1 + Inter C4')
})

test('12.6 drag team 1 panel to team 2 — full swap', async ({ page }) => {
  await startDoubles(page)
  await syntheticDrag(page, '[data-team-side="1"]', '[data-team-side="2"]', { fromIndex: 0, toIndex: 0 })
  await expect(page.locator('[data-team-side="1"]')).toHaveText('Inter C3 + Inter C4')
  await expect(page.locator('[data-team-side="2"]')).toHaveText('Inter C1 + Inter C2')
})

test('12.7 drag own-team player to own team — no change', async ({ page }) => {
  await startDoubles(page)
  await syntheticDrag(page, '[data-team-side="1"] span', '[data-team-side="1"]', { fromIndex: 1, toIndex: 0 })
  await page.waitForTimeout(800) // pass an SSE tick
  await expect(page.locator('[data-team-side="1"]')).toHaveText('Inter C1 + Inter C2')
  await expect(page.locator('[data-team-side="2"]')).toHaveText('Inter C3 + Inter C4')
})

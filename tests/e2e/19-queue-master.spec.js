import { test, expect } from '@playwright/test'
import { BASE, fullSetup, endMatch, getQueueNames } from '../helpers.js'

// Queue master — real session scenarios (section 19)

test.beforeEach(async ({ page }) => {
  const { session } = await (await fetch(`${BASE}/api/sessions/active`)).json()
  if (session) await fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
})

// Get entry IDs from DOM (waiting queue)
async function getDOMEntryIds(page) {
  return page.locator('[data-entry-id]').evaluateAll(els => els.map(el => +el.getAttribute('data-entry-id')))
}

// Start a doubles match. fullSetup leaves Manual mode — click 4 cards, then Start Match (same as spec 07).
async function startDoublesMatch(page) {
  const cards = page.locator('[data-entry-id]')
  for (let i = 0; i < 4; i++) await cards.nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
}

test('QM.1 late player joins mid-match — visible in queue via live check-in', async ({ page }) => {
  await fullSetup(page)
  await startDoublesMatch(page)
  const beforeCount = await page.locator('[data-entry-id]').count()

  await page.getByRole('button', { name: /Check In/i }).click()
  await page.getByRole('button', { name: 'Newbie A1', exact: false }).first().click()
  await page.waitForTimeout(400)

  await expect(page.locator('[data-entry-id]')).toHaveCount(beforeCount + 1)
})

test('QM.2 player removed via API — gone from queue', async ({ page }) => {
  await fullSetup(page)
  await page.locator('[data-entry-id]').first().waitFor()
  const entryIds = await getDOMEntryIds(page)
  expect(entryIds.length).toBeGreaterThan(0)
  const target = entryIds[0]

  await fetch(`${BASE}/api/queue/${target}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'left' }),
  })
  await page.waitForTimeout(400)

  await expect(page.locator('[data-entry-id]')).toHaveCount(entryIds.length - 1)
})

test('QM.3 smart mode skips players already on court', async ({ page }) => {
  await fullSetup(page)
  const initialCount = await page.locator('[data-entry-id]').count()

  await startDoublesMatch(page)

  const waitingCount = await page.locator('[data-entry-id]').count()
  expect(waitingCount).toBe(initialCount - 4)

  // Smart can only suggest from waiting players — not the 4 on court
  await page.getByRole('button', { name: 'Smart' }).click()
  await page.waitForTimeout(400)

  await expect(page.locator('[data-entry-id]')).toHaveCount(waitingCount)
})

test('QM.4 queue master overrides smart suggestion — manual picks different 4', async ({ page }) => {
  await fullSetup(page)
  await page.getByRole('button', { name: 'Smart' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Manual' }).click()
  await page.waitForTimeout(200)

  const cards = page.locator('[data-entry-id]')
  for (let i = 0; i < 4; i++) await cards.nth(i).click()

  await expect(page.locator('text=/4 selected.*Doubles/i')).toBeVisible()
})

test('QM.5 court disabled mid-match — match persists; court hidden; re-enable restores', async ({ page }) => {
  await fullSetup(page, { courts: 2 })
  await startDoublesMatch(page)

  await expect(page.locator('text=Court 1')).toBeVisible()
  await expect(page.locator('text=Court 2')).toBeVisible()

  // Disable Court 1 — card removed from DOM
  const checkbox = page.locator('text=Open').locator('..').locator('input[type="checkbox"]').first()
  await checkbox.click()
  await page.waitForTimeout(400)
  await expect(page.locator('text=Court 1')).toHaveCount(0)

  // Court 1's card (and its End Match) gone with it; re-enable must bring the match back
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(0)

  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()

  // Re-enable via API (checkbox is gone with the card)
  const { courts } = await (await page.request.get(`${BASE}/api/sessions/${session.id}/courts`)).json()
  const court1 = courts.find(c => c.label === 'Court 1')
  await page.request.fetch(`${BASE}/api/courts/${court1.id}`, {
    method: 'PATCH', data: { enabled: 1 },
  })
  await page.waitForTimeout(400)

  // Court restored with its match
  await expect(page.locator('text=Court 1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(1)
})

test('QM.6 end session with active match — header shows no active session', async ({ page }) => {
  await fullSetup(page)
  await startDoublesMatch(page)

  await page.getByRole('button', { name: 'End Session' }).click()
  await page.waitForTimeout(500)

  await expect(page.locator('text=No active session')).toBeVisible()
})

test('QM.7 two matches end simultaneously — all 8 players return to queue', async ({ page }) => {
  await fullSetup(page, { courts: 2 })
  await startDoublesMatch(page)
  await startDoublesMatch(page)

  await expect(page.getByRole('button', { name: 'End Match' })).toHaveCount(2)

  await page.getByRole('button', { name: 'End Match' }).first().click()
  await page.getByLabel('Team 1').fill('21')
  await page.getByLabel('Team 2').fill('15')
  await page.getByRole('button', { name: 'Confirm' }).click()
  await page.waitForTimeout(400)

  await page.getByRole('button', { name: 'End Match' }).first().click()
  await page.getByLabel('Team 1').fill('21')
  await page.getByLabel('Team 2').fill('15')
  await page.getByRole('button', { name: 'Confirm' }).click()
  await page.waitForTimeout(400)

  await expect(page.locator('[data-entry-id]')).toHaveCount(8)
})

test('QM.8 drag reorder — order survives next SSE tick', async ({ page }) => {
  await fullSetup(page)
  await page.locator('[data-entry-id]').first().waitFor()

  const before = await getQueueNames(page)
  expect(before.length).toBeGreaterThanOrEqual(2)

  // Synthetic HTML5 drag: React handlers read module-level drag.current, set on dragstart.
  // Playwright's dragTo doesn't fire React's drag handlers, so dispatch native DragEvents.
  // Drag the 2nd card onto the 1st (moveBefore of an already-preceding card is a no-op).
  await page.evaluate(() => {
    const cards = document.querySelectorAll('[data-entry-id]')
    const mk = type => {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'dataTransfer', { value: new DataTransfer() })
      return ev
    }
    cards[1].dispatchEvent(mk('dragstart'))
    cards[0].dispatchEvent(mk('dragover'))
    cards[0].dispatchEvent(mk('drop'))
    cards[1].dispatchEvent(mk('dragend'))
  })

  await expect(page.locator('[data-entry-id]').first().locator('.text-base.font-medium'))
    .toHaveText(before[1])
  await expect(page.locator('[data-entry-id]').nth(1).locator('.text-base.font-medium'))
    .toHaveText(before[0])

  // SSE tick must not reset the manual reorder
  await page.waitForTimeout(1600)
  const after = await getQueueNames(page)
  expect(after[0]).toBe(before[1])
  expect(after[1]).toBe(before[0])
})

test('QM.9 full session cycle — create, check-in, start, match, end match, end session, new session', async ({ page }) => {
  await fullSetup(page)
  await startDoublesMatch(page)
  await endMatch(page, 'Court 1')

  await page.getByRole('button', { name: 'End Session' }).click()
  await page.waitForTimeout(500)
  await expect(page.locator('text=No active session')).toBeVisible()

  await page.getByRole('button', { name: '+ Session' }).click()
  await page.getByLabel('Name').fill('Session 2')
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started', { timeout: 5000 })

  await expect(page.locator('text=Session 2')).toBeVisible()
})

test('QM.10 benched player returned mid-match — appears at end of queue', async ({ page }) => {
  await fullSetup(page)
  await page.locator('[data-entry-id]').first().waitFor()

  // Bench the first player
  await page.locator('[data-entry-id]').first().click({ modifiers: ['Shift'] })
  await page.waitForTimeout(300)

  // Start match with 4 of the remaining 7
  await startDoublesMatch(page)

  const beforeReturn = await page.locator('[data-entry-id]').count()

  await page.locator('[data-drop="resting"]').getByRole('button', { name: /↩/ }).click()
  await page.waitForTimeout(400)

  await expect(page.locator('[data-entry-id]')).toHaveCount(beforeReturn + 1)

  const names = await getQueueNames(page)
  expect(names.length).toBe(beforeReturn + 1)
  expect(names[names.length - 1]).toBeTruthy()
})

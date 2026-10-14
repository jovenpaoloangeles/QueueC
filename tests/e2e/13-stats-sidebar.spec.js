// tests/e2e/13-stats-sidebar.spec.js
import { test, expect } from '@playwright/test'
import { BASE, fullSetup, endMatch, startDoubles } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

test('13.1 player count tile matches check-in count', async ({ page }) => {
  await expect(page.locator('text=Players').locator('..').locator('[class*="font-mono"]')).toHaveText('8')
})

test('13.2 match count starts at 0', async ({ page }) => {
  await expect(page.locator('text=Matches').locator('..').locator('[class*="font-mono"]')).toHaveText('0')
})

test('13.3 match count increments after end', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  await endMatch(page, 'Court')
  await expect(page.locator('text=Matches').locator('..').locator('[class*="font-mono"]')).toHaveText('1')
})

test('13.9 "+ Add Player" shows form', async ({ page }) => {
  await page.getByRole('complementary').getByRole('button', { name: /Add Player/i }).click()
  await expect(page.locator('input[placeholder], input[type="text"]').last()).toBeVisible()
})

test('13.11 skill-level select has 7 options', async ({ page }) => {
  await page.getByRole('complementary').getByRole('button', { name: /Add Player/i }).click()
  await page.locator('button[role="combobox"]').last().click()
  const options = page.locator('[role="option"], [role="listitem"]')
  await expect(options).toHaveCount(7)
})

test('13.4 avg wait tile shows mm:ss before any match ends', async ({ page }) => {
  const tile = page.getByRole('complementary').locator('text=Avg Wait').locator('..').locator('[class*="font-mono"]')
  await expect(tile).toHaveText(/^\d{2}:\d{2}$/)
})

test('13.5 avg wait shows a time string after first match ends', async ({ page }) => {
  await startDoubles(page)
  await endMatch(page, 'Court')
  const tile = page.getByRole('complementary').locator('text=Avg Wait').locator('..').locator('[class*="font-mono"]')
  await expect(tile).toHaveText(/^\d{2}:\d{2}$/)
})

test('13.6 leaderboard empty before any match ends', async ({ page }) => {
  await expect(page.locator('text=Wins Today')).toHaveCount(0)
})

test('13.7 winner of first match appears in leaderboard with 1 win', async ({ page }) => {
  await startDoubles(page)
  await endMatch(page, 'Court', { team1: 21, team2: 15 })
  await expect(page.locator('text=Wins Today')).toBeVisible()
  await expect(page.locator('text=1W')).toHaveCount(2) // both winning players
})

test('13.8 player with most wins ranks first', async ({ page }) => {
  // match 1: C1+C2 beat E1+E2
  await startDoubles(page)
  await endMatch(page, 'Court', { team1: 21, team2: 15 })
  // match 2: C1+C2 again (returned players at end of queue) beat D1+D2
  for (const n of ['Inter C1', 'Inter C2', 'Upper D1', 'Upper D2']) {
    await page.locator('[data-entry-id]').filter({ hasText: n }).click()
  }
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
  await endMatch(page, 'Court', { team1: 21, team2: 15 })
  // double winners (2W) rank first — exact text so parent rows don't also match
  await expect(page.getByRole('complementary').getByText('2W', { exact: true })).toHaveCount(2)
  const first = await page.locator('span', { hasText: /^\d+\. / }).first().innerText()
  expect(first).toMatch(/Inter C[12]/)
})

test('13.10 add-player form has name field and skill select', async ({ page }) => {
  await page.getByRole('complementary').getByRole('button', { name: /Add Player/i }).click()
  await expect(page.locator('#add-player-name')).toBeVisible()
  await expect(page.locator('#add-player-skill')).toBeVisible()
})

test('13.12 submit add-player form — player appears in check-in pool', async ({ page }) => {
  await page.getByRole('complementary').getByRole('button', { name: /Add Player/i }).click()
  const name = `Rookie Z${Date.now().toString(36)}` // unique: players table persists across tests
  await page.locator('#add-player-name').fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Check In/i }).click()
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
})

test('13.13 added player persists across page reload', async ({ page }) => {
  const name = `Rookie Z${Date.now().toString(36)}`
  await page.getByRole('complementary').getByRole('button', { name: /Add Player/i }).click()
  await page.locator('#add-player-name').fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.waitForTimeout(400)
  await page.reload()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /Check In/i }).click()
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
})

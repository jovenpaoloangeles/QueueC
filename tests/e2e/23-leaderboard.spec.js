import { test, expect } from '../fixtures.js'
import { base, fullSetup, endMatch, startDoubles } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

test('23.1 empty leaderboard and zero shuttle tile on fresh session', async ({ page }) => {
  const side = page.getByRole('complementary')
  await expect(side.getByTestId('leaderboard-empty')).toBeVisible()
  await expect(side.locator('text=New Shuttles').locator('..').locator('[class*="font-mono"]')).toHaveText('0')
  // used-shuttle counting was removed — no Used tile anymore
  await expect(side.getByText('Used Shuttles')).toHaveCount(0)
})

test('23.2 leaderboard shows W/L, win % and point diff after a match', async ({ page }) => {
  await startDoubles(page)
  await endMatch(page, 'Court', { team1: 21, team2: 15 })
  const rows = page.getByTestId('leaderboard-row')
  await expect(rows).toHaveCount(4)
  const texts = await rows.allInnerTexts()
  const win = texts.filter(t => t.includes('1/0'))
  const lose = texts.filter(t => t.includes('0/1'))
  expect(win).toHaveLength(2)
  expect(lose).toHaveLength(2)
  for (const t of win) { expect(t).toContain('100%'); expect(t).toContain('+6') }
  for (const t of lose) { expect(t).toContain('0%'); expect(t).toContain('-6') }
})

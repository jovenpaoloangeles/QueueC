// tests/e2e/17-layout.spec.js
import { test, expect } from '@playwright/test'
import { BASE, createSession, checkinPlayers, startSession, fullSetup, startDoubles, endMatch } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
})

test('17.1 1-court fills courts band', async ({ page }) => {
  await createSession(page, { courts: 1 })
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  const courtCards = page.locator('text=Court 1').locator('../..')
  await expect(courtCards).toHaveCount(1)
})

test('17.2 2-court — 2 court cards', async ({ page }) => {
  await createSession(page, { courts: 2 })
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  // Count distinct court labels
  await expect(page.locator('text=/^Court \\d+$/')).toHaveCount(2)
})

test('17.3 5-court — 5 court cards', async ({ page }) => {
  await createSession(page, { courts: 5 })
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await expect(page.locator('text=/^Court \\d+$/')).toHaveCount(5)
})

test('17.4 stats sidebar scrollable when content is long', async ({ page }) => {
  await fullSetup(page)
  await startDoubles(page)
  await endMatch(page, 'Court') // leaderboard rows make the sidebar taller
  await page.setViewportSize({ width: 1000, height: 320 })
  await page.waitForTimeout(300)
  const aside = page.locator('aside')
  const { scrollHeight, clientHeight } = await aside.evaluate(el => ({
    scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
  }))
  expect(scrollHeight).toBeGreaterThan(clientHeight)
  // and it actually scrolls
  await aside.evaluate(el => { el.scrollTop = 100 })
  expect(await aside.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
})

test('17.5 queue grid scrollable with many players', async ({ page }) => {
  // end the session beforeEach created; rebuilding with 20 players on top of it
  // blows the default 30s budget
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  const all = []
  for (const tier of ['A', 'B', 'C', 'D', 'E']) {
    const label = { A: 'Newbie', B: 'Beginner', C: 'Inter', D: 'Upper', E: 'Advanced' }[tier]
    for (let i = 1; i <= 4; i++) all.push(`${label} ${tier}${i}`)
  }
  await fullSetup(page, { playerNames: all })
  await page.setViewportSize({ width: 1000, height: 500 })
  await page.waitForTimeout(300)
  // last overflow container in main = queue grid (first is CourtsRow, fixed height)
  const grid = page.locator('main .overflow-y-auto').last()
  const { scrollHeight, clientHeight } = await grid.evaluate(el => ({
    scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
  }))
  expect(scrollHeight).toBeGreaterThan(clientHeight)
})

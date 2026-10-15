// tests/e2e/17-layout.spec.js
import { test, expect } from '../fixtures.js'
import { base, createSession, checkinPlayers, startSession, fullSetup, startDoubles, endMatch } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
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
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  // use every registered fixture player (22 across all 7 tiers)
  const { players } = await (await page.request.get(`${base()}/api/players`)).json()
  await fullSetup(page, { playerNames: players.map(p => p.name) })
  await page.setViewportSize({ width: 1000, height: 500 })
  await page.waitForTimeout(300)
  // queue list itself is the scroll container (main is overflow-hidden now)
  const grid = page.locator('[data-queue-list]')
  const { scrollHeight, clientHeight } = await grid.evaluate(el => ({
    scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
  }))
  expect(scrollHeight).toBeGreaterThan(clientHeight)
})

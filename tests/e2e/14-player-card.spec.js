// tests/e2e/14-player-card.spec.js
import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { BASE, fullSetup, getQueueNames, startDoubles, endMatch } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page)
})

test('14.1 card shows name, skill badge, wait timer, minutes played', async ({ page }) => {
  const card = page.locator('[data-entry-id]').first()
  await expect(card.locator('.text-base.font-medium')).toBeVisible()
  await expect(card.locator('[class*="text-2xs"]')).toBeVisible() // skill badge
  await expect(card.locator('[class*="font-mono"]')).toBeVisible() // wait timer
  await expect(card.locator('text=played')).toBeVisible()
})

test('14.2 wait timer increments each second', async ({ page }) => {
  const timer = page.locator('[data-entry-id]').first().locator('[class*="font-mono"][class*="tabular-nums"]')
  const t1 = await timer.textContent()
  await page.waitForTimeout(2000)
  const t2 = await timer.textContent()
  expect(t1).not.toEqual(t2)
})

test('14.4 selection badge shows 1-based index', async ({ page }) => {
  for (let i = 0; i < 3; i++) await page.locator('[data-entry-id]').nth(i).click()
  await expect(page.locator('[class*="rounded-full"][class*="bg-primary"]').locator('text=3')).toBeVisible()
})

test('14.3 playing players absent from queue grid', async ({ page }) => {
  const names = await getQueueNames(page)
  const playing = names.slice(0, 4)
  await startDoubles(page)
  const now = await getQueueNames(page)
  for (const p of playing) expect(now).not.toContain(p)
  expect(now.length).toBe(4)
})

test('14.5 after returning from a match, min played reflects duration', async ({ page }) => {
  const name = (await getQueueNames(page))[0].trim() // first waiting player → played in startDoubles
  await startDoubles(page)
  // backdate via sqlite so the ended duration is ~10 min (WAL: server sees the write)
  execSync(`sqlite3 /tmp/queuec-test.db "UPDATE matches SET started_at = started_at - 600 WHERE ended_at IS NULL"`)
  await endMatch(page, 'Court')
  await expect(page.locator('[data-entry-id]').filter({ hasText: name })).toContainText('10m played')
})

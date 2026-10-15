// tests/e2e/11-live-checkin.spec.js
import { test, expect } from '../fixtures.js'
import { base, createSession, checkinPlayers, startSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  // Only check in 4 players — leaves 16 available for live check-in
  await createSession(page)
  await checkinPlayers(page, ['Inter C1', 'Inter C2', 'Inter C3', 'Inter C4'])
  await startSession(page)
})

test('11.1 "+ Check In" button visible', async ({ page }) => {
  await expect(page.getByTestId('checkin-toggle')).toBeVisible()
})

test('11.2 open panel lists nothing until a query is typed', async ({ page }) => {
  await page.getByTestId('checkin-toggle').click()
  // empty query: hint only — no full registered-player dump
  await expect(page.getByTestId('checkin-search')).toBeVisible()
  await expect(page.getByTestId('checkin-hint')).toHaveText('Type to search registered players')
  await expect(page.getByTestId('combobox-matches')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Expert E1', exact: false })).toHaveCount(0)
})

test('11.3 checking in appends to queue end', async ({ page }) => {
  // Wait for queue entries to render before snapshotting count
  await page.locator('[data-entry-id]').first().waitFor()
  const beforeCount = await page.locator('[data-entry-id]').count()
  await page.getByTestId('checkin-toggle').click()
  await page.getByTestId('checkin-search').fill('Expert E1')
  await page.getByTestId('combobox-matches').getByRole('button', { name: 'Expert E1' }).click()
  await expect(page.locator('[data-entry-id]')).toHaveCount(beforeCount + 1)
})

test('11.4 search clears after check-in, panel stays open for multi-add', async ({ page }) => {
  await page.getByTestId('checkin-toggle').click()
  const search = page.getByTestId('checkin-search')
  await search.fill('Expert E1')
  await page.getByTestId('combobox-matches').getByRole('button', { name: 'Expert E1' }).click()
  await expect(page.locator('[data-entry-id]')).toHaveCount(5)
  // panel stays open, query cleared, matches gone (player is now in the queue)
  await expect(search).toBeVisible()
  await expect(search).toHaveValue('')
  await expect(page.getByTestId('combobox-matches')).toHaveCount(0)
})

test('11.5 checked-in player absent from matches', async ({ page }) => {
  await page.getByTestId('checkin-toggle').click()
  await page.getByTestId('checkin-search').fill('Expert')
  await page.getByTestId('combobox-matches').getByRole('button', { name: 'Expert E1' }).click()
  await expect(page.locator('[data-entry-id]')).toHaveCount(5)
  // re-open (panel stays open) and search again — E1 is now in-session
  await page.getByTestId('checkin-search').fill('Expert')
  await expect(page.getByTestId('combobox-matches').getByRole('button', { name: 'Expert E1' })).toHaveCount(0)
  await expect(page.getByTestId('combobox-matches').getByRole('button', { name: 'Expert E2' })).toBeVisible()
})

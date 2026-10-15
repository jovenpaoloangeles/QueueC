// tests/e2e/16-accessibility.spec.js
import { test, expect } from '../fixtures.js'
import { base, createSession, checkinPlayers, startSession, fullSetup, clickStartMatch } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
})

test('16.1 setup form: Enter in a field does not start without 2 players, labels are associated', async ({ page }) => {
  await page.goto('/')
  for (const label of ['Session name', 'Start time', 'Number of courts', 'Court 1 label', 'Court 1 hours']) {
    await expect(page.getByLabel(label)).toBeVisible()
  }
  await page.getByLabel('Session name').fill('Enter Test')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('session-setup')).toBeVisible()
  await expect(page.getByTestId('start-session')).toBeDisabled()
})

test('16.2 end match form submits on Enter', async ({ page }) => {
  await fullSetup(page)
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await clickStartMatch(page)
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'End Match' }).first().click()
  await page.getByTestId('confirm-end-end').click() // pass the confirm gate → finalization form
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('16.3 setup controls reachable by Tab, Start Session last', async ({ page }) => {
  await page.goto('/')
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await page.getByLabel('Session name').focus()
  let reached = false
  for (let i = 0; i < 80 && !reached; i++) {
    await page.keyboard.press('Tab')
    reached = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'start-session')
  }
  expect(reached).toBe(true)
})

test('16.4 score inputs Tab-navigable', async ({ page }) => {
  await fullSetup(page)
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await clickStartMatch(page)
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'End Match' }).first().click()
  await page.getByTestId('confirm-end-end').click() // pass the confirm gate
  await page.getByLabel('Team 1').focus()
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => document.activeElement?.id)
  expect(focused).toBe('end-match-team2')
})

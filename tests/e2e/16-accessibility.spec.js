// tests/e2e/16-accessibility.spec.js
import { test, expect } from '@playwright/test'
import { BASE, createSession, checkinPlayers, startSession, fullSetup } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
})

test('16.1 create session form submits on Enter', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '+ Session' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Name').fill('Enter Test')
  await page.keyboard.press('Enter')
  await page.waitForSelector('text=Not started', { timeout: 5000 })
  await expect(page.locator('text=Enter Test')).toBeVisible()
})

test('16.2 end match form submits on Enter', async ({ page }) => {
  await fullSetup(page)
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'End Match' }).first().click()
  await page.getByTestId('confirm-end-end').click() // pass the confirm gate → finalization form
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('16.3 modal close buttons reachable by Tab', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '+ Session' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  // focus Name explicitly — focus restore from the unmounted confirm dialog
  // otherwise leaves tab order starting outside the modal
  await page.getByLabel('Name').focus()
  // Tab through modal — Cancel should be focusable
  // type=date uses 4 sub-fields, type=time uses 4 sub-fields each; Cancel is at Tab 14 from Name
  for (let i = 0; i < 14; i++) await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => document.activeElement?.textContent)
  expect(['Cancel', 'Create Session']).toContain(focused?.trim())
})

test('16.4 score inputs Tab-navigable', async ({ page }) => {
  await fullSetup(page)
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'End Match' }).first().click()
  await page.getByTestId('confirm-end-end').click() // pass the confirm gate
  await page.getByLabel('Team 1').focus()
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => document.activeElement?.id)
  expect(focused).toBe('end-match-team2')
})

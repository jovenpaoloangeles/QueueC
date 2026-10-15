// tests/e2e/22-setup-pool.spec.js
// Setup pool smoke: select-all toggling, tier filter + select-all scope,
// and custom per-court duration rendering back in the setup court list.
import { test, expect } from '@playwright/test'
import { BASE, createSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${BASE}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
})

// Pool size comes from the API: the fixture seeds 22, but earlier specs
// register players that persist in the shared DB for the whole run.
async function poolTotal(page) {
  const { players } = await (await page.request.get(`${BASE}/api/players`)).json()
  return players.length
}

test('22.1 select all toggles every pool chip on, then off', async ({ page }) => {
  await createSession(page)
  const chips = page.locator('[data-testid="player-pool"] button')
  const total = await poolTotal(page)
  expect(total).toBeGreaterThanOrEqual(22)
  await expect(chips).toHaveCount(total)

  await page.getByTestId('select-all').click()
  await expect(chips).toHaveCount(total)
  expect(await chips.evaluateAll(els => els.every(el => el.getAttribute('aria-pressed') === 'true'))).toBe(true)
  await expect(page.getByText(`${total} selected`)).toBeVisible()
  await expect(page.getByRole('button', { name: `Check In (${total})` })).toBeVisible()

  // second click clears the selection
  await page.getByTestId('select-all').click()
  expect(await chips.evaluateAll(els => els.every(el => el.getAttribute('aria-pressed') === 'false'))).toBe(true)
  await expect(page.getByText('0 selected')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check In', exact: true })).toBeDisabled()
})

test('22.2 tier filter shows only that tier; select-all only touches visible chips', async ({ page }) => {
  await createSession(page)
  const chips = page.locator('[data-testid="player-pool"] button')
  const total = await poolTotal(page)
  await expect(chips).toHaveCount(total)

  const { players } = await (await page.request.get(`${BASE}/api/players`)).json()
  const intermediateCount = players.filter(p => p.skill_level === 'intermediate').length
  expect(intermediateCount).toBeGreaterThan(0)
  expect(intermediateCount).toBeLessThan(total)

  await page.getByLabel('Filter tier').selectOption('intermediate')
  await expect(chips).toHaveCount(intermediateCount)
  // intermediate badge is amber (bg-amber-100)
  expect(await chips.evaluateAll(els => els.map(el => [...el.querySelectorAll('*')]
    .some(x => String(x.className).includes('bg-amber-100'))))).toEqual(
    Array(intermediateCount).fill(true)
  )

  await page.getByTestId('select-all').click()
  expect(await chips.evaluateAll(els => els.every(el => el.getAttribute('aria-pressed') === 'true'))).toBe(true)
  await expect(page.getByText(`${intermediateCount} selected`)).toBeVisible()

  // off-filter players were not selected by the filtered select-all
  await page.getByLabel('Filter tier').selectOption('')
  await expect(chips).toHaveCount(total)
  const states = await chips.evaluateAll(els => els.map(el => el.getAttribute('aria-pressed')))
  expect(states.filter(s => s === 'true')).toHaveLength(intermediateCount)
  expect(states.filter(s => s === 'false')).toHaveLength(total - intermediateCount)
})

test('22.3 custom 75-minute court renders "75 min (custom)" in the court list', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '+ Session' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Courts').fill('1')
  await page.getByLabel('Court 1 duration').selectOption('custom')
  await page.getByLabel('Court 1 custom minutes').fill('75')
  await page.getByLabel('Name').fill('Custom Duration Session')
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started', { timeout: 5000 })

  // custom minutes survive into the setup screen select instead of a blank option
  const dur = page.getByLabel('Court 1 duration')
  await expect(dur).toHaveValue('75')
  await expect(dur.locator('option:checked')).toHaveText('75 min (custom)')
  // the select's displayed label (what the row renders) is the custom option,
  // not the blank/placeholder state
  expect(await dur.evaluate(el => el.selectedOptions[0]?.textContent)).toBe('75 min (custom)')
})

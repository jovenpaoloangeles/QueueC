// tests/e2e/02-session-setup.spec.js — the single-screen session setup (no modals)
import { test, expect } from '../fixtures.js'
import { base, liveState, createSession, checkinPlayers, startSession } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await page.reload()
})

test('2.1 setup screen is the landing view: hero, two cards, no dialog, no CTA button', async ({ page }) => {
  await expect(page.getByTestId('session-setup')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Session Setup' })).toBeVisible()
  await expect(page.getByText('1 · Court Configuration')).toBeVisible()
  await expect(page.getByText('2 · Active Waiting Pool')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '+ Start New Session' })).toHaveCount(0)
  await expect(page.getByTestId('btn-new-session')).toHaveCount(0) // nothing to end yet
})

test('2.2 defaults: name, start time (next 15 min), 2 courts, 2 hours each', async ({ page }) => {
  await expect(page.getByLabel('Session name')).toHaveValue(/^Session \d{4}-\d{2}-\d{2}$/)
  const t = await page.getByLabel('Start time').inputValue()
  expect(t).toMatch(/^\d{2}:\d{2}$/)
  expect(Number(t.slice(3)) % 15).toBe(0)
  await expect(page.getByLabel('Number of courts')).toHaveValue('2')
  await expect(page.getByTestId('court-row')).toHaveCount(2)
  await expect(page.getByLabel('Court 1 hours')).toHaveValue('2')
  await expect(page.getByLabel('Court 2 label')).toHaveValue('Court 2')
  await expect(page.getByLabel('Court 1 hours')).toHaveAttribute('step', '0.5')
})

test('2.3 court rows follow the court count and keep edits', async ({ page }) => {
  await page.getByLabel('Court 1 hours').fill('3.5')
  await page.getByLabel('Number of courts').fill('5')
  await expect(page.getByTestId('court-row')).toHaveCount(5)
  await expect(page.getByLabel('Court 1 hours')).toHaveValue('3.5')
  await page.getByLabel('Number of courts').fill('1')
  await expect(page.getByTestId('court-row')).toHaveCount(1)
  await page.getByLabel('Number of courts').fill('99') // capped at 16
  await expect(page.getByTestId('court-row')).toHaveCount(16)
})

test('2.4 Start Session disabled until 2 players are selected', async ({ page }) => {
  const start = page.getByTestId('start-session')
  await expect(start).toBeDisabled()
  await expect(page.getByTestId('selected-count')).toHaveText('0 selected')
  await checkinPlayers(page, ['Inter C1'])
  await expect(start).toBeDisabled()
  await checkinPlayers(page, ['Inter C2'])
  await expect(start).toBeEnabled()
  await expect(page.getByTestId('selected-count')).toHaveText('2 selected')
})

test('2.5 invalid hours disable Start until fixed', async ({ page }) => {
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await page.getByLabel('Court 1 hours').fill('13')
  await expect(page.getByTestId('start-session')).toBeDisabled()
  await page.getByLabel('Court 1 hours').fill('1.5')
  await expect(page.getByTestId('start-session')).toBeEnabled()
})

test('2.6 select-all and tier filter smoke', async ({ page }) => {
  await page.getByTestId('select-all').click()
  const pressed = await page.getByTestId('player-pool').locator('[aria-pressed="true"]').count()
  expect(pressed).toBeGreaterThanOrEqual(8)
  await expect(page.getByTestId('selected-count')).toHaveText(`${pressed} selected`)
  await page.getByTestId('select-all').click()
  await expect(page.getByTestId('selected-count')).toHaveText('0 selected')
  await page.getByLabel('Filter tier').selectOption('expert')
  const expertCount = await page.getByTestId('player-pool').getByRole('button').count()
  expect(expertCount).toBeGreaterThan(0)
  expect(expertCount).toBeLessThan(pressed)
})

test('2.7 registering an existing selected name shows the duplicate error', async ({ page }) => {
  await checkinPlayers(page, ['Inter C1'])
  await page.getByRole('textbox', { name: 'Search or add player' }).fill('Inter C1')
  await expect(page.getByTestId('duplicate-session-error')).toBeVisible()
  await expect(page.getByTestId('register-new-player-prompt')).toHaveCount(0)
})

test('2.8 registering a brand-new player selects it without a session', async ({ page }) => {
  const name = `Newbie ${Date.now().toString(36)}`
  await page.getByRole('textbox', { name: 'Search or add player' }).fill(name)
  await page.getByTestId('register-new-player-prompt').getByRole('button', { name: 'Add Player' }).click()
  await expect(page.getByTestId('player-pool').getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('selected-count')).toHaveText('1 selected')
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  expect(session).toBeNull() // nothing created server-side yet
})

test('2.9 Start creates a live session: N courts, expires_at = hours from start, players checked in', async ({ page }) => {
  await createSession(page, {
    name: 'Setup Spec',
    courts: [{ label: 'Alpha', hours: 1 }, { label: 'Beta', hours: 2.5 }, { label: 'Gamma', hours: 0.5 }],
  })
  await checkinPlayers(page, ['Inter C1', 'Inter C2', 'Inter C3'])
  await startSession(page)
  await expect(page.getByText('Alpha').first()).toBeVisible()
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  expect(session.name).toBe('Setup Spec')
  expect(session.started_at).not.toBeNull()
  expect(session.court_count).toBe(3)
  const sse = await liveState(page)
  expect(sse.courts.map(c => c.label)).toEqual(['Alpha', 'Beta', 'Gamma'])
  expect(sse.courts.map(c => c.expires_at - session.started_at)).toEqual([3600, 9000, 1800])
  expect(sse.queue).toHaveLength(3)
})

test('2.10 header New Session confirms once, then returns to the setup screen', async ({ page }) => {
  await createSession(page)
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await page.getByTestId('btn-new-session').click()
  await expect(page.getByRole('dialog')).toContainText('End current session and start a new one?')
  await page.getByTestId('confirm-new-session').click()
  await expect(page.getByTestId('session-setup')).toBeVisible()
  await expect(page.getByTestId('start-session')).toBeDisabled()
})

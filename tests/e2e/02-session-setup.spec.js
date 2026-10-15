// tests/e2e/02-session-setup.spec.js — the single-screen session setup (no modals)
import { test, expect } from '../fixtures.js'
import { poolRow, base, liveState, createSession, checkinPlayers, startSession } from '../helpers.js'

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
  await expect(page.getByTestId('btn-new-session')).toHaveCount(0) // never rendered anymore
})

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtToday = () => {
  const d = new Date()
  return `ASTIRISK (${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()})`
}

test('2.2 defaults: ASTIRISK name, next full hour start, 2 courts, 2 hours each', async ({ page }) => {
  const nameInput = page.getByLabel('Session name')
  await expect(nameInput).toHaveValue(/^ASTIRISK \(\d{2}-[A-Z][a-z]{2}-\d{4}\)$/)
  // tolerate a midnight rollover between page load and assertion
  expect([fmtToday()]).toContain(await nameInput.inputValue())
  const start = page.getByLabel('Start time')
  const t = await start.inputValue()
  expect(t).toMatch(/^\d{2}:00$/)
  const expected = Math.min(23, Math.max(6, new Date().getHours() + 1))
  expect([expected, Math.min(23, expected + 1)]).toContain(Number(t.slice(0, 2))) // tolerate hour rollover
  await expect(page.getByLabel('Number of courts')).toHaveValue('2')
  await expect(page.getByTestId('court-row')).toHaveCount(2)
  await expect(page.getByLabel('Court 1 hours')).toHaveValue('2')
  await expect(page.getByLabel('Court 2 label')).toHaveValue('Court 2')
  await expect(page.getByLabel('Court 1 hours')).toHaveAttribute('step', '0.5')
})

test('2.2b empty session name falls back to the ASTIRISK default', async ({ page }) => {
  await page.getByLabel('Session name').fill('')
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  expect(session.name).toMatch(/^ASTIRISK \(\d{2}-[A-Z][a-z]{2}-\d{4}\)$/)
})

test('2.2c start time is a select of whole hours 06:00–23:00; no time input', async ({ page }) => {
  const start = page.getByLabel('Start time')
  expect(await start.evaluate(el => el.tagName)).toBe('SELECT')
  await expect(page.locator('input[type="time"]')).toHaveCount(0)
  const opts = await start.locator('option').evaluateAll(os => os.map(o => o.value))
  expect(opts).toHaveLength(18)
  expect(opts[0]).toBe('06:00')
  expect(opts[17]).toBe('23:00')
  expect(opts.every(v => /^\d{2}:00$/.test(v))).toBe(true)
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
  const pressed = await page.locator('[data-testid="player-pool"][aria-checked="true"]').count()
  expect(pressed).toBeGreaterThanOrEqual(8)
  await expect(page.getByTestId('selected-count')).toHaveText(`${pressed} selected`)
  await page.getByTestId('select-all').click()
  await expect(page.getByTestId('selected-count')).toHaveText('0 selected')
  await page.getByLabel('Filter tier').selectOption('expert')
  const expertCount = await page.getByTestId('player-pool').count()
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
  await expect(poolRow(page, name)).toHaveAttribute('aria-checked', 'true')
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

test('2.10 End Session confirms once, then returns to the setup screen', async ({ page }) => {
  await createSession(page)
  await checkinPlayers(page, ['Inter C1', 'Inter C2'])
  await startSession(page)
  await page.getByRole('button', { name: 'End Session' }).click()
  await expect(page.getByTestId('end-session-confirm-dialog')).toBeVisible()
  await page.getByTestId('end-session-confirm').click()
  await expect(page.getByTestId('session-setup')).toBeVisible()
  await expect(page.getByTestId('start-session')).toBeDisabled()
})

// --- Alphabetical pool + inline edit ---

const rowNames = page => page.getByTestId('player-pool').evaluateAll(els => els.map(el => el.getAttribute('aria-label')))
const cmp = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })

test('2.11 pool rows are alphabetical with letter headers; selection never reorders', async ({ page }) => {
  await expect(page.getByTestId('player-pool').first()).toBeVisible()
  const names = await rowNames(page)
  expect(names.length).toBeGreaterThanOrEqual(22)
  expect(names).toEqual([...names].sort(cmp))
  const letters = await page.getByTestId('pool-letter').allTextContents()
  expect(letters.length).toBeGreaterThan(1)
  expect(letters).toEqual([...letters].sort(cmp))
  expect(new Set(letters).size).toBe(letters.length)
  await checkinPlayers(page, ['Upper D1', 'Beginner B1'])
  expect(await rowNames(page)).toEqual(names)
})

test('2.12 single click selects exactly once; dblclick does not change selection', async ({ page }) => {
  const row = poolRow(page, 'Inter C2')
  await row.click()
  await expect(row).toHaveAttribute('aria-checked', 'true')
  await expect(row).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('selected-count')).toHaveText('1 selected')
  const other = poolRow(page, 'Inter C3')
  await other.locator('span.truncate').dblclick()
  await expect(page.getByLabel('Player name')).toBeVisible()
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape')
  await expect(poolRow(page, 'Inter C3')).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByTestId('selected-count')).toHaveText('1 selected')
})

test('2.13 dblclick edit: rename + skill persists, keeps selection', async ({ page }) => {
  const newName = `Zed ${Date.now().toString(36)}`
  await poolRow(page, 'Inter C4').click()
  await expect(poolRow(page, 'Inter C4')).toHaveAttribute('aria-checked', 'true')
  await poolRow(page, 'Inter C4').locator('span.truncate').dblclick()
  await page.getByLabel('Player name').fill(newName)
  await page.getByLabel('Player skill').selectOption('expert')
  await page.keyboard.press('Enter')
  const row = poolRow(page, newName)
  await expect(row).toBeVisible()
  await expect(row).toContainText('Expert')
  await expect(row).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByLabel('Player name')).toHaveCount(0)
  const names = await rowNames(page)
  expect(names).toEqual([...names].sort(cmp))
  await page.reload()
  const row2 = poolRow(page, newName)
  await expect(row2).toContainText('Expert')
  const { players } = await (await page.request.get(`${base()}/api/players`)).json()
  expect(players.find(p => p.name === newName)?.skill_level).toBe('expert')
  expect(players.find(p => p.name === 'Inter C4')).toBeUndefined()
})

test('2.14 duplicate rename shows server error and stays in edit mode; Esc cancels', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit Inter C1' }).click({ force: true })
  await page.getByLabel('Player name').fill('Inter C2')
  await page.getByRole('button', { name: 'Save player' }).click()
  await expect(page.getByTestId('player-edit-error')).toContainText('already exists')
  await expect(page.getByLabel('Player name')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Player name')).toHaveCount(0)
  await expect(poolRow(page, 'Inter C1')).toBeVisible()
  // only one row editable at a time
  await poolRow(page, 'Inter C1').locator('span.truncate').dblclick()
  await poolRow(page, 'Inter C2').locator('span.truncate').dblclick()
  await expect(page.getByLabel('Player name')).toHaveCount(1)
})

test('2.15 Enter on a focused row toggles selection', async ({ page }) => {
  const row = poolRow(page, 'Inter C1')
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(row).toHaveAttribute('aria-checked', 'true')
})

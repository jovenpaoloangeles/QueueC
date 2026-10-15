// tests/e2e/02-create-session-modal.spec.js
import { test, expect } from '../fixtures.js'
import { base } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await page.reload()
  await page.getByRole('button', { name: '+ Start New Session' }).click()
  await page.getByRole('button', { name: 'Continue' }).click() // confirm dialog gate
  await page.waitForSelector('[role="dialog"]')
})

test('2.1 modal opens with fields', async ({ page }) => {
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('Name')).toBeVisible()
})

test('2.2 default session name is "Evening Session"', async ({ page }) => {
  await expect(page.getByLabel('Name')).toHaveValue('Evening Session')
})

test('2.3 start/end times pre-filled', async ({ page }) => {
  const start = page.getByLabel('Start')
  await expect(start).not.toHaveValue('')
})

test('2.4 courts field defaults to 2', async ({ page }) => {
  await expect(page.getByLabel('Courts')).toHaveValue('2')
})

test('2.5 Cancel closes modal without session', async ({ page }) => {
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('text=No active session')).toBeVisible()
})

test('2.6 ESC closes modal', async ({ page }) => {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('2.7 backdrop click closes modal', async ({ page }) => {
  await page.mouse.click(10, 10)
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('2.8 custom name appears in header', async ({ page }) => {
  await page.getByLabel('Name').fill('Friday Badminton')
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await expect(page.locator('text=Friday Badminton')).toBeVisible()
})

test('2.9 court_count respected', async ({ page }) => {
  await page.getByLabel('Courts').fill('3')
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  // Court label spans in SetupScreen have class min-w-[64px]
  const courts = page.locator('span.font-medium', { hasText: /^Court \d+$/ })
  await expect(courts).toHaveCount(3)
})

test('2.10 modal closes automatically via SSE', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Session' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
})

test('2.11 confirm dialog cancel closes without opening form', async ({ page }) => {
  await page.reload() // back to landing — beforeEach already passed the confirm gate
  await page.getByRole('button', { name: '+ Start New Session' }).click()
  await page.getByRole('button', { name: 'Cancel' }).first().click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByLabel('Name')).toHaveCount(0)
})

test('2.12 confirm dialog shows replace warning when a session is active', async ({ page }) => {
  // beforeEach ended the session and opened the form — create one, then
  // reopen the confirm gate with a live session to hit the warning path
  await page.getByRole('button', { name: 'Create Session' }).click()
  await page.waitForSelector('text=Not started')
  await page.getByRole('button', { name: '+ Session' }).click()
  await expect(page.getByText('The current session will be replaced in the header.')).toBeVisible()
})

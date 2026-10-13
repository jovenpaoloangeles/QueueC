export const BASE = 'http://localhost:3001'

const DEFAULT_PLAYERS = [
  'Inter C1', 'Inter C2', 'Inter C3', 'Inter C4',
  'Advanced E1', 'Advanced E2', 'Upper D1', 'Upper D2',
]

export async function createSession(page, { name = 'Test Session', courts = 2 } = {}) {
  await page.goto('/')
  await page.getByRole('button', { name: '+ Session' }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Courts').fill(String(courts))
  await page.getByRole('button', { name: 'Create Session' }).click()
  // Modal closes reactively via SSE
  await page.waitForSelector('text=Not started', { timeout: 5000 })
}

export async function checkinPlayers(page, names = DEFAULT_PLAYERS) {
  for (const name of names) {
    await page.getByRole('button', { name, exact: false }).first().click()
    await page.waitForTimeout(200) // allow SSE to propagate
  }
}

export async function startSession(page) {
  await page.getByRole('button', { name: 'Start Session' }).click()
  await page.waitForSelector('[data-testid="courts-row"], text=Queue', { timeout: 5000 })
}

export async function fullSetup(page, { courts = 2, playerNames = DEFAULT_PLAYERS } = {}) {
  await createSession(page, { courts })
  await checkinPlayers(page, playerNames)
  await startSession(page)
}

export async function endMatch(page, courtLabel, { team1 = 21, team2 = 15 } = {}) {
  const courtCard = page.locator(`text=${courtLabel}`).locator('../..')
  await courtCard.getByRole('button', { name: 'End Match' }).click()
  await page.getByLabel('Team 1').fill(String(team1))
  await page.getByLabel('Team 2').fill(String(team2))
  await page.getByRole('button', { name: 'Confirm' }).click()
  await page.waitForTimeout(300)
}

export async function getQueueNames(page) {
  return page.locator('[data-entry-id]').evaluateAll(els =>
    els.map(el => el.querySelector('.text-base.font-medium')?.textContent?.trim()).filter(Boolean)
  )
}

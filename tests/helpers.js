import { expect } from '@playwright/test'
export const base = () => process.env.QC_BASE

const DEFAULT_PLAYERS = [
  'Inter C1', 'Inter C2', 'Inter C3', 'Inter C4',
  'Expert E1', 'Expert E2', 'Upper D1', 'Upper D2',
]

/** Fill the single-screen setup (no server state yet). `courts` = count or
 *  [{label, hours}] rows; `hours` applies to every court when courts is a count;
 *  `startTime` = 'HH:00' (whole hours 06:00–23:00) (left at the screen's default when omitted). */
export async function createSession(page, { name = 'Test Session', courts = 2, hours, startTime } = {}) {
  await page.goto('/')
  await page.getByLabel('Session name').fill(name)
  const rows = Array.isArray(courts) ? courts : null
  await page.getByLabel('Number of courts').fill(String(rows ? rows.length : courts))
  if (startTime) await page.getByLabel('Start time').selectOption(startTime)
  if (rows) {
    for (const [i, r] of rows.entries()) {
      if (r.label != null) await page.getByLabel(`Court ${i + 1} label`).fill(r.label)
      if (r.hours != null) await page.getByLabel(`Court ${i + 1} hours`).fill(String(r.hours))
    }
  } else if (hours != null) {
    for (let i = 0; i < courts; i++) await page.getByLabel(`Court ${i + 1} hours`).fill(String(hours))
  }
}

export async function checkinPlayers(page, names = DEFAULT_PLAYERS) {
  // Setup screen: clicking a pool row toggles it into the selection (the click
  // is debounced ~220ms to tell it from a dblclick); check-in happens on Start.
  for (const name of names) {
    const row = page.getByTestId('player-pool').filter({ has: page.getByText(name, { exact: true }) }).first()
    // center the row — minimal scroll leaves lower rows under the sticky letter header
    await row.evaluate(el => el.scrollIntoView({ block: 'center' }))
    await row.click()
    await expect(row).toHaveAttribute('aria-checked', 'true')
  }
}

export async function startSession(page) {
  await page.getByRole('button', { name: 'Start Session' }).click()
  // setup screen unmounts once the live session arrives via SSE
  await page.getByTestId('session-setup').waitFor({ state: 'detached', timeout: 8000 })
}

export async function fullSetup(page, { courts = 2, playerNames = DEFAULT_PLAYERS } = {}) {
  await createSession(page, { courts })
  await checkinPlayers(page, playerNames)
  await startSession(page)
  // selection is always manual now — no mode toggle to switch
}

export async function endMatch(page, courtLabel, { team1 = 21, team2 = 15 } = {}) {
  // Use 'End Match' button directly (avoids strict-mode issues with partial court label matches)
  await page.getByRole('button', { name: 'End Match' }).first().click()
  // two-step flow: the confirm gate appears first, then the finalization form
  const confirmEnd = page.getByTestId('confirm-end-end')
  if (await confirmEnd.isVisible().catch(() => false)) await confirmEnd.click()
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

/** Synthetic HTML5 drag between two elements (CSS selectors).
 *  Playwright's dragTo does NOT fire React's HTML5 drag handlers; native
 *  DragEvents dispatched on the elements do. dataTransfer must be attached
 *  via defineProperty — the DragEvent constructor silently drops it.
 *  toIndex: -1 = last matching element (default). */
export async function syntheticDrag(page, fromSel, toSel, { fromIndex = 0, toIndex = -1 } = {}) {
  await page.evaluate(({ fromSel, toSel, fromIndex, toIndex }) => {
    const all = document.querySelectorAll(fromSel)
    const from = all[fromIndex < 0 ? all.length + fromIndex : fromIndex]
    const toAll = document.querySelectorAll(toSel)
    const to = toAll[toIndex < 0 ? toAll.length + toIndex : toIndex]
    const mk = type => {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'dataTransfer', { value: new DataTransfer() })
      return ev
    }
    from.dispatchEvent(mk('dragstart'))
    to.dispatchEvent(mk('dragover'))
    to.dispatchEvent(mk('drop'))
    from.dispatchEvent(mk('dragend'))
  }, { fromSel, toSel, fromIndex, toIndex })
}

/** Confirm the "Start match(es)?" dialog if one opened (every start now asks first). */
export async function confirmStart(page) {
  const yes = page.getByTestId('start-confirm-yes')
  await yes.waitFor({ state: 'visible', timeout: 3000 })
  await yes.click()
  await page.getByTestId('start-confirm-dialog').waitFor({ state: 'detached', timeout: 5000 })
}

/** Click the first Start Match button and confirm the dialog. */
export async function clickStartMatch(page) {
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await confirmStart(page)
}

/** Click-select the first n queue cards, then Start Match (court 1). */
export async function startDoubles(page) {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await clickStartMatch(page)
  await page.waitForTimeout(500)
}

/** One snapshot of the SSE state payload ({session, queue, courts, ...}). */
export function liveState(page) {
  return page.evaluate(() => new Promise(res => {
    const es = new EventSource('/api/sse')
    es.addEventListener('state', e => { es.close(); res(JSON.parse(e.data)) })
  }))
}

/** Pool row (setup screen) by exact player name. */
export function poolRow(page, name) {
  return page.getByTestId('player-pool').filter({ has: page.getByText(name, { exact: true }) }).first()
}

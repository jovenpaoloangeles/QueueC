export const BASE = 'http://localhost:3003'

const DEFAULT_PLAYERS = [
  'Inter C1', 'Inter C2', 'Inter C3', 'Inter C4',
  'Expert E1', 'Expert E2', 'Upper D1', 'Upper D2',
]

export async function createSession(page, { name = 'Test Session', courts = 2 } = {}) {
  await page.goto('/')
  await page.getByRole('button', { name: '+ Session' }).click()
  await page.getByRole('button', { name: 'Continue' }).click() // confirm dialog gate
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Courts').fill(String(courts))
  await page.getByRole('button', { name: 'Create Session' }).click()
  // Modal closes reactively via SSE
  await page.waitForSelector('text=Not started', { timeout: 5000 })
}

export async function checkinPlayers(page, names = DEFAULT_PLAYERS) {
  // Setup screen uses multi-select: clicking a chip toggles it, then the
  // batch "Check In (N)" button commits them all.
  for (const name of names) {
    const btn = page.getByRole('button', { name, exact: false }).first()
    // center the button — minimal scroll leaves lower rows under the sticky header
    await btn.evaluate(el => el.scrollIntoView({ block: 'center' }))
    await btn.click()
  }
  if (names.length) {
    await page.getByRole('button', { name: /^Check In/ }).click()
    await page.waitForTimeout(500) // batch check-ins + SSE to propagate
  }
}

export async function startSession(page) {
  await page.getByRole('button', { name: 'Finish Setup' }).click()
  await page.waitForSelector('text=Queue', { timeout: 5000 })
}

export async function fullSetup(page, { courts = 2, playerNames = DEFAULT_PLAYERS } = {}) {
  await createSession(page, { courts })
  await checkinPlayers(page, playerNames)
  await startSession(page)
  // Switch to Manual mode so tests can do deterministic player selection
  // (Smart mode pre-selects players, which confuses click-to-select tests)
  // Switch to Manual so tests get deterministic click-to-select behavior
  await page.getByRole('button', { name: 'Manual' }).click()
  // Wait for Smart mode indicator to disappear (confirms mode switched)
  await page.waitForTimeout(300)
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

/** Click-select the first n queue cards, then Start Match (court 1). */
export async function startDoubles(page) {
  for (let i = 0; i < 4; i++) await page.locator('[data-entry-id]').nth(i).click()
  await page.getByRole('button', { name: 'Start Match' }).first().click()
  await page.waitForTimeout(500)
}

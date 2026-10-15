// tests/e2e/25-court-expiry.spec.js
import { test, expect } from '../fixtures.js'
import { base, fullSetup, startDoubles } from '../helpers.js'

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  await fullSetup(page, { courts: 1 })
})

async function expireCourt(page, secsAgo = 10) {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json()
  const { courts } = await (await page.request.get(`${base()}/api/sessions/${session.id}/courts`)).json()
  await page.request.fetch(`${base()}/api/courts/${courts[0].id}`, {
    method: 'PATCH', data: { expires_at: Math.floor(Date.now() / 1000) - secsAgo },
  })
}

test('25.1 expired idle court shows Extend Court (+1hr)? and extending restores timer', async ({ page }) => {
  await expireCourt(page)
  const btn = page.getByTestId('btn-extend-court')
  await expect(btn).toHaveText('Extend Court (+1hr)?')
  await btn.click()
  await expect(btn).toHaveCount(0)
  await expect(page.getByTestId('expired-badge')).toHaveCount(0)
  await expect(page.getByTestId('court-countdown')).not.toHaveText(/00:00/)
})

test('25.2 mid-match expiry: Last Game + extend, match never interrupted', async ({ page }) => {
  await startDoubles(page)
  await expireCourt(page)
  await expect(page.getByTestId('expiring-last-game-badge')).toBeVisible()
  await expect(page.getByTestId('btn-extend-court')).toBeVisible()
  await expect(page.getByRole('button', { name: 'End Match' })).toBeVisible()
  await page.getByTestId('btn-extend-court').click()
  await expect(page.getByTestId('expiring-last-game-badge')).toHaveCount(0)
  await expect(page.getByTestId('btn-extend-court')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'End Match' })).toBeVisible()
})

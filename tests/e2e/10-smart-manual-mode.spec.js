// tests/e2e/10-smart-manual-mode.spec.js — the queue is always manual:
// no mode toggle in the queue header, selection only via clicks.
import { expect, test } from "../fixtures.js";
import { base, fullSetup, liveState } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
  await fullSetup(page); // 8 waiting players
});

test("10.1 queue rows are click-to-select — 4 clicks show 4 selected → Doubles", async ({ page }) => {
  // no auto-population: the queue starts with nobody selected
  await expect(page.locator("text=selected →")).toHaveCount(0);
  for (let i = 0; i < 4; i++) await page.locator("[data-entry-id]").nth(i).click();
  await expect(page.locator("text=4 selected → Doubles")).toBeVisible();
  // every clicked row carries the selected badge
  await expect(page.locator('[class*="ring-2"][class*="ring-primary"]')).toHaveCount(4);
});

test("10.2 selection persists across SSE ticks", async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator("[data-entry-id]").nth(i).click();
  await expect(page.locator("text=4 selected → Doubles")).toBeVisible();
  // ≥2 SSE broadcasts — the selection must survive both
  await expect(page.locator("text=4 selected → Doubles")).toBeVisible();
  await expect(page.locator('[class*="ring-2"][class*="ring-primary"]')).toHaveCount(4);
  expect((await liveState(page)).activeMatches).toHaveLength(0); // nothing auto-started either
});

test("10.3 starting with a subset clears the selection when confirmed", async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator("[data-entry-id]").nth(i).click();
  await expect(page.locator("text=4 selected → Doubles")).toBeVisible();
  await page.getByRole("button", { name: "Start Match" }).first().click();
  // the "stale lineup" confirm path leaves a start behind — confirm it
  const yes = page.getByTestId("start-confirm-yes");
  await yes.waitFor({ state: "visible", timeout: 3000 });
  await yes.click();
  await expect(page.getByTestId("court-winner-1")).toHaveCount(1);
  // selection consumed by the start
  await expect(page.locator("text=selected →")).toHaveCount(0);
  await expect(page.locator('[class*="ring-2"][class*="ring-primary"]')).toHaveCount(0);
});

test("10.4 no Manual/Smart mode buttons exist in the queue header", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Manual" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "● Smart" })).toHaveCount(0);
  // the queue header keeps only + Check In
  await expect(page.getByTestId("checkin-toggle")).toHaveCount(1);
});

test("10.5 header Smart Match pours each free court's lineup for review — nothing starts until Start", async ({
  page,
}) => {
  await page.getByTestId("btn-smart-match").click();
  await expect(page.getByTestId("start-confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("toast")).toContainText("2 lineups ready on court");
  await expect(page.getByTestId("btn-start-match")).toHaveCount(2);
  for (const b of await page.getByTestId("btn-start-match").all()) await expect(b).toBeEnabled();
  const st = await liveState(page);
  expect(st.activeMatches).toHaveLength(0); // review first
  expect(st.slatedMatches).toHaveLength(0); // 8 players — nobody left for On Deck
  await expect(page.locator("[data-entry-id]")).toHaveCount(0); // all 8 sit in court slots
  // one tap per court starts it — the card is the review, no confirm dialog
  await page.getByTestId("btn-start-match").first().click();
  await expect(page.getByTestId("start-confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("court-winner-1")).toHaveCount(1);
});

import { expect, test } from "../fixtures.js";
import { base, fullSetup, seedLiveMatch } from "../helpers.js";

// v1.5 UX: UI re-render only — the server rules are in server/routes/v15-guards.test.js
test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

test("49.1 header actions stay on screen at tablet width", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await fullSetup(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  await expect(page.getByRole("button", { name: "End Session" })).toBeInViewport();
});

test("49.2 end-session dialog warns about a game still on court", async ({ page }) => {
  await fullSetup(page);
  await seedLiveMatch(page);
  await page.getByRole("button", { name: "End Session" }).click();
  await expect(page.getByTestId("end-session-unfinished")).toContainText("1 game still on court");
});

test("49.3 end-match form refuses a tie", async ({ page }) => {
  await fullSetup(page);
  await seedLiveMatch(page);
  await page.getByRole("button", { name: "End Match" }).first().click();
  const confirmEnd = page.getByTestId("confirm-end-end");
  if (await confirmEnd.isVisible().catch(() => false)) await confirmEnd.click();
  await page.getByLabel("Team 1").fill("21");
  await page.getByLabel("Team 2").fill("21");
  await expect(page.getByTestId("end-match-score-issue")).toHaveText("Scores can't be tied");
  await expect(page.getByRole("button", { name: "Confirm" })).toBeDisabled();
});

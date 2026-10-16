// tests/e2e/13-stats-sidebar.spec.js
import { expect, test } from "../fixtures.js";
import { base, clickStartMatch, endMatch, fullSetup, startDoubles } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
  await fullSetup(page);
});

test("13.1 player count tile matches check-in count", async ({ page }) => {
  await expect(page.locator("text=Players").locator("..").locator('[class*="font-mono"]')).toHaveText("8");
});

test("13.2 match count starts at 0", async ({ page }) => {
  await expect(page.locator("text=Matches").locator("..").locator('[class*="font-mono"]')).toHaveText("0");
});

test("13.3 match count increments after end", async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.locator("[data-entry-id]").nth(i).click();
  await clickStartMatch(page);
  await page.waitForTimeout(600);
  await endMatch(page, "Court");
  await expect(page.locator("text=Matches").locator("..").locator('[class*="font-mono"]')).toHaveText("1");
});

test("13.9 sidebar has no Add Player button", async ({ page }) => {
  await expect(page.getByRole("complementary").getByRole("button", { name: /add player/i })).toHaveCount(0);
});

test("13.4 avg wait tile shows mm:ss before any match ends", async ({ page }) => {
  const tile = page
    .getByRole("complementary")
    .locator("text=Avg Wait")
    .locator("..")
    .locator('[class*="font-mono"]');
  await expect(tile).toHaveText(/^\d{2}:\d{2}$/);
});

test("13.5 avg wait shows a time string after first match ends", async ({ page }) => {
  await startDoubles(page);
  await endMatch(page, "Court");
  const tile = page
    .getByRole("complementary")
    .locator("text=Avg Wait")
    .locator("..")
    .locator('[class*="font-mono"]');
  await expect(tile).toHaveText(/^\d{2}:\d{2}$/);
});

test("13.6 leaderboard empty before any match ends", async ({ page }) => {
  await expect(page.getByTestId("leaderboard-row")).toHaveCount(0);
});

test("13.7 winner of first match appears in leaderboard with 1 win", async ({ page }) => {
  await startDoubles(page);
  await endMatch(page, "Court", { team1: 21, team2: 15 });
  await expect(page.getByTestId("leaderboard-table")).toBeVisible();
  await expect(page.locator("text=1W")).toHaveCount(2); // both winning players
});

test("13.8 player with most wins ranks first", async ({ page }) => {
  // match 1: C1+C2 beat E1+E2
  await startDoubles(page);
  await endMatch(page, "Court", { team1: 21, team2: 15 });
  // match 2: C1+C2 again (returned players at end of queue) beat D1+D2
  for (const n of ["Inter C1", "Inter C2", "Upper D1", "Upper D2"]) {
    await page.locator("[data-entry-id]").filter({ hasText: n }).click();
  }
  await clickStartMatch(page);
  await page.waitForTimeout(500);
  await endMatch(page, "Court", { team1: 21, team2: 15 });
  // double winners (2W) rank first — exact text so parent rows don't also match
  await expect(page.getByRole("complementary").getByText("2W", { exact: true })).toHaveCount(2);
  const first = await page.getByTestId("leaderboard-name").first().innerText();
  expect(first).toMatch(/Inter C[12]/);
});

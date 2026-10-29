// tests/e2e/08-match-end.spec.js

import { execSync } from "node:child_process";
import { expect, test } from "../fixtures.js";
import { base, clickStartMatch, endMatch, expectMatchLive, fullSetup } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
  await fullSetup(page);
  // Start a doubles match on court 1
  for (let i = 0; i < 4; i++) await page.locator("[data-entry-id]").nth(i).click();
  await clickStartMatch(page);
  await expectMatchLive(page);
});

test("8.1 End Match button opens modal", async ({ page }) => {
  await page.getByRole("button", { name: "End Match" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("8.2 modal title shows court label", async ({ page }) => {
  await page.getByRole("button", { name: "End Match" }).first().click();
  await page.getByTestId("confirm-end-end").click(); // pass the confirm gate
  await expect(page.getByRole("dialog").locator("text=Court")).toBeVisible();
});

test("8.3 score inputs start empty", async ({ page }) => {
  await page.getByRole("button", { name: "End Match" }).first().click();
  await page.getByTestId("confirm-end-end").click(); // pass the confirm gate
  await expect(page.getByLabel("Team 1")).toHaveValue("");
  await expect(page.getByLabel("Team 2")).toHaveValue("");
});

test("8.4 score inputs accept 0–99", async ({ page }) => {
  await page.getByRole("button", { name: "End Match" }).first().click();
  await page.getByTestId("confirm-end-end").click(); // pass the confirm gate
  await page.getByLabel("Team 1").fill("21");
  await expect(page.getByLabel("Team 1")).toHaveValue("21");
});

test("8.5 confirm returns players to queue", async ({ page }) => {
  await endMatch(page, "Court 1");
  await expect(page.locator("[data-entry-id]")).toHaveCount(8);
});

test("8.7 court returns to idle state", async ({ page }) => {
  await endMatch(page, "Court 1");
  await expect(page.locator("text=Select 2 or 4 players").first()).toBeVisible();
});

test("8.10 cancel keeps match running", async ({ page }) => {
  await page.getByRole("button", { name: "End Match" }).first().click();
  await expect(page.getByTestId("confirm-end-end")).toBeVisible(); // confirm gate opened
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible(); // gate dismissed (unmounts)
  await expect(page.getByRole("button", { name: "End Match" })).toBeVisible(); // match still live
});

test("8.11 blank scores can't be submitted (v1.5: scores required)", async ({ page }) => {
  await page.getByRole("button", { name: "End Match" }).first().click();
  await page.getByTestId("confirm-end-end").click(); // pass the confirm gate
  await expect(page.getByTestId("end-match-score-issue")).toHaveText("Enter both scores");
  await expect(page.getByRole("button", { name: "Confirm" })).toBeDisabled();
});

// live-card sides are per-player chips: name + tier badge lines
const sideNames = async (page, side) =>
  (await page.locator(`[data-team-side="${side}"]`).innerText())
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !/^(new|beg|lower int|upper int|int|expert)$/i.test(s));

test("8.6 returned players visible in queue grid", async ({ page }) => {
  const t1 = await sideNames(page, 1);
  const t2 = await sideNames(page, 2);
  await endMatch(page, "Court");
  for (const name of [...t1, ...t2]) {
    await expect(page.locator("[data-entry-id]").filter({ hasText: name.trim() })).toBeVisible();
  }
});

test("8.8 match count stat tile increments", async ({ page }) => {
  await endMatch(page, "Court");
  await expect(page.locator("text=Matches").locator("..").locator('[class*="font-mono"]')).toHaveText("1");
});

test("8.9 total_seconds_played reflected as X min played", async ({ page, server }) => {
  // backdate the match start so the ended duration is ~10 min; server computes
  // duration = end - started_at from the DB, and WAL makes the CLI write visible
  execSync(
    `sqlite3 ${server.dbPath} "UPDATE matches SET started_at = started_at - 600 WHERE ended_at IS NULL"`,
  );
  const names = await sideNames(page, 1);
  await endMatch(page, "Court");
  const card = page.locator("[data-entry-id]").filter({ hasText: names[0].trim() });
  await expect(card).toContainText("10m played");
});

test("8.12 team 1 win — winning players gain leaderboard wins", async ({ page }) => {
  await endMatch(page, "Court", { team1: 21, team2: 15 });
  await expect(page.locator("text=1W")).toHaveCount(2); // both winners show 1W
});

test("8.13 tie score is refused — the match stays live (v1.5: no draws)", async ({ page }) => {
  await page.getByRole("button", { name: "End Match" }).first().click();
  await page.getByTestId("confirm-end-end").click();
  await page.getByLabel("Team 1").fill("15");
  await page.getByLabel("Team 2").fill("15");
  await expect(page.getByRole("button", { name: "Confirm" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "End Match" })).toBeVisible();
});

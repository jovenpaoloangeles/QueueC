import { expect, test } from "../fixtures.js";
import { base, endMatch, fullSetup, startDoubles } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

test("44.1 session detail shows leaderboard, games log and attendance", async ({ page }) => {
  await fullSetup(page);
  await startDoubles(page);
  await endMatch(page, "Court", { team1: 21, team2: 15 });
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  const sid = session.id;
  await page.request.fetch(`${base()}/api/sessions/${sid}/end`, { method: "PATCH" });

  await page.goto(`/#/history/${sid}`);
  // leaderboard: the winning pair (team 1: Inter C1 + C2) at 1/0
  const rows = page.getByTestId("detail-lb-row");
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: "Inter C1" })).toContainText("1/0");
  await expect(rows.filter({ hasText: "Inter C2" })).toContainText("1/0");
  await expect(rows.filter({ hasText: "Inter C3" })).toContainText("0/1");
  // games log: one row with the final score
  const game = page.getByTestId("detail-game-row");
  await expect(game).toHaveCount(1);
  await expect(game).toContainText("21");
  await expect(game).toContainText("15");
  // attendance: every checked-in player listed
  const att = page.getByTestId("detail-attendance-row");
  await expect(att).toHaveCount(8);
  await expect(att.filter({ hasText: "Inter C1" })).toContainText("Inter C1");
});

import { expect, test } from "../fixtures.js";
import { base, endMatch, fullSetup, startDoubles } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

async function seededEndedSession(page) {
  await fullSetup(page);
  await startDoubles(page);
  await endMatch(page, "Court", { team1: 21, team2: 15 });
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  const sid = session.id;
  await page.request.fetch(`${base()}/api/sessions/${sid}/end`, { method: "PATCH" });
  await page.goto(`/#/history/${sid}`);
  await expect(page.getByTestId("detail-game-row")).toHaveCount(1);
  return sid;
}

test("45.1 score correction flips the rendered leaderboard", async ({ page }) => {
  await seededEndedSession(page);

  await page.getByTestId("detail-edit-match").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel(/^Team 1 ·/).fill("15");
  await page.getByLabel(/^Team 2 ·/).fill("21");
  await page.getByTestId("correct-match-confirm").click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // leaderboard re-renders flipped: team 2's Inter C3/C4 now lead at 1/0
  const rows = page.getByTestId("detail-lb-row");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Inter C3");
  await expect(rows.nth(0)).toContainText("1/0");
  await expect(rows.filter({ hasText: "Inter C1" })).toContainText("0/1");
});

test("45.2 removing a match-history entry surfaces the 409 message", async ({ page }) => {
  await seededEndedSession(page);

  const row = page.getByTestId("detail-attendance-row").filter({ hasText: "Inter C1" });
  await row.getByTestId("attendance-remove").click();
  await page.getByTestId("attendance-remove-confirm").click();
  await expect(page.getByRole("status")).toContainText("match history");
});

test("45.3 add a missed player to attendance", async ({ page }) => {
  await fullSetup(page);
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  const sid = session.id;
  await page.request.fetch(`${base()}/api/sessions/${sid}/end`, { method: "PATCH" });
  await page.goto(`/#/history/${sid}`);

  await page.getByTestId("attendance-add-select").selectOption({ label: "Upper D3" });
  await page.getByTestId("attendance-add-button").click();
  await expect(page.getByTestId("detail-attendance-row").filter({ hasText: "Upper D3" })).toHaveCount(1);
});

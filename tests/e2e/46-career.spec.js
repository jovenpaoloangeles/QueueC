import { expect, test } from "../fixtures.js";
import { base, fullSetup, seedLiveMatch } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

// one played match per session: C1&C2 together (won in A, lost in B)
async function endedWithMatch(page, names, team1Wins) {
  await fullSetup(page, { playerNames: names });
  const slate = await seedLiveMatch(page);
  await page.request.fetch(`${base()}/api/matches/${slate.id}/end`, {
    method: "PATCH",
    data: { team1_score: team1Wins ? 21 : 15, team2_score: team1Wins ? 15 : 21 },
  });
  await page.request.fetch(`${base()}/api/sessions/${slate.session_id}/end`, { method: "PATCH" });
}

test("46.1 career page shows totals, partner and monthly attendance", async ({ page }) => {
  await endedWithMatch(page, ["Inter C1", "Inter C2", "Inter C3", "Inter C4"], true);
  await endedWithMatch(page, ["Inter C1", "Inter C2", "Expert E1", "Expert E2"], false);

  // from a session detail, the player's name links to their career
  await page.goto("/#/history");
  await page.getByTestId("history-row").first().click();
  await expect(page.getByTestId("detail-lb-row")).toHaveCount(4);
  await page.getByTestId("detail-lb-row").filter({ hasText: "Inter C1" }).getByRole("link").click();
  await expect(page).toHaveURL(/#\/players\/\d+/);

  // totals: 2 games, 1 win, 1 loss
  const totals = page.getByTestId("career-totals");
  await expect(totals).toContainText("2");
  await expect(totals).toContainText("50%");
  // partner: Inter C2, 2 games together, 1/1
  const partner = page.getByTestId("career-partner-row").filter({ hasText: "Inter C2" });
  await expect(partner).toHaveCount(1);
  await expect(partner).toContainText("2");
  await expect(partner).toContainText("1/1");
  // months: both ended sessions attended this month → 100%
  const month = page.getByTestId("career-month-row");
  await expect(month).toHaveCount(1);
  await expect(month).toContainText("100%");
});

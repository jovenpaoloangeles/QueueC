import { expect, test } from "../fixtures.js";
import { base, fullSetup, seedLiveMatch } from "../helpers.js";

// v1.4 UI re-render only — the numbers are asserted at API level in
// server/routes/stats-v14.test.js.
test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

async function playOne(page) {
  const slate = await seedLiveMatch(page);
  await page.request.fetch(`${base()}/api/matches/${slate.id}/end`, {
    method: "PATCH",
    data: { team1_score: 21, team2_score: 15 },
  });
  return slate.session_id;
}

test("48.1 leaderboard window toggle switches to all-time", async ({ page }) => {
  await fullSetup(page);
  await playOne(page);
  const side = page.getByRole("complementary");
  await expect(side.getByTestId("leaderboard-row")).toHaveCount(4);
  await side.getByTestId("leaderboard-window-all").click();
  await expect(side.getByTestId("leaderboard-window-all")).toHaveAttribute("aria-pressed", "true");
  // all-time covers every earlier spec's games too: at least this session's four
  await expect.poll(() => side.getByTestId("leaderboard-row").count()).toBeGreaterThanOrEqual(4);
});

test("48.2 session detail shows fairness and a copyable recap; career shows head-to-head", async ({
  page,
}) => {
  await fullSetup(page);
  const sid = await playOne(page);
  await page.request.fetch(`${base()}/api/sessions/${sid}/end`, { method: "PATCH" });

  await page.goto(`/#/history/${sid}`);
  await expect(page.getByTestId("detail-fairness")).toContainText("Median games");
  await page.getByTestId("share-recap").click();
  await expect(page.getByTestId("recap-text")).toHaveValue(/🏆 Top: /);

  await page.keyboard.press("Escape");
  await page.getByTestId("detail-lb-row").first().getByRole("link").click();
  await expect(page.getByTestId("career-opponent-row")).toHaveCount(2);
});

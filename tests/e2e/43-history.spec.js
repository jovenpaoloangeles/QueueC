import { expect, test } from "../fixtures.js";
import { base, fullSetup, seedLiveMatch } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

async function endedSession(page, name = "Test Session") {
  await fullSetup(page);
  const slate = await seedLiveMatch(page);
  await page.request.fetch(`${base()}/api/matches/${slate.id}/end`, {
    method: "PATCH",
    data: { team1_score: 21, team2_score: 15 },
  });
  await page.request.fetch(`${base()}/api/sessions/${slate.session_id}/end`, { method: "PATCH" });
  return slate.session_id;
}

test("43.1 ended session appears in the history list with aggregates", async ({ page }) => {
  await endedSession(page);
  await page.goto("/#/history");
  const row = page.getByTestId("history-row").filter({ hasText: "Test Session" }).first();
  await expect(row).toBeVisible();
  // date is rendered in the row (today)
  await expect(row).toContainText(new Date().toLocaleDateString([], { month: "short", day: "numeric" }));
  // aggregates: 8 players (fullSetup default), 1 match, 1 shuttle
  await expect(row).toContainText("8 players");
  await expect(row).toContainText("1 matches");
});

test("43.2 #/history renders the history list, / still renders the live view", async ({ page }) => {
  await endedSession(page);
  await page.goto("/#/history");
  await expect(page.getByTestId("history-list")).toBeVisible();
  await expect(page.getByTestId("session-setup")).toHaveCount(0);
  await page.goto("/");
  // no active session after the end → setup screen, not a frozen live view
  await expect(page.getByTestId("session-setup")).toBeVisible();
  await expect(page.getByTestId("history-list")).toHaveCount(0);
  // the History nav link survives the end — it's the only way back in
  await expect(page.getByTestId("nav-history")).toBeVisible();
});

test("43.3 History link in the header navigates to the list", async ({ page }) => {
  await fullSetup(page);
  await expect(page.getByTestId("nav-history")).toBeVisible();
  await page.getByTestId("nav-history").click();
  await expect(page).toHaveURL(/#\/history/);
  await expect(page.getByTestId("history-list")).toBeVisible();
});

// 39 — named teams: every surface that references a team shows its players
import { expect, test } from "../fixtures.js";
import { base, endMatch, fullSetup, liveState, seedLiveMatch } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
  await fullSetup(page);
});

async function teamNames(page) {
  const st = await liveState(page);
  const m = st.activeMatches[0];
  const nameOf = (id) => st.queue.find((e) => e.id === id)?.name;
  const join = (ids) => ids.filter(Boolean).map(nameOf).join(" & ");
  return { team1: join([m.team1_p1, m.team1_p2]), team2: join([m.team2_p1, m.team2_p2]) };
}

test("39.1 confirm gate and score modal show the team names", async ({ page }) => {
  await seedLiveMatch(page);
  const { team1, team2 } = await teamNames(page);
  await page.getByRole("button", { name: "End Match" }).first().click();
  const line = page.getByTestId("confirm-end-teams");
  await expect(line).toBeVisible();
  await expect(line).toContainText(team1);
  await expect(line).toContainText(team2);
  await page.getByTestId("confirm-end-end").click();
  await expect(page.getByText(`Team 1 · ${team1}`)).toBeVisible();
  await expect(page.getByText(`Team 2 · ${team2}`)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("39.2 endMatch helper unchanged — label contract holds", async ({ page }) => {
  await seedLiveMatch(page);
  await endMatch(page, null, { team1: 21, team2: 15 });
  const st = await liveState(page);
  expect(st.activeMatches).toHaveLength(0);
});

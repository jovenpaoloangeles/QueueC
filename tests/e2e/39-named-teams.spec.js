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

test("39.1 the winner buttons and the score form show the team names", async ({ page }) => {
  await seedLiveMatch(page);
  const { team1, team2 } = await teamNames(page);
  await expect(page.getByTestId("court-winner-1")).toHaveText(team1);
  await expect(page.getByTestId("court-winner-2")).toHaveText(team2);
  await page.getByTestId("court-winner-1").first().click();
  const modal = page.getByRole("dialog").last();
  await expect(modal).toBeVisible();
  const modalText = (await modal.innerText()).toLowerCase();
  expect(modalText).toContain(team1.toLowerCase()); // labels show the names only…
  expect(modalText).toContain(team2.toLowerCase());
  expect(modalText).not.toContain("team 1 ·"); // …never the "Team N ·" prefix
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("39.4 tapping the winning team presets that side to 31", async ({ page }) => {
  await seedLiveMatch(page);
  await page.getByTestId("court-winner-1").first().click();
  await expect(page.getByLabel("Team 1 score")).toHaveValue("31"); // winner autocompleted
  await expect(page.getByLabel("Team 2 score")).toHaveValue(""); // loser still empty
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("39.2 endMatch helper unchanged — label contract holds", async ({ page }) => {
  await seedLiveMatch(page);
  await endMatch(page, null, { team1: 21, team2: 15 });
  const st = await liveState(page);
  expect(st.activeMatches).toHaveLength(0);
});

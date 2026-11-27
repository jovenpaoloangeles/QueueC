// 54 — "Hide skill" privacy switch: every skill surface goes (queue, courts,
// On Deck, setup pool + tier pickers, career rating), it sticks per device
// across reloads and pages, other devices are unaffected, matching isn't.
import { expect, test } from "../fixtures.js";
import { base, fullSetup, liveState, seedLiveMatch, seedSlate } from "../helpers.js";

const TWELVE = [
  "Inter C1",
  "Inter C2",
  "Inter C3",
  "Inter C4",
  "Upper D1",
  "Upper D2",
  "Expert E1",
  "Expert E2",
  "Newbie A1",
  "Newbie A2",
  "Beginner B1",
  "Beginner B2",
];
const visibleTiers = (page) => page.locator(".tier:visible");

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

test("54.1 Hide skill clears badges from queue, courts and On Deck; Show brings them back", async ({
  page,
}) => {
  await fullSetup(page, { courts: 1, playerNames: TWELVE });
  await seedLiveMatch(page);
  await seedSlate(page);
  const tiers = await visibleTiers(page).count();
  // queue cards and the live court both show badges before hiding
  expect(await page.locator("[data-entry-id] .tier:visible").count()).toBeGreaterThan(0);
  expect(await page.getByTestId("court-card").locator(".tier:visible").count()).toBeGreaterThan(0);

  const btn = page.getByTestId("btn-hide-skill");
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await expect(btn).toHaveAccessibleName("Show skill");
  await expect(visibleTiers(page)).toHaveCount(0);
  // names are still there — only the levels go
  await expect(page.getByTestId("court-card").first()).toContainText(/\w/);
  await expect(page.locator("[data-entry-id]").first()).toBeVisible();

  await btn.click();
  await expect(btn).toHaveAccessibleName("Hide skill");
  await expect(visibleTiers(page)).toHaveCount(tiers);
});

test("54.2 the setting sticks across reloads, new queue rows and the history pages", async ({ page }) => {
  const { session } = await fullSetup(page, { courts: 1, playerNames: TWELVE.slice(0, 4) });
  await page.getByTestId("btn-hide-skill").click();
  await page.reload();
  await expect(page.getByTestId("btn-hide-skill")).toHaveAccessibleName("Show skill");
  await expect(visibleTiers(page)).toHaveCount(0);

  // a player checked in after hiding arrives hidden too
  const { players } = await (await page.request.get(`${base()}/api/players`)).json();
  const pro = players.find((p) => p.name === "Pro F1");
  await page.request.fetch(`${base()}/api/sessions/${session.id}/checkin`, {
    method: "POST",
    data: { player_id: pro.id },
  });
  await expect(page.locator("[data-entry-id]").filter({ hasText: "Pro F1" })).toBeVisible();
  await expect(visibleTiers(page)).toHaveCount(0);

  // career page: the learned rating tile is a skill surface too
  const st = await liveState(page);
  const ids = st.queue.filter((e) => e.status === "waiting").map((e) => e.id);
  const { match } = await (
    await page.request.fetch(`${base()}/api/matches`, {
      method: "POST",
      data: {
        session_id: session.id,
        court_number: st.courts[0].id,
        team1_p1: ids[0],
        team1_p2: ids[1],
        team2_p1: ids[2],
        team2_p2: ids[3],
      },
    })
  ).json();
  await page.request.fetch(`${base()}/api/matches/${match.id}/end`, {
    method: "PATCH",
    data: { team1_score: 21, team2_score: 12 },
  });
  const playerId = st.queue.find((e) => e.id === ids[0]).player_id;
  await page.goto(`/#/players/${playerId}`);
  const totals = page.getByTestId("career-totals");
  await expect(totals.getByText("Games", { exact: true })).toBeVisible();
  await expect(totals.getByText("Rating", { exact: true })).toBeHidden();

  await page.evaluate(() => localStorage.setItem("queuec-hide-skill", "0"));
  await page.reload();
  await expect(totals.getByText("Rating", { exact: true })).toBeVisible();
});

test("54.3 hiding on one device leaves another device showing skill", async ({ page, browser, baseURL }) => {
  await fullSetup(page, { courts: 1, playerNames: TWELVE.slice(0, 4) });
  const ctx = await browser.newContext({ baseURL });
  const other = await ctx.newPage();
  await other.goto("/");
  await page.getByTestId("btn-hide-skill").click();
  await expect(visibleTiers(page)).toHaveCount(0);
  await expect(visibleTiers(other)).toHaveCount(4);
  await expect(other.getByTestId("btn-hide-skill")).toHaveAccessibleName("Hide skill");
  await ctx.close();
});

test("54.4 setup screen: pool badges, tier filter and the edit-skill picker all hide", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("player-pool").first()).toBeVisible(); // pool loaded
  await expect(page.getByLabel("Filter tier")).toBeVisible();
  expect(await visibleTiers(page).count()).toBeGreaterThan(0);

  await page.getByTestId("btn-hide-skill").click();
  await expect(visibleTiers(page)).toHaveCount(0);
  await expect(page.getByLabel("Filter tier")).toBeHidden();
  // editing a player (double-click) doesn't expose their level either
  await page.getByTestId("player-pool").filter({ hasText: "Inter C1" }).first().dblclick();
  await expect(page.getByLabel("Player skill")).toBeHidden();
});

test("54.5 matching still balances by skill while it's hidden", async ({ page }) => {
  await fullSetup(page, { courts: 1, playerNames: TWELVE.slice(0, 8) });
  await page.getByTestId("btn-hide-skill").click();
  await page.getByTestId("btn-smart-match").click();
  await expect(page.getByTestId("court-card").first().getByText("Drop…")).toHaveCount(0);
  await expect(page.getByTestId("on-deck-count")).not.toHaveText("0");
  await expect(visibleTiers(page)).toHaveCount(0);
});

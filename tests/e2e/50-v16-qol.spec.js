import { expect, test } from "../fixtures.js";
import { base, fullSetup, liveState, seedLiveMatch } from "../helpers.js";

// v1.6 QoL: UI re-render only — the server rules are in server/routes/v16-qol.test.js
test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

const api = (page, path, method, data) => page.request.fetch(`${base()}/api${path}`, { method, data });

test("50.1 substitute swaps a waiting player onto a live court", async ({ page }) => {
  await fullSetup(page);
  const slate = await seedLiveMatch(page);
  await page.getByTestId("btn-substitute").click();
  const incoming = await page.getByTestId("sub-in").locator("option:checked").textContent();
  await page.getByTestId("sub-confirm").click();
  await expect(page.getByTestId("toast")).toContainText(`${incoming} in for`);
  const { activeMatches } = await liveState(page);
  expect(activeMatches.find((m) => m.id === slate.id)).toBeTruthy();
});

test("50.2 a player with games can go home and is off the queue", async ({ page }) => {
  await fullSetup(page);
  const slate = await seedLiveMatch(page);
  await api(page, `/matches/${slate.id}/end`, "PATCH", { team1_score: 21, team2_score: 15 });
  const card = page
    .locator("[data-entry-id]")
    .filter({ has: page.getByTestId("gone-home") })
    .first();
  const name = (await card.locator(".text-base.font-medium").textContent()).trim();
  await card.getByTestId("gone-home").click();
  await expect(page.getByTestId("toast")).toContainText(`${name} went home`);
  await expect(page.locator("[data-entry-id]").filter({ hasText: name })).toHaveCount(0);
});

test("50.3 newcomers show a next-game estimate", async ({ page }) => {
  await fullSetup(page);
  await expect(page.getByTestId("card-eta").first()).toContainText("next game");
});

test("50.4 payments: fees, shares and paid on the session page", async ({ page }) => {
  await fullSetup(page);
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  await page.getByTestId("nav-payments").click();
  await expect(page).toHaveURL(new RegExp(`#/history/${session.id}$`));
  await page.getByTestId("fee-court").fill("800");
  await page.getByTestId("fee-shuttle").click(); // blur saves
  const rows = page.getByTestId("payment-row");
  const n = await rows.count();
  await expect(page.getByTestId("fee-collected")).toContainText(`/ ₱${Math.round(800 / n) * n}`);
  await rows.first().getByTestId("payment-paid").click(); // server-confirmed, not optimistic
  await expect(page.getByTestId("fee-collected")).toContainText(`₱${Math.round(800 / n)} /`);
});

test("50.5 last-call badge on an idle court inside its final 20 minutes", async ({ page }) => {
  await fullSetup(page);
  const { courts } = await liveState(page);
  await api(page, `/courts/${courts[0].id}`, "PATCH", { expires_at: Math.floor(Date.now() / 1000) + 600 });
  await expect(page.getByTestId("last-call-badge").first()).toContainText("Last call");
});

test("50.6 setup can preselect last session's players", async ({ page }) => {
  await fullSetup(page);
  const slate = await seedLiveMatch(page);
  await api(page, `/matches/${slate.id}/end`, "PATCH", { team1_score: 21, team2_score: 15 });
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  await api(page, `/sessions/${session.id}/end`, "PATCH");
  await page.goto("/");
  await page.getByTestId("select-last-session").click();
  await expect(page.getByTestId("toast")).toContainText("Selected");
});

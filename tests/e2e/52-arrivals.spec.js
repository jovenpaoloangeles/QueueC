// 52 — "Not here yet" arrivals across scenarios: who counts, who gets matched,
// late-arrival fairness, mis-tap undo, search arrival, filtered bulk arrival,
// two QM devices at once, no-shows at the end, arrival-order sessions.
import { expect, test } from "../fixtures.js";
import { base, checkinPlayers, fullSetup, liveState, startSession } from "../helpers.js";

const INTERS = ["Inter C1", "Inter C2", "Inter C3", "Inter C4"];

const api = async (page, path, method = "GET", data) => {
  const res = await page.request.fetch(`${base()}${path}`, { method, data });
  return { status: res.status(), ...(await res.json().catch(() => ({}))) };
};
const entryOf = async (page, name) => (await liveState(page)).queue.find((e) => e.name === name);
const chip = (page, name) => page.getByTestId("away-chip").filter({ hasText: name });

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

test("52.1 not-here players don't count as waiting or present", async ({ page }) => {
  await fullSetup(page, { courts: 1, playerNames: INTERS, away: ["Pro F1", "Pro F2"] });
  await expect(page.getByTestId("hdr-waiting")).toHaveText("4");
  await expect(page.getByTestId("away-strip")).toContainText("Not here yet · 2");
  const st = await liveState(page);
  expect(st.stats.player_count).toBe(4);
  expect(st.queue.filter((e) => e.status === "away").map((e) => e.name)).toEqual(["Pro F1", "Pro F2"]);
});

test("52.2 Smart Match only lines up players who have arrived", async ({ page }) => {
  await fullSetup(page, {
    courts: 1,
    playerNames: INTERS,
    away: ["Pro F1", "Pro F2", "Expert E1", "Expert E2"],
  });
  await page.getByTestId("btn-smart-match").click();
  const court = page.getByTestId("court-card").first();
  for (const n of INTERS) await expect(court).toContainText(n);
  for (const n of ["Pro F1", "Pro F2", "Expert E1", "Expert E2"]) await expect(court).not.toContainText(n);
  await expect(page.getByTestId("away-chip")).toHaveCount(4);
});

test("52.3 a late arrival starts a fresh clock with the late-arrival credit", async ({ page }) => {
  await fullSetup(page, { courts: 1, playerNames: INTERS, away: ["Pro F1"] });
  const before = await entryOf(page, "Pro F1");
  // one finished game: everyone already here has played once
  const st = await liveState(page);
  const ids = st.queue.filter((e) => e.status === "waiting").map((e) => e.id);
  const { match } = await api(page, "/api/matches", "POST", {
    session_id: st.session.id,
    court_number: st.courts[0].id,
    team1_p1: ids[0],
    team1_p2: ids[1],
    team2_p1: ids[2],
    team2_p2: ids[3],
  });
  await api(page, `/api/matches/${match.id}/end`, "PATCH", { team1_score: 21, team2_score: 15 });

  const t0 = Math.floor(Date.now() / 1000);
  await chip(page, "Pro F1").click();
  await expect(page.getByTestId("toast")).toContainText("Pro F1 arrived");
  await expect(page.locator("[data-entry-id]").filter({ hasText: "Pro F1" })).toHaveCount(1);
  const after = await entryOf(page, "Pro F1");
  expect(after.status).toBe("waiting");
  expect(after.id).not.toBe(before.id); // a fresh check-in, not the old row
  expect(after.checked_in_at).toBeGreaterThanOrEqual(t0 - 1);
  // queued like a late check-in: credited with the games the room has played
  expect(after.virt_offset).toBeGreaterThan(0);
});

test("52.4 Undo puts a mis-tap back; once they're on court Undo says why it can't", async ({ page }) => {
  await fullSetup(page, { courts: 1, playerNames: INTERS.slice(0, 3), away: ["Inter C4", "Pro F1"] });

  // plain mis-tap
  await chip(page, "Pro F1").click();
  await page.getByTestId("toast-undo").click();
  await expect(chip(page, "Pro F1")).toHaveCount(1);
  expect((await entryOf(page, "Pro F1")).status).toBe("away");

  // arrives, and is put straight on court before the Undo
  await chip(page, "Inter C4").click();
  await expect(page.getByTestId("toast-undo")).toBeVisible();
  const st = await liveState(page);
  const ids = st.queue.filter((e) => e.status === "waiting").map((e) => e.id);
  expect(ids).toHaveLength(4);
  const started = await api(page, "/api/matches", "POST", {
    session_id: st.session.id,
    court_number: st.courts[0].id,
    team1_p1: ids[0],
    team1_p2: ids[1],
    team2_p1: ids[2],
    team2_p2: ids[3],
  });
  expect(started.status).toBe(201);
  await page.getByTestId("toast-undo").click();
  await expect(page.getByTestId("toast")).toContainText(/playing|match/i);
  expect((await entryOf(page, "Inter C4")).status).toBe("playing");
  await expect(chip(page, "Inter C4")).toHaveCount(0);
});

test("52.5 checking in a not-here player from search marks them arrived", async ({ page }) => {
  await fullSetup(page, { courts: 1, playerNames: INTERS, away: ["Pro F1", "Pro F2"] });
  await page.getByTestId("checkin-toggle").click();
  await page.getByTestId("checkin-search").fill("Pro F1");
  await page.getByTestId("combobox-matches").getByRole("button", { name: "Pro F1" }).click();
  await page.getByTestId("bulk-checkin-btn").click();
  await page.getByTestId("checkin-confirm-add").click();
  await expect(page.locator("[data-entry-id]")).toHaveCount(5);
  await expect(page.getByTestId("away-chip")).toHaveCount(1);
  const st = await liveState(page);
  expect(st.queue.filter((e) => e.name === "Pro F1")).toHaveLength(1); // no duplicate row
});

test("52.6 the queue filter narrows the chips; All here then arrives only those", async ({ page }) => {
  await fullSetup(page, { courts: 1, playerNames: INTERS, away: ["Pro F1", "Pro F2", "Expert E1"] });
  await page.getByLabel("Filter queue").fill("pro");
  await expect(page.getByTestId("away-chip")).toHaveCount(2);
  await page.getByTestId("away-all").click();
  await expect(page.getByTestId("toast")).toContainText("2 players arrived");
  await page.getByLabel("Filter queue").fill("");
  await expect(page.getByTestId("away-chip")).toHaveCount(1);
  await expect(page.getByTestId("away-chip")).toHaveText("Expert E1");
  await expect(page.locator("[data-entry-id]")).toHaveCount(6);
});

test("52.7 two QM devices see arrivals live, from either side", async ({ page, browser, baseURL }) => {
  await fullSetup(page, { courts: 1, playerNames: INTERS, away: ["Pro F1", "Pro F2", "Expert E1"] });
  const ctx = await browser.newContext({ baseURL });
  const other = await ctx.newPage();
  await other.goto("/");
  await expect(other.getByTestId("away-chip")).toHaveCount(3);

  await chip(page, "Pro F1").click();
  await expect(other.getByTestId("away-chip")).toHaveCount(2);
  await expect(other.locator("[data-entry-id]").filter({ hasText: "Pro F1" })).toHaveCount(1);

  await other.getByTestId("away-all").click();
  await expect(page.getByTestId("away-strip")).toHaveCount(0);
  await expect(page.locator("[data-entry-id]")).toHaveCount(7);
  await ctx.close();
});

test("52.8 the same arrival tapped on two devices at once lands once", async ({ page }) => {
  await fullSetup(page, { courts: 1, playerNames: INTERS, away: ["Pro F1"] });
  const st = await liveState(page);
  const pid = st.queue.find((e) => e.name === "Pro F1").player_id;
  const both = await Promise.all(
    [0, 1].map(() => api(page, `/api/sessions/${st.session.id}/checkin`, "POST", { player_id: pid })),
  );
  expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
  const rows = (await liveState(page)).queue.filter((e) => e.player_id === pid);
  expect(rows.map((e) => e.status)).toEqual(["waiting"]);
});

test("52.9 no-shows stay out of payments, and out of attendance after the end", async ({ page }) => {
  const { session } = await fullSetup(page, { courts: 1, playerNames: INTERS, away: ["Pro F1"] });
  await page.goto(`/#/history/${session.id}`);
  await expect(page.getByTestId("payment-row")).toHaveCount(4);
  await expect(page.getByTestId("payment-row").filter({ hasText: "Pro F1" })).toHaveCount(0);

  await api(page, `/api/sessions/${session.id}/end`, "PATCH");
  await page.reload();
  await expect(page.getByTestId("detail-attendance-row")).toHaveCount(4);
  await expect(page.getByTestId("detail-attendance-row").filter({ hasText: "Pro F1" })).toHaveCount(0);
});

test("52.10 arrival-order session: the queue follows the order people walk in", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Check-in order").selectOption("arrival");
  await checkinPlayers(page, ["Inter C1", "Inter C2", "Inter C3"]);
  await startSession(page, { arrived: false });
  for (const n of ["Inter C3", "Inter C1", "Inter C2"]) {
    await chip(page, n).click();
    await expect(chip(page, n)).toHaveCount(0);
  }
  const names = (await liveState(page)).queue.map((e) => e.name);
  expect(names).toEqual(["Inter C3", "Inter C1", "Inter C2"]);
});

test("52.11 the not-here list survives a reload", async ({ page }) => {
  await fullSetup(page, { courts: 1, playerNames: INTERS, away: ["Pro F1", "Pro F2"] });
  await chip(page, "Pro F2").click();
  await expect(page.getByTestId("away-chip")).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("away-chip")).toHaveText("Pro F1");
  await expect(page.locator("[data-entry-id]")).toHaveCount(5);
});

test("52.12 a not-here player can't be benched or sent home before arriving", async ({ page }) => {
  await fullSetup(page, { courts: 1, playerNames: INTERS, away: ["Pro F1"] });
  const e = await entryOf(page, "Pro F1");
  for (const status of ["resting", "left", "waiting"]) {
    const r = await api(page, `/api/queue/${e.id}/status`, "PATCH", { status });
    expect(r.status, status).toBe(409);
  }
  // but a no-show can be dropped from the list entirely
  expect((await api(page, `/api/queue/${e.id}`, "DELETE")).status).toBe(200);
  await expect(page.getByTestId("away-strip")).toHaveCount(0);
});

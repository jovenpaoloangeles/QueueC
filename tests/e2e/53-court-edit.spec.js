// 53 — Edit courts on a live session, across scenarios: cancel, off/on,
// remove (used vs unused), late opening, closing early mid-game, reviving an
// expired court, adding a court, a second QM device, the header time range.
import { expect, test } from "../fixtures.js";
import { base, fullSetup, liveState, seedLiveMatch } from "../helpers.js";

const EIGHT = [
  "Inter C1",
  "Inter C2",
  "Inter C3",
  "Inter C4",
  "Upper D1",
  "Upper D2",
  "Expert E1",
  "Expert E2",
];

const pad = (n) => String(n).padStart(2, "0");
// local "HH:MM" `mins` from now — the dialog takes clock times on today's date
const clock = (mins) => {
  const d = new Date(Date.now() + mins * 60000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// these cases move a time across "now"; near midnight that wraps the day
const nearMidnight = () => {
  const h = new Date().getHours();
  return h >= 22 || h < 1;
};

const openEditor = async (page) => {
  await page.getByTestId("courts-edit").click();
  await expect(page.getByTestId("courts-edit-dialog")).toBeVisible();
  return page.getByTestId("courts-edit-row");
};
const save = async (page) => {
  await page.getByTestId("courts-edit-save").click();
  await expect(page.getByTestId("courts-edit-dialog")).toHaveCount(0);
};
const courtCard = (page, label) => page.getByTestId("court-card").filter({ hasText: label });

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

test("53.1 Cancel throws the edits away", async ({ page }) => {
  await fullSetup(page, { courts: 2 });
  const rows = await openEditor(page);
  await rows.nth(0).getByLabel("Court name").fill("Wrong");
  await rows.nth(1).getByTestId("courts-edit-on").uncheck();
  await page.getByRole("button", { name: "Cancel" }).click();
  const { courts } = await liveState(page);
  expect(courts.map((c) => [c.label, c.enabled])).toEqual([
    ["Court 1", 1],
    ["Court 2", 1],
  ]);
});

test("53.2 switching every court off keeps Edit courts reachable to switch one back on", async ({ page }) => {
  await fullSetup(page, { courts: 2 });
  let rows = await openEditor(page);
  await rows.nth(0).getByTestId("courts-edit-on").uncheck();
  await rows.nth(1).getByTestId("courts-edit-on").uncheck();
  await save(page);
  await expect(page.getByTestId("court-card")).toHaveCount(0);

  rows = await openEditor(page);
  await rows.nth(1).getByTestId("courts-edit-on").check();
  await save(page);
  await expect(page.getByTestId("court-card")).toHaveCount(1);
  await expect(courtCard(page, "Court 2")).toHaveCount(1);
});

test("53.3 an unused court can be removed; one with games is refused with the reason", async ({ page }) => {
  await fullSetup(page, { courts: 3 });
  const st = await liveState(page);
  const m = await seedLiveMatch(page, { courtId: st.courts[0].id });
  await page.request.fetch(`${base()}/api/matches/${m.id}/end`, {
    method: "PATCH",
    data: { team1_score: 21, team2_score: 10 },
  });

  let rows = await openEditor(page);
  await rows.nth(2).getByTestId("courts-edit-remove").click();
  await expect(rows.nth(2).getByTestId("courts-edit-remove")).toHaveText("Keep");
  await save(page);
  expect((await liveState(page)).courts.map((c) => c.label)).toEqual(["Court 1", "Court 2"]);

  rows = await openEditor(page);
  await rows.nth(0).getByTestId("courts-edit-remove").click();
  await page.getByTestId("courts-edit-save").click();
  await expect(page.getByTestId("toast")).toContainText("has games on it");
  await expect(page.getByTestId("courts-edit-dialog")).toBeVisible();
  expect((await liveState(page)).courts).toHaveLength(2);
});

test("53.4 a court moved to open later waits as a strip and gets no lineup", async ({ page }) => {
  test.skip(nearMidnight(), "clock-time edit would wrap past midnight");
  await fullSetup(page, { courts: 2, playerNames: EIGHT });
  const rows = await openEditor(page);
  await rows.nth(1).getByTestId("courts-edit-opens").fill(clock(90));
  await save(page);
  await expect(page.getByTestId("opens-in-note").locator("..")).toContainText("Court 2");

  await page.getByTestId("btn-smart-match").click();
  // only Court 1 is a card that takes a lineup; Court 2 stays a strip
  await expect(page.getByTestId("court-card")).toHaveCount(1);
  await expect(page.getByTestId("opens-in-note")).toHaveCount(1);
});

test("53.5 closing a court early mid-game: the game finishes under Last Game, then it's expired", async ({
  page,
}) => {
  test.skip(nearMidnight(), "clock-time edit would wrap past midnight");
  await fullSetup(page, { courts: 1 });
  const m = await seedLiveMatch(page);
  const rows = await openEditor(page);
  await rows.nth(0).getByTestId("courts-edit-closes").fill(clock(-2));
  await save(page);
  await expect(page.getByTestId("expiring-last-game-badge")).toBeVisible();
  await expect(page.getByTestId("court-winner-1")).toBeVisible(); // still playing

  await page.request.fetch(`${base()}/api/matches/${m.id}/end`, {
    method: "PATCH",
    data: { team1_score: 21, team2_score: 18 },
  });
  await expect(page.getByTestId("expired-badge")).toBeVisible();
});

test("53.6 an expired court comes back by moving its closing time later", async ({ page }) => {
  test.skip(nearMidnight(), "clock-time edit would wrap past midnight");
  await fullSetup(page, { courts: 1 });
  let rows = await openEditor(page);
  await rows.nth(0).getByTestId("courts-edit-closes").fill(clock(-2));
  await save(page);
  await expect(page.getByTestId("expired-badge")).toBeVisible();

  rows = await openEditor(page);
  await rows.nth(0).getByTestId("courts-edit-closes").fill(clock(60));
  await save(page);
  await expect(page.getByTestId("expired-badge")).toHaveCount(0);
  await expect(page.getByTestId("court-countdown")).toBeVisible();
});

test("53.7 a court added mid-session gets a lineup straight away", async ({ page }) => {
  await fullSetup(page, { courts: 1, playerNames: EIGHT });
  await openEditor(page);
  await page.getByTestId("courts-edit-add").click();
  await page.getByTestId("courts-edit-row").nth(1).getByLabel("Court name").fill("Court 8");
  await save(page);
  await expect(page.getByTestId("court-card")).toHaveCount(2);

  await page.getByTestId("btn-smart-match").click();
  for (const label of ["Court 1", "Court 8"]) {
    await expect(courtCard(page, label).getByText("Drop…")).toHaveCount(0);
  }
});

test("53.8 an edit on one QM device shows up live on the other", async ({ page, browser, baseURL }) => {
  await fullSetup(page, { courts: 2 });
  const ctx = await browser.newContext({ baseURL });
  const other = await ctx.newPage();
  await other.goto("/");
  await expect(other.getByTestId("court-card")).toHaveCount(2);

  const rows = await openEditor(page);
  await rows.nth(0).getByLabel("Court name").fill("Court 6");
  await rows.nth(1).getByTestId("courts-edit-on").uncheck();
  await save(page);
  await expect(courtCard(other, "Court 6")).toHaveCount(1);
  await expect(other.getByTestId("court-card")).toHaveCount(1);
  await ctx.close();
});

test("53.9 the header time range follows the courts' edited hours", async ({ page }) => {
  test.skip(nearMidnight(), "clock-time edit would wrap past midnight");
  await page.setViewportSize({ width: 1700, height: 900 }); // range shows from 2xl
  await fullSetup(page, { courts: 2 });
  const rows = await openEditor(page);
  await rows.nth(0).getByTestId("courts-edit-closes").fill("23:30");
  await rows.nth(1).getByTestId("courts-edit-closes").fill("23:00");
  await save(page);
  const end = new Date();
  end.setHours(23, 30, 0, 0);
  const want = end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  await expect(page.getByTestId("header-time-range")).toContainText(`–${want}`);
});

test("53.10 removing every court is blocked in the dialog", async ({ page }) => {
  await fullSetup(page, { courts: 2 });
  const rows = await openEditor(page);
  await rows.nth(0).getByTestId("courts-edit-remove").click();
  await rows.nth(1).getByTestId("courts-edit-remove").click();
  await expect(page.getByTestId("courts-edit-error")).toHaveText("Keep at least one court");
  await expect(page.getByTestId("courts-edit-save")).toBeDisabled();
});

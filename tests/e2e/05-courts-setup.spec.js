// tests/e2e/05-courts-setup.spec.js — court configuration on the single setup screen
import { expect, test } from "../fixtures.js";
import { base, checkinPlayers, createSession, liveState, startSession } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
  await createSession(page, { courts: 2 });
});

test("5.1 2 court rows by default", async ({ page }) => {
  await expect(page.getByTestId("court-row")).toHaveCount(2);
});

test("5.2 default labels are Court 1 and Court 2", async ({ page }) => {
  await expect(page.getByLabel("Court 1 label")).toHaveValue("Court 1");
  await expect(page.getByLabel("Court 2 label")).toHaveValue("Court 2");
});

test("5.3 raising the count adds Court 3 with 2 hours", async ({ page }) => {
  await page.getByLabel("Number of courts").fill("3");
  await expect(page.getByLabel("Court 3 label")).toHaveValue("Court 3");
  await expect(page.getByLabel("Court 3 hours")).toHaveValue("2");
});

test("5.4 lowering the count removes trailing rows", async ({ page }) => {
  await page.getByLabel("Number of courts").fill("1");
  await expect(page.getByTestId("court-row")).toHaveCount(1);
  await expect(page.getByLabel("Court 2 label")).toHaveCount(0);
});

test("5.5 custom label and per-court hours reach the live courts", async ({ page }) => {
  await page.getByLabel("Court 1 label").fill("Centre");
  await page.getByLabel("Court 1 hours").fill("1.5");
  await page.getByLabel("Court 2 hours").fill("3");
  await checkinPlayers(page, ["Inter C1", "Inter C2"]);
  await startSession(page);
  await expect(page.getByText("Centre").first()).toBeVisible();
  const { courts, session } = await liveState(page);
  expect(courts.map((c) => c.label)).toEqual(["Centre", "Court 2"]);
  expect(courts.map((c) => c.expires_at - session.started_at)).toEqual([5400, 10800]);
});

test("5.6 hours input is a 0.5-step number between 0.5 and 12", async ({ page }) => {
  const h = page.getByLabel("Court 1 hours");
  await expect(h).toHaveAttribute("type", "number");
  await expect(h).toHaveAttribute("step", "0.5");
  await expect(h).toHaveAttribute("min", "0.5");
  await expect(h).toHaveAttribute("max", "12");
});

test("5.7 chosen start time becomes the session scheduled start", async ({ page }) => {
  await page.getByLabel("Start time").selectOption("20:00");
  await checkinPlayers(page, ["Inter C1", "Inter C2"]);
  await startSession(page);
  const { session } = await liveState(page);
  const d = new Date(session.scheduled_start * 1000);
  expect([d.getHours(), d.getMinutes()]).toEqual([20, 0]);
  expect(session.scheduled_end - session.scheduled_start).toBe(2 * 3600);
});

test("5.8 all configured courts appear in the live view", async ({ page }) => {
  await page.getByLabel("Number of courts").fill("4");
  await checkinPlayers(page, ["Inter C1", "Inter C2"]);
  await startSession(page);
  for (const n of [1, 2, 3, 4]) await expect(page.getByText(`Court ${n}`).first()).toBeVisible();
});

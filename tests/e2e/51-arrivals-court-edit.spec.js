// tests/e2e/51-arrivals-court-edit.spec.js — 2026-11-27 event feedback:
// setup lists players as "Not here yet" (no wait clock) until tapped in, and a
// live session's courts can be fixed without restarting.
import { expect, test } from "../fixtures.js";
import { base, checkinPlayers, createSession, fullSetup, liveState, startSession } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

test("51.1 setup players wait on 'Not here yet'; a tap starts their clock, Undo puts them back", async ({
  page,
}) => {
  await createSession(page, { courts: 1 });
  await checkinPlayers(page, ["Inter C1", "Inter C2", "Inter C3"]);
  await startSession(page, { arrived: false });

  const chips = page.getByTestId("away-chip");
  await expect(chips).toHaveCount(3);
  await expect(page.locator("[data-entry-id]")).toHaveCount(0);

  await chips.filter({ hasText: "Inter C2" }).click();
  await expect(page.locator("[data-entry-id]")).toHaveCount(1);
  await expect(page.locator("[data-entry-id]")).toContainText("Inter C2");
  await expect(chips).toHaveCount(2);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(chips).toHaveCount(3);
  await expect(page.locator("[data-entry-id]")).toHaveCount(0);

  await page.getByTestId("away-all").click();
  await expect(page.getByTestId("away-strip")).toHaveCount(0);
  await expect(page.locator("[data-entry-id]")).toHaveCount(3);
});

test("51.2 Edit courts: rename, re-time, switch off and add without restarting", async ({ page }) => {
  await fullSetup(page, { courts: 2 });
  await page.getByTestId("courts-edit").click();
  const rows = page.getByTestId("courts-edit-row");
  await expect(rows).toHaveCount(2);

  await rows.nth(0).getByLabel("Court name").fill("Court 6");
  await rows.nth(0).getByTestId("courts-edit-closes").fill("23:30");
  await rows.nth(1).getByTestId("courts-edit-on").uncheck();
  await page.getByTestId("courts-edit-add").click();
  await rows.nth(2).getByLabel("Court name").fill("Court 8");
  await page.getByTestId("courts-edit-save").click();
  await expect(page.getByTestId("courts-edit-dialog")).toHaveCount(0);

  await expect(page.locator("text=Court 6").first()).toBeVisible();
  await expect(page.locator("text=Court 8").first()).toBeVisible();
  await expect(page.locator("text=Court 2")).toHaveCount(0);

  const { courts } = await liveState(page);
  const c6 = courts.find((c) => c.label === "Court 6");
  const d = new Date(c6.expires_at * 1000);
  expect([d.getHours(), d.getMinutes()]).toEqual([23, 30]);
  expect(courts.find((c) => c.label === "Court 2").enabled).toBe(0);
  expect(courts.find((c) => c.label === "Court 8").expires_at).toBeNull();
});

test("51.3 a court that closes before it opens can't be saved", async ({ page }) => {
  await fullSetup(page, { courts: 1 });
  await page.getByTestId("courts-edit").click();
  const row = page.getByTestId("courts-edit-row").first();
  await row.getByTestId("courts-edit-opens").fill("20:00");
  await row.getByTestId("courts-edit-closes").fill("19:00");
  await expect(page.getByTestId("courts-edit-error")).toContainText("closes before it opens");
  await expect(page.getByTestId("courts-edit-save")).toBeDisabled();
});

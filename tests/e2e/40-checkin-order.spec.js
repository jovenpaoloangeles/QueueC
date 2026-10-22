// 40 — per-session check-in order: arrival keeps check-in sequence, the
// alphabetical default slots by name
import { expect, test } from "../fixtures.js";
import { base, liveState, poolRow, startSession } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

test("40.1 arrival order keeps the check-in sequence in the grid", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Check-in order").selectOption("arrival");
  // non-alphabetical pick order: C4 first — arrival must keep it ahead of C2
  await poolRow(page, "Inter C4").click();
  await poolRow(page, "Inter C2").click();
  await startSession(page);
  const names = (await liveState(page)).queue.map((e) => e.name);
  expect(names.indexOf("Inter C4")).toBeLessThan(names.indexOf("Inter C2"));
});

test("40.2 default stays alphabetical", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Check-in order")).toHaveValue("alphabetical");
  await poolRow(page, "Inter C4").click();
  await poolRow(page, "Inter C2").click();
  await startSession(page);
  const names = (await liveState(page)).queue.map((e) => e.name);
  expect(names.indexOf("Inter C2")).toBeLessThan(names.indexOf("Inter C4"));
});

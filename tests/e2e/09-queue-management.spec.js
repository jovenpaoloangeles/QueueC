// tests/e2e/09-queue-management.spec.js
import { expect, test } from "../fixtures.js";
import { base, clickStartMatch, fullSetup, getQueueNames, syntheticDrag } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
  await fullSetup(page);
});

test("9.4 shift-click benches player", async ({ page }) => {
  const card = page.locator("[data-entry-id]").first();
  const name = await card.locator(".text-base.font-medium").textContent();
  await card.click({ modifiers: ["Shift"] });
  await expect(page.locator("[data-resting-id]").locator(`text=${name?.trim()}`)).toBeVisible();
});

test("9.5 Rest tab shows benched player", async ({ page }) => {
  await page
    .locator("[data-entry-id]")
    .first()
    .click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("queue-tab-rest")).toContainText("(1)");
  await page.getByTestId("queue-tab-rest").click();
  await expect(page.locator("[data-resting-id]")).toHaveCount(1);
});

test("9.6 resting player absent from queue grid", async ({ page }) => {
  const card = page.locator("[data-entry-id]").first();
  const name = await card.locator(".text-base.font-medium").textContent();
  await card.click({ modifiers: ["Shift"] });
  await expect(page.locator("[data-entry-id]").locator(`text=${name?.trim()}`)).toHaveCount(0);
});

test("9.8 Wake button restores to waiting", async ({ page }) => {
  const card = page.locator("[data-entry-id]").first();
  const name = await card.locator(".text-base.font-medium").textContent();
  await card.click({ modifiers: ["Shift"] });
  await page.waitForTimeout(400);
  await page.locator("[data-resting-id]").getByTestId("rest-toggle").click();
  await expect(page.locator("[data-entry-id]").locator(`text=${name?.trim()}`)).toBeVisible();
});

test("9.11 bench selected player removes from selection", async ({ page }) => {
  await page.locator("[data-entry-id]").nth(0).click();
  await page.locator("[data-entry-id]").nth(1).click();
  await page
    .locator("[data-entry-id]")
    .nth(0)
    .click({ modifiers: ["Shift"] });
  await expect(page.locator("text=1 selected")).toBeVisible();
});

test("9.12 Rest tab shows count zero when nobody is resting", async ({ page }) => {
  await expect(page.getByTestId("queue-tab-rest")).toContainText("(0)");
});

test("9.1 drag player A after player B — order reflected in grid", async ({ page }) => {
  const before = await getQueueNames(page);
  await syntheticDrag(page, "[data-entry-id]", "[data-entry-id]", { fromIndex: 1, toIndex: 0 });
  await expect(page.locator("[data-entry-id]").first().locator(".text-base.font-medium")).toHaveText(
    before[1],
  );
  await expect(page.locator("[data-entry-id]").nth(1).locator(".text-base.font-medium")).toHaveText(
    before[0],
  );
});

test("9.2 SSE tick does not reset manual reorder", async ({ page }) => {
  const before = await getQueueNames(page);
  await syntheticDrag(page, "[data-entry-id]", "[data-entry-id]", { fromIndex: 1, toIndex: 0 });
  // a real server broadcast (late check-in over the API) must not reset the manual order
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  const { players } = await (await page.request.get(`${base()}/api/players`)).json();
  const late = players.find((p) => !before.includes(p.name));
  await page.request.fetch(`${base()}/api/sessions/${session.id}/checkin`, {
    method: "POST",
    data: { player_id: late.id },
  });
  await expect(page.locator("[data-entry-id]")).toHaveCount(before.length + 1);
  const after = await getQueueNames(page);
  // the late check-in slots alphabetically (item 1), but the manual swap of the
  // first two entries must survive it — they stay adjacent, in swapped order
  const idx = after.indexOf(late.name);
  expect(idx).toBeGreaterThanOrEqual(0);
  expect(after.slice(idx + 1, idx + 3)).toEqual([before[1], before[0]]);
});

test("9.3 newly checked-in player slots into alphabetical position", async ({ page }) => {
  // seeded queue: Inter C1–C4, Expert E1–E2, Upper D1–D2 — B1 sorts before all of them
  await page.getByTestId("checkin-toggle").click();
  await page.getByTestId("checkin-search").fill("Beginner B1");
  await page.getByTestId("combobox-matches").getByRole("button", { name: "Beginner B1" }).click();
  await page.getByTestId("bulk-checkin-btn").click();
  await page.getByTestId("checkin-confirm-add").click();
  // SSE ticks every 1s and the resync lands on the next tick — poll, don't sleep
  await expect.poll(async () => (await getQueueNames(page))[0], { timeout: 4000 }).toBe("Beginner B1");
});

test("9.7 resting player absent from selection candidates", async ({ page }) => {
  const name = (await getQueueNames(page))[0].trim();
  await page
    .locator("[data-entry-id]")
    .first()
    .click({ modifiers: ["Shift"] });
  await page.waitForTimeout(400);
  // select 4 waiting players manually (the benched player is not among them —
  // resting rows leave the grid entirely)
  const cards = page.locator("[data-entry-id]");
  for (let i = 0; i < 4; i++) await cards.nth(i).click();
  await clickStartMatch(page);
  await page.waitForTimeout(500);
  // bench player never made it to court
  for (const side of await page.locator("[data-team-side]").allTextContents()) {
    expect(side).not.toContain(name);
  }
  await page.getByTestId("queue-tab-rest").click();
  await expect(page.locator("[data-resting-id]")).toContainText(name);
});

test("9.9 Rest button benches a player", async ({ page }) => {
  const name = (await getQueueNames(page))[0].trim();
  await page.locator("[data-entry-id]").first().getByTestId("rest-toggle").click();
  await expect(page.getByTestId("queue-tab-rest")).toContainText("(1)");
  await page.getByTestId("queue-tab-rest").click();
  await expect(page.locator("[data-resting-id]")).toContainText(name);
  await expect(page.locator("[data-entry-id]")).toHaveCount(0);
});

test("9.10 Wake button on a resting row returns them to waiting", async ({ page }) => {
  const name = (await getQueueNames(page))[0].trim();
  await page.locator("[data-entry-id]").first().getByTestId("rest-toggle").click();
  await expect(page.getByTestId("queue-tab-rest")).toContainText("(1)");
  await page.getByTestId("queue-tab-rest").click();
  await page.locator("[data-resting-id]").getByTestId("rest-toggle").click();
  // the player is now waiting — visible under All, not the Rest tab
  await page.getByTestId("queue-tab-all").click();
  await expect(page.locator("[data-entry-id]").filter({ hasText: name })).toBeVisible();
  await expect(page.locator("[data-resting-id]")).toHaveCount(0);
});

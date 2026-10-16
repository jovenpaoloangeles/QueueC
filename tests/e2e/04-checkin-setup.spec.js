// tests/e2e/04-checkin-setup.spec.js
import { expect, test } from "../fixtures.js";
import { base, checkinPlayers, createSession, liveState, poolRow, startSession } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
  await createSession(page);
});

test("4.1 all 22 fixture players appear in pool", async ({ page }) => {
  const chips = page.getByTestId("player-pool");
  await expect(chips).toHaveCount(22);
});

test("4.2 row shows name and skill badge", async ({ page }) => {
  const chip = poolRow(page, "Inter C1");
  await expect(chip).toBeVisible();
  await expect(chip.locator("text=Intermediate")).toBeVisible();
});

test("4.3 clicking a chip selects it (nothing is checked in yet)", async ({ page }) => {
  const chip = poolRow(page, "Inter C1");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("selected-count")).toHaveText("1 selected");
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  expect(session).toBeNull();
});

test("4.4 selected counter updates", async ({ page }) => {
  await checkinPlayers(page, ["Inter C1", "Inter C2", "Inter C3"]);
  await expect(page.getByTestId("selected-count")).toHaveText("3 selected");
});

test("4.5 selected player stays in the pool, shown as pressed", async ({ page }) => {
  await checkinPlayers(page, ["Inter C1"]);
  const poolBtn = poolRow(page, "Inter C1");
  await expect(poolBtn).toHaveCount(1);
  await expect(poolBtn).toHaveAttribute("aria-checked", "true");
});

test("4.6 8 selected players — all in live queue, alphabetized", async ({ page }) => {
  const names = [
    "Inter C1",
    "Inter C2",
    "Inter C3",
    "Inter C4",
    "Expert E1",
    "Expert E2",
    "Upper D1",
    "Upper D2",
  ];
  await checkinPlayers(page, names);
  await startSession(page);
  await expect(page.locator("[data-entry-id]")).toHaveCount(8);
  const { queue } = await liveState(page);
  // check-ins slot alphabetically (r7 item 1) — selection order no longer applies
  expect(queue.map((e) => e.name)).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});

test("4.7 select-all selects every pool player and all start in the queue", async ({ page }) => {
  await page.getByTestId("select-all").click();
  await expect(page.getByTestId("selected-count")).toHaveText("22 selected");
  await startSession(page);
  await expect(page.locator("[data-entry-id]")).toHaveCount(22);
});

test("4.8 players visible in live queue after start", async ({ page }) => {
  await checkinPlayers(page, ["Inter C1", "Inter C2"]);
  await startSession(page);
  await expect(page.locator("[data-entry-id]").locator("text=Inter C1")).toBeVisible();
});

test("4.9 chip click toggles selection on/off", async ({ page }) => {
  const chip = poolRow(page, "Inter C1");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-checked", "true");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("selected-count")).toHaveText("0 selected");
  await expect(page.getByTestId("start-session")).toBeDisabled();
});

test("4.10 failed start keeps selections and leaves no live session", async ({ page }) => {
  await checkinPlayers(page, ["Inter C1", "Inter C2"]);
  await page.route("**/api/sessions/*/checkin", (r) =>
    r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' }),
  );
  await page.getByTestId("start-session").click();
  await expect(page.getByText("boom")).toBeVisible();
  await expect(page.getByTestId("selected-count")).toHaveText("2 selected");
  await expect(page.getByTestId("start-session")).toBeEnabled();
  await expect
    .poll(async () => (await (await page.request.get(`${base()}/api/sessions/active`)).json()).session)
    .toBeNull();
});

// tests/e2e/22-setup-pool.spec.js
// Setup pool smoke: select-all toggling, tier filter + select-all scope,
// and fractional-hours court timers.
import { expect, test } from "../fixtures.js";
import { base, createSession } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

// Pool size comes from the API: the fixture seeds 22, but earlier specs
// register players that persist in the shared DB for the whole run.
async function poolTotal(page) {
  const { players } = await (await page.request.get(`${base()}/api/players`)).json();
  return players.length;
}

test("22.1 select all toggles every pool chip on, then off", async ({ page }) => {
  await createSession(page);
  const chips = page.getByTestId("player-pool");
  const total = await poolTotal(page);
  expect(total).toBeGreaterThanOrEqual(22);
  await expect(chips).toHaveCount(total);

  await page.getByTestId("select-all").click();
  await expect(chips).toHaveCount(total);
  expect(
    await chips.evaluateAll((els) => els.every((el) => el.getAttribute("aria-checked") === "true")),
  ).toBe(true);
  await expect(page.getByText(`${total} selected`)).toBeVisible();
  await expect(page.getByTestId("start-session")).toBeEnabled();

  // second click clears the selection
  await page.getByTestId("select-all").click();
  expect(
    await chips.evaluateAll((els) => els.every((el) => el.getAttribute("aria-checked") === "false")),
  ).toBe(true);
  await expect(page.getByText("0 selected")).toBeVisible();
  await expect(page.getByTestId("start-session")).toBeDisabled();
});

test("22.2 tier filter shows only that tier; select-all only touches visible chips", async ({ page }) => {
  await createSession(page);
  const chips = page.getByTestId("player-pool");
  const total = await poolTotal(page);
  await expect(chips).toHaveCount(total);

  const { players } = await (await page.request.get(`${base()}/api/players`)).json();
  const intermediateCount = players.filter((p) => p.skill_level === "intermediate").length;
  expect(intermediateCount).toBeGreaterThan(0);
  expect(intermediateCount).toBeLessThan(total);

  await page.getByLabel("Filter tier").selectOption("intermediate");
  await expect(chips).toHaveCount(intermediateCount);
  // intermediate badge uses the redesign-draft tier class (green .tier.t-int)
  expect(
    await chips.evaluateAll((els) =>
      els.map((el) => [...el.querySelectorAll("*")].some((x) => String(x.className).includes("t-int"))),
    ),
  ).toEqual(Array(intermediateCount).fill(true));

  await page.getByTestId("select-all").click();
  expect(
    await chips.evaluateAll((els) => els.every((el) => el.getAttribute("aria-checked") === "true")),
  ).toBe(true);
  await expect(page.getByText(`${intermediateCount} selected`)).toBeVisible();

  // off-filter players were not selected by the filtered select-all
  await page.getByLabel("Filter tier").selectOption("");
  await expect(chips).toHaveCount(total);
  const states = await chips.evaluateAll((els) => els.map((el) => el.getAttribute("aria-checked")));
  expect(states.filter((s) => s === "true")).toHaveLength(intermediateCount);
  expect(states.filter((s) => s === "false")).toHaveLength(total - intermediateCount);
});

test("22.3 fractional hours (1.5) become a 90-minute court timer", async ({ page }) => {
  await createSession(page, { courts: 1, hours: 1.5, name: "Custom Duration Session" });
  await page.getByTestId("select-all").click();
  await page.getByTestId("start-session").click();
  await page.getByTestId("session-setup").waitFor({ state: "detached" });
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  const { courts } = await (await page.request.get(`${base()}/api/sessions/${session.id}/courts`)).json();
  expect(courts).toHaveLength(1);
  expect(courts[0].duration_minutes).toBe(90);
  expect(courts[0].expires_at - session.started_at).toBe(5400);
});

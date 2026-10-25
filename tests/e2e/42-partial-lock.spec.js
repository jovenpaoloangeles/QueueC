// tests/e2e/42-partial-lock.spec.js — Smart add keeps pre-placed builder picks:
// the dry run pins them via `locked`, and the pour maps plan ids into the empty
// slots instead of replacing the draft wholesale.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../fixtures.js";
import { base, fullSetup, getQueueNames, liveState, syntheticDrag } from "../helpers.js";

const here = dirname(fileURLToPath(import.meta.url));
const NAMES = JSON.parse(readFileSync(join(here, "../fixtures/players.json"), "utf8"))
  .slice(0, 16)
  .map((p) => p.name);

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
  await fullSetup(page, { playerNames: NAMES });
});

const expandDeck = async (page) => {
  if (
    !(await page
      .getByTestId("ondeck-body")
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByTestId("ondeck-collapse").click();
  }
  await expect(page.getByTestId("ondeck-body")).toBeVisible();
};

const openBuilder = async (page) => {
  if (
    !(await page
      .getByTestId("ondeck-builder")
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByTestId("ondeck-builder-toggle").click();
  }
  await expect(page.getByTestId("ondeck-builder")).toBeVisible();
};

test("42.1 Smart add keeps drafted players in their slots", async ({ page }) => {
  await expandDeck(page);
  await openBuilder(page);
  // draft the first two queue rows into slots 0 and 1
  const names = (await getQueueNames(page)).slice(0, 2);
  await syntheticDrag(page, "[data-entry-id]", '[data-testid="ondeck-new-slot-0"]', { fromIndex: 0 });
  await syntheticDrag(page, "[data-entry-id]", '[data-testid="ondeck-new-slot-1"]', { fromIndex: 0 });
  await expect(page.getByTestId("ondeck-new-slot-0")).toContainText(names[0]);
  await expect(page.getByTestId("ondeck-new-slot-1")).toContainText(names[1]);

  await page.getByTestId("ondeck-smart-add").click();
  await expect(page.getByTestId("ondeck-new-slot-0")).toContainText(names[0]);
  await expect(page.getByTestId("ondeck-new-slot-1")).toContainText(names[1]);
  for (let i = 2; i < 4; i++) await expect(page.getByTestId(`ondeck-new-slot-${i}`)).not.toHaveText("Drop…");
  // builder shows exactly 4 distinct players
  const filled = [];
  for (let i = 0; i < 4; i++) filled.push(await page.getByTestId(`ondeck-new-slot-${i}`).innerText());
  expect(new Set(filled).size).toBe(4);
  // nothing slated by a fill — the builder is still the review surface
  expect((await liveState(page)).slatedMatches).toHaveLength(0);
});

test("42.2 Smart add is disabled once all four slots are filled", async ({ page }) => {
  await expandDeck(page);
  await openBuilder(page);
  for (let i = 0; i < 4; i++)
    await syntheticDrag(page, "[data-entry-id]", `[data-testid="ondeck-new-slot-${i}"]`, { fromIndex: 0 });
  await expect(page.getByTestId("ondeck-smart-add")).toBeDisabled();
});

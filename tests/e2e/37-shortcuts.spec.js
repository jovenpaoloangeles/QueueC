// v1.1 keyboard shortcuts: c / s / e / ? drive the queue-master flows without
// the mouse; typing in an input never triggers them.
import { expect, test } from "../fixtures.js";
import { fullSetup, seedLiveMatch, seedSlate } from "../helpers.js";

test("37.1 e opens End Match for the live game", async ({ page }) => {
  await fullSetup(page);
  await seedLiveMatch(page);
  await page.keyboard.press("e");
  await expect(page.getByRole("dialog")).toContainText("End Match");
  await page.keyboard.press("Escape");
});

test("37.2 s promotes the staged slate via the confirm dialog", async ({ page }) => {
  await fullSetup(page);
  await seedSlate(page);
  await page.keyboard.press("s");
  await expect(page.getByTestId("start-confirm-dialog")).toBeVisible();
  await page.getByTestId("start-confirm-cancel").click();
});

test("37.3 c opens check-in and focuses the search", async ({ page }) => {
  await fullSetup(page);
  await page.keyboard.press("c");
  await expect(page.getByTestId("checkin-search")).toBeVisible();
  await expect(page.getByTestId("checkin-search")).toBeFocused();
});

test("37.4 ? shows the cheatsheet, Esc closes", async ({ page }) => {
  await fullSetup(page);
  await page.keyboard.press("?");
  await expect(page.getByTestId("cheatsheet-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("cheatsheet-dialog")).toHaveCount(0);
});

test("37.5 typing c in the queue filter does not open check-in", async ({ page }) => {
  await fullSetup(page);
  await page.getByLabel("Filter queue").fill("c");
  await page.waitForTimeout(400);
  await expect(page.getByTestId("checkin-search")).toHaveCount(0);
});

test("37.6 shortcuts are inert while a dialog is open", async ({ page }) => {
  await fullSetup(page);
  for (let i = 0; i < 4; i++) await page.locator("[data-entry-id]").nth(i).click();
  await page.getByRole("button", { name: "Start Match" }).first().click();
  await expect(page.getByTestId("start-confirm-dialog")).toBeVisible();

  await page.keyboard.press("e");
  await page.keyboard.press("c");
  await page.keyboard.press("s");
  // nothing stacked, nothing replaced: exactly the confirm dialog remains
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByTestId("start-confirm-dialog")).toContainText("Start this match?");
  await expect(page.getByTestId("checkin-search")).toHaveCount(0);
});

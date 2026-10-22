// 38 — late-game draft restore: court drafts survive a refresh via sessionStorage
import { expect, test } from "../fixtures.js";
import { base, fullSetup, syntheticDrag } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
  await fullSetup(page);
});

// drop queue card #i into court 1's slot #i (partial draft — never auto-starts)
const dropSlot = (page, i) =>
  syntheticDrag(page, "[data-entry-id]", '[data-drop="slot"]', { fromIndex: i, toIndex: i });
const court1 = (page) => page.locator('[data-drop^="court-"]').first();
const draftKey = (page) =>
  page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("queuec.drafts.")));

test("38.1 court drafts survive a page reload", async ({ page }) => {
  await dropSlot(page, 0);
  await dropSlot(page, 1);
  // innerText adds a line for the ✕ clear button — the name is the first line
  const name0 = (await court1(page).locator('[data-testid="slot-0"]').innerText()).trim().split("\n")[0];
  const name1 = (await court1(page).locator('[data-testid="slot-1"]').innerText()).trim().split("\n")[0];
  expect(await draftKey(page)).toHaveLength(1);

  await page.reload();
  await expect(court1(page).locator('[data-testid="slot-0"]')).toContainText(name0);
  await expect(court1(page).locator('[data-testid="slot-1"]')).toContainText(name1);
});

test("38.2 ending the session clears the stored draft", async ({ page }) => {
  await dropSlot(page, 0);
  await expect(court1(page).locator('[data-testid="slot-0"]')).not.toContainText("Empty");
  await page.getByRole("button", { name: "End Session" }).click();
  await page.getByTestId("end-session-confirm").click();
  await expect(page.getByTestId("session-setup")).toBeVisible();
  expect(await draftKey(page)).toHaveLength(0);
});

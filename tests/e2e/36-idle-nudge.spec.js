// v1.1 idle-court nudge: a free court going to waste raises the amber banner
// after the (test-shortened) idle threshold — "waiting" copy with 4+ queued and
// nothing slated, switching to the "staged" copy once a slate sits on deck.
import { expect, test } from "../fixtures.js";
import { base, fullSetup, seedSlate } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__IDLE_NUDGE_SEC__ = 2;
  });
});

test("36.1 waiting nudge fires, staged copy takes over, cancel drops back", async ({ page }) => {
  await fullSetup(page);
  // 8 waiting + free courts + nothing slated → "waiting" copy after ~2s idle
  await expect(page.getByTestId("idle-nudge")).toContainText("4+ players waiting, nothing slated", {
    timeout: 8000,
  });

  const slateId = (await seedSlate(page)).id;
  await expect(page.getByTestId("idle-nudge")).toContainText("a slate is waiting on deck", {
    timeout: 8000,
  });

  // undo-equivalent: cancel the slate → back to the waiting copy
  await page.request.fetch(`${base()}/api/matches/${slateId}/slate`, { method: "DELETE" });
  await expect(page.getByTestId("idle-nudge")).toContainText("4+ players waiting, nothing slated", {
    timeout: 8000,
  });
});

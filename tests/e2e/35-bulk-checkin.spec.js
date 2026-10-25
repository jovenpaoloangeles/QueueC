// v1.1 bulk check-in: multi-select mode in the live check-in panel checks in
// several players with one confirmation; the toast undo removes them all.
import { expect, test } from "../fixtures.js";
import { fullSetup, liveState } from "../helpers.js";

test("35.1 multi-select checks in both players, undo removes both", async ({ page }) => {
  // leave Expert E1/E2 out of the initial check-ins so the pool has chips to pick
  await fullSetup(page, {
    playerNames: ["Inter C1", "Inter C2", "Inter C3", "Inter C4", "Upper D1", "Upper D2"],
  });
  const before = (await liveState(page)).queue.filter((e) => e.status === "waiting").length;

  await page.getByTestId("checkin-toggle").click();
  await page.getByTestId("checkin-search").fill("Expert");
  // pick two of the Expert E1/E2 chips
  const chips = page.getByTestId("combobox-matches").getByRole("button");
  await chips.nth(0).click();
  await expect(chips.nth(0)).toHaveAttribute("aria-pressed", "true");
  await chips.nth(1).click();
  await expect(chips.nth(1)).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("bulk-checkin-btn").click();
  await expect(page.getByTestId("checkin-confirm-dialog")).toContainText("Add 2 players to the pool?");
  await page.getByTestId("checkin-confirm-add").click();
  await expect(page.getByTestId("toast")).toContainText("Checked in 2 players");
  await expect
    .poll(async () => (await liveState(page)).queue.filter((e) => e.status === "waiting").length, {
      timeout: 5000,
    })
    .toBe(before + 2);

  await page.getByTestId("toast-undo").click();
  await expect(page.getByTestId("toast")).toContainText("Undone");
  await expect
    .poll(async () => (await liveState(page)).queue.filter((e) => e.status === "waiting").length, {
      timeout: 5000,
    })
    .toBe(before);
});

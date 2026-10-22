// v1.1 pause session: Pause freezes the session timer and, after reload, it
// stays frozen; Resume restarts it. Covers the refreshed-pause case from the
// plan's Review Focus (refresh during pause → frozen, not resumed).
import { expect, test } from "../fixtures.js";
import { fullSetup } from "../helpers.js";

test("33.1 pause freezes the session timer, reload keeps it frozen, resume restarts", async ({ page }) => {
  await fullSetup(page);
  const pill = page.getByTestId("session-timer");
  await expect(pill).toBeVisible();

  const read = () => pill.innerText().then((t) => t.trim());
  const before = await read();

  await page.getByTestId("btn-pause").click();
  await expect(page.getByTestId("btn-pause")).toHaveText("Resume");
  await expect(pill).toHaveText(before, { timeout: 2000 });

  // frozen: two reads 1.5s apart are equal
  await page.waitForTimeout(1500);
  const frozen1 = await read();
  await page.waitForTimeout(1500);
  await expect(pill).toHaveText(frozen1, { timeout: 2000 });

  // reload: still frozen at the same value (server-time freeze, not a client trick)
  await page.reload();
  await expect(page.getByTestId("btn-pause")).toHaveText("Resume");
  await expect(pill).toHaveText(frozen1, { timeout: 2000 });

  // resume: pill advances again
  await page.getByTestId("btn-pause").click();
  await expect(page.getByTestId("btn-pause")).toHaveText("Pause");
  await expect(pill).not.toHaveText(frozen1, { timeout: 4000 });
});

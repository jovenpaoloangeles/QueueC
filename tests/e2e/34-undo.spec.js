// v1.1 undo: a check-in and a match start are each reversible via the Undo
// button on the action's toast.
import { expect, test } from "../fixtures.js";
import { base, fullSetup, liveState, startDoubles } from "../helpers.js";

test("34.1 check-in undo removes the entry", async ({ page }) => {
  await fullSetup(page);
  const before = (await liveState(page)).queue.filter((e) => e.status === "waiting").length;

  // register-and-check-in a player not in fullSetup's default pool
  await page.getByTestId("checkin-toggle").click();
  await page.getByTestId("checkin-search").fill("Guest Undo");
  await page.getByTestId("register-new-player-prompt").getByRole("button", { name: "Add Player" }).click();
  await page.getByTestId("checkin-confirm-add").click();
  await expect(page.getByTestId("toast-undo")).toBeVisible();
  await page.getByTestId("toast-undo").click();
  await expect(page.getByTestId("toast")).toContainText("Undone");
  await expect
    .poll(async () => (await liveState(page)).queue.filter((e) => e.status === "waiting").length, {
      timeout: 5000,
    })
    .toBe(before);
});

test("34.2 match-start undo empties the court and frees the entries", async ({ page }) => {
  await fullSetup(page);
  const st = await liveState(page);
  const waitingBefore = st.queue.filter((e) => e.status === "waiting").length;
  // start the match in the UI so App's undoable toast fires
  await startDoubles(page);
  const match = (await liveState(page)).activeMatches[0];
  await expect(page.getByTestId("toast-undo")).toBeVisible();
  await page.getByTestId("toast-undo").click();
  await expect(page.getByTestId("toast")).toContainText("Undone");
  await expect
    .poll(async () => {
      const s = await liveState(page);
      return (
        s.activeMatches.filter((m) => m.id === match.id).length +
        s.queue.filter((e) => e.status === "waiting").length - waitingBefore
      );
    }, { timeout: 5000 })
    .toBe(0);
});

test("34.3 match-start undo after the match already ended says so", async ({ page }) => {
  await fullSetup(page);
  await startDoubles(page);
  const match = (await liveState(page)).activeMatches[0];
  await expect(page.getByTestId("toast-undo")).toBeVisible();
  // another client ends the match before the QM clicks Undo
  await page.request.fetch(`${base()}/api/matches/${match.id}/end`, {
    method: "PATCH",
    data: { team1_score: 21, team2_score: 5 },
  });
  await page.getByTestId("toast-undo").click();
  await expect(page.getByTestId("toast")).toContainText("Already ended");
  await expect(page.getByTestId("toast")).not.toContainText("Undone");
});

test("34.4 check-in undo after the entry is already removed says so", async ({ page }) => {
  await fullSetup(page);
  await page.getByTestId("checkin-toggle").click();
  await page.getByTestId("checkin-search").fill("Guest Undo");
  await page.getByTestId("register-new-player-prompt").getByRole("button", { name: "Add Player" }).click();
  await page.getByTestId("checkin-confirm-add").click();
  await expect(page.getByTestId("toast-undo")).toBeVisible();
  const entry = (await liveState(page)).queue.find((e) => e.name === "Guest Undo");
  // another client checks them out before the QM clicks Undo
  await page.request.fetch(`${base()}/api/queue/${entry.id}`, { method: "DELETE" });
  await page.getByTestId("toast-undo").click();
  await expect(page.getByTestId("toast")).toContainText("Already removed");
  await expect(page.getByTestId("toast")).not.toContainText("Undone");
});

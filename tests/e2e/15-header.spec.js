// tests/e2e/15-header.spec.js
import { expect, test } from "../fixtures.js";
import { base, checkinPlayers, createSession, startSession } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

test("15.1 session name in header (no parens → single line)", async ({ page }) => {
  await createSession(page, { name: "Header Test" });
  await checkinPlayers(page, ["Inter C1", "Inter C2"]);
  await startSession(page);
  // defensive path: no ' (' in the name → full name on the single name line, no date line
  const block = page.getByTestId("header-session-name");
  await expect(block).toBeVisible();
  await expect(block).toHaveText("HEADER TEST"); // name line only (uppercased), no date line
});

test("15.2 scheduled time range shown", async ({ page }) => {
  await createSession(page, { name: "Header Test", startTime: "19:00", hours: 2 });
  await checkinPlayers(page, ["Inter C1", "Inter C2"]);
  await startSession(page);
  // Time range format: HH:MM–HH:MM (scoped to header to avoid SetupScreen duplicate)
  await expect(page.locator('[data-testid="header-time-range"]')).toBeVisible();
});

test("15.6 session name renders on one line: ASTIRISK · date", async ({ page }) => {
  // empty name → server default "ASTIRISK (DD-Mon-YYYY)" → name + date on one line
  await createSession(page, { name: "" });
  await checkinPlayers(page, ["Inter C1", "Inter C2"]);
  await startSession(page);
  const block = page.getByTestId("header-session-name");
  await expect(block).toBeVisible();
  await expect(block).toContainText("ASTIRISK");
  await expect(block.locator("span").last()).toHaveText(/^ · \d{2}-[A-Z][a-z]{2}-\d{4}$/);
});

test("15.4 elapsed timer absent during setup", async ({ page }) => {
  await createSession(page, { name: "Header Test" });
  await expect(page.getByTestId("session-timer")).not.toBeVisible();
});

test("15.5 New Session button is gone; End Session is the only reset path", async ({ page }) => {
  await page.goto("/");
  await createSession(page);
  await checkinPlayers(page, ["Inter C1", "Inter C2"]);
  await startSession(page);
  // no ⟳ New Session in the header even while a session is live
  await expect(page.getByTestId("btn-new-session")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New Session" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "End Session" })).toBeVisible();
  // no + Add Player either — check-in lives in the queue panel now
  await expect(page.getByTestId("btn-add-player")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ Add Player" })).toHaveCount(0);
});

test("15.3 elapsed timer badge visible after session starts", async ({ page }) => {
  await createSession(page);
  await checkinPlayers(page, ["Inter C1", "Inter C2"]);
  await expect(page.getByTestId("session-timer")).toHaveCount(0); // not during setup
  await startSession(page);
  await expect(page.getByTestId("session-timer")).toBeVisible();
});

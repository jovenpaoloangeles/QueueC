// tests/e2e/24-app-wiring.spec.js — header Smart Match + theme wiring

import { execSync } from "node:child_process";
import { expect, test } from "../fixtures.js";
import {
  base,
  checkinPlayers,
  clickStartMatch,
  confirmStart,
  createSession,
  endMatch,
  startSession,
} from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

test("24.1 Smart Match with 4+ waiting slates to On Deck and toasts — nothing starts", async ({ page }) => {
  await createSession(page, { courts: 1 });
  await checkinPlayers(page, ["Inter C1", "Inter C2", "Inter C3", "Inter C4", "Expert E1", "Expert E2"]);
  await startSession(page);
  await page.getByTestId("btn-smart-match").click();
  await confirmStart(page);
  const toast = page.getByTestId("toast");
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(/On Deck/);
  // slate-first: the free court stays free, the lineup waits in On Deck
  await expect(page.getByTestId("on-deck-count")).toHaveText("1");
});

test("24.2 Smart Match with fewer than 4 waiting toasts a friendly message", async ({ page }) => {
  await createSession(page, { courts: 1 });
  await checkinPlayers(page, ["Inter C1", "Inter C2"]);
  await startSession(page);
  await page.getByTestId("btn-smart-match").click(); // a slate needs 4 — nothing to plan
  const toast = page.getByTestId("toast");
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(/Nothing to auto-match/);
  await expect(page.getByTestId("start-confirm-dialog")).toHaveCount(0);
});

test("24.4 hdr-longest uses net wait — leader leaves when they start; wait restarts after a match", async ({
  page,
  server,
}) => {
  await createSession(page, { courts: 1 });
  await checkinPlayers(page, ["Inter C1", "Inter C2", "Inter C3"]);
  await startSession(page);

  // A (Inter C1) has been "waiting" much longer than C3: backdate A's check-in
  // by 900s and C3's by only 60s (both still 'waiting', so SSE reflects it at
  // the next API mutation — the match start below).
  const pid = (name) => `(SELECT id FROM players WHERE name = '${name}')`;
  execSync(
    `sqlite3 ${server.dbPath} "UPDATE queue_entries SET checked_in_at = checked_in_at - 900 WHERE player_id = ${pid("Inter C1")}; UPDATE queue_entries SET checked_in_at = checked_in_at - 60 WHERE player_id = ${pid("Inter C3")}"`,
  );

  const longest = page.getByTestId("hdr-longest");
  // A checked in (backdated) earliest → initial leader
  await expect(longest).toContainText("Inter C1");
  const aName = "Inter C1";

  // A starts playing → they leave the waiting set → leader must hand off to C3
  await page.locator("[data-entry-id]").first().click();
  await page.locator("[data-entry-id]").nth(1).click();
  await clickStartMatch(page);
  await expect(longest).not.toContainText(aName);
  await expect(longest).toContainText("Inter C3");

  // The match ran ~900s, matching A's pre-match wait, so after the end A's
  // accumulated wait is fully offset: net wait restarts near 0:00.
  execSync(
    `sqlite3 ${server.dbPath} "UPDATE matches SET started_at = started_at - 900 WHERE ended_at IS NULL"`,
  );
  await endMatch(page, "Court");

  // A's wait pill restarted (net ≈ 0 despite huge raw wait)…
  const aCard = page.locator("[data-entry-id]").filter({ hasText: aName });
  await expect(aCard).toBeVisible();
  const badgeSecs = async (card) => {
    const m = (await card.locator('[data-testid="status-timer-badge"]').textContent())?.match(/(\d+):(\d+)/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
  };
  const aWait = await badgeSecs(aCard);
  const c3Wait = await badgeSecs(page.locator("[data-entry-id]").filter({ hasText: "Inter C3" }));
  expect(aWait).toBeLessThanOrEqual(5);
  expect(c3Wait).toBeGreaterThan(aWait + 30);
  // …and hdr-longest must show C3, NOT A: A's net wait reset below C3's.
  // (Raw check-in distance still favors A — that's the bug being fixed.)
  await expect(longest).toContainText("Inter C3");
  await expect(longest).not.toContainText(aName);
});

test("24.3 dark toggle flips <html>.dark and persists across reload", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await page.evaluate(() => localStorage.removeItem("queuec-theme"));
  await page.reload();
  await expect(html).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(html).toHaveClass(/dark/);
  await page.reload();
  await expect(html).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(html).not.toHaveClass(/dark/);
});

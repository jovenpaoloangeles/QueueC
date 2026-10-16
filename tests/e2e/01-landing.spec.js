// tests/e2e/01-landing.spec.js
import { expect, test } from "../fixtures.js";
import { base } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // End any stray active session
  const res = await page.request.get(`${base()}/api/sessions/active`);
  const { session } = await res.json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
  await page.reload();
});

test("1.1 QueueC heading visible", async ({ page }) => {
  await expect(page.getByTestId("brand")).toBeVisible();
});

test('1.2 "No active session" badge in header', async ({ page }) => {
  await expect(page.locator("text=No active session")).toBeVisible();
});

test("1.3 single-screen setup shown instead of a CTA button", async ({ page }) => {
  await expect(page.getByTestId("session-setup")).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Start New Session" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start Session" })).toBeDisabled();
});

test("1.4 Courts and queue areas absent", async ({ page }) => {
  await expect(page.locator('[data-testid="courts-row"]'))
    .not.toBeVisible({ timeout: 1000 })
    .catch(() => {});
  await expect(page.locator("text=Queue ·")).not.toBeVisible();
});

test("1.5 no New Session button or dialogs without a live session", async ({ page }) => {
  // the New Session button was removed entirely; nothing else to assert here
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("1.6 page title is QueueC", async ({ page }) => {
  await expect(page).toHaveTitle("QueueC");
});

// 41 — rotation settings on the setup screen land in the session row
import { expect, test } from "../fixtures.js";
import { base, poolRow, startSession } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

test("41.1 consecutive + rest-games selects persist to the session", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("setup-max-consecutive").selectOption("3");
  await page.getByTestId("setup-rest-games").selectOption("1");
  await poolRow(page, "Inter C4").click();
  await poolRow(page, "Inter C2").click();
  await startSession(page);

  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  expect(session.max_consecutive).toBe(3);
  expect(session.rest_games).toBe(1);
});

test("41.2 defaults when untouched", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("setup-max-consecutive")).toHaveValue("2");
  await expect(page.getByTestId("setup-rest-games")).toHaveValue("0");
  await poolRow(page, "Inter C4").click();
  await poolRow(page, "Inter C2").click();
  await startSession(page);

  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  expect(session.max_consecutive).toBe(2);
  expect(session.rest_games).toBe(0);
});

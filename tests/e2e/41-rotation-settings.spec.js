// 41 — rotation settings on the setup screen land in the session row
import { expect, test } from "../fixtures.js";
import { base, clickStartMatch, poolRow, startSession } from "../helpers.js";

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
  await expect(page.getByTestId("setup-points")).toHaveValue("31");
  await poolRow(page, "Inter C4").click();
  await poolRow(page, "Inter C2").click();
  await startSession(page);

  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  expect(session.max_consecutive).toBe(2);
  expect(session.rest_games).toBe(0);
});

test("41.3 points per game persists and presets the winner's score in the end-match form", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("setup-points").selectOption("21");
  for (const name of ["Inter C4", "Inter C2", "Inter C3", "Inter C1"]) await poolRow(page, name).click();
  await startSession(page);
  for (let i = 0; i < 4; i++) await page.locator("[data-entry-id]").nth(i).click();
  await clickStartMatch(page);
  await page.getByTestId("court-winner-1").first().click();
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  expect(session.points_to_win).toBe(21);
  await expect(page.getByLabel("Team 1 score")).toHaveValue("21"); // winner preset from the session
  await expect(page.getByLabel("Team 2 score")).toHaveValue(""); // the loser's score is still typed by hand
});

// Shuttle counting: starting a game counts 1 shuttle by default (before any
// match ends), and "+ New shuttle" bumps the total by 1 via the session-level
// extra. API-level counting + clamping live in server/routes/shuttles.test.js.
import { expect, test } from "../fixtures.js";
import { base, fullSetup, startDoubles } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
  await fullSetup(page);
});

test("32.1 a new game counts 1 shuttle by default", async ({ page }) => {
  const side = page.getByRole("complementary");
  await expect(side.getByTestId("shuttles-used")).toHaveText("0");
  await startDoubles(page);
  await expect(side.getByTestId("shuttles-used")).toHaveText("1");
});

test("32.2 + New shuttle bumps the total", async ({ page }) => {
  const side = page.getByRole("complementary");
  await startDoubles(page);
  await expect(side.getByTestId("shuttles-used")).toHaveText("1");
  await side.getByTestId("shuttle-add").click();
  await expect(side.getByTestId("shuttles-used")).toHaveText("2");
});

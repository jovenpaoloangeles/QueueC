import { expect, test } from "../fixtures.js";
import { base, endMatch, fullSetup, startDoubles } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
});

async function seededEndedSession(page) {
  await fullSetup(page);
  await startDoubles(page);
  await endMatch(page, "Court", { team1: 21, team2: 15 });
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
  return session.id;
}

test("47.1 session detail exports CSV and JSON", async ({ page }) => {
  const sid = await seededEndedSession(page);
  await page.goto(`/#/history/${sid}`);
  await expect(page.getByTestId("detail-lb-row").first()).toBeVisible();

  for (const [testid, name] of [
    ["export-csv", `session-${sid}-detail.csv`],
    ["export-json", `session-${sid}-detail.json`],
  ]) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId(testid).click(),
    ]);
    expect(download.suggestedFilename()).toBe(name);
  }
});

test("47.2 career page exports CSV and JSON", async ({ page }) => {
  const sid = await seededEndedSession(page);
  await page.goto(`/#/history/${sid}`);
  await page.getByTestId("detail-lb-row").first().getByRole("link").click();
  await expect(page).toHaveURL(/#\/players\/\d+/);
  const pid = (await page.url().match(/#\/players\/(\d+)/))[1];

  for (const [testid, name] of [
    ["export-csv", `player-${pid}-career.csv`],
    ["export-json", `player-${pid}-career.json`],
  ]) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId(testid).click(),
    ]);
    expect(download.suggestedFilename()).toBe(name);
  }
});

// tests/e2e/29-layout.spec.js — the bento/divider system is gone: one scrolling
// page, sticky sidebar, plain collapsible On Deck (nothing persisted).
import { expect, test } from "../fixtures.js";
import { base, fullSetup, liveState } from "../helpers.js";

test.beforeEach(async ({ page }) => {
  const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
  if (session) await page.request.fetch(`${base()}/api/sessions/${session.id}/end`, { method: "PATCH" });
  await fullSetup(page);
});

test("29.1 no dividers and no persisted layout storage", async ({ page }) => {
  await expect(page.getByTestId("divider-courts")).toHaveCount(0);
  await expect(page.getByTestId("divider-deck")).toHaveCount(0);
  await expect(page.getByTestId("divider-sidebar")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-entry-id]").first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("queuec-layout"))).toBeNull();
});

test("29.2 the sidebar does not scroll with the page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 400 }); // short window → page overflows
  await expect(page.locator("[data-entry-id]").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
  const before = await page.locator("aside").boundingBox();
  await page.evaluate(() => window.scrollTo(0, 100000));
  const after = await page.locator("aside").boundingBox();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  // sticky: the sidebar stays in place while the page content moves under it
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  expect(await page.locator("aside").evaluate((el) => el.scrollTop)).toBe(0);
});

test("29.3 On Deck collapses/expands — compact collapsed bar, nothing persisted", async ({ page }) => {
  // collapsed by default; the bar is one slim row (no reserved body space)
  await expect(page.getByTestId("ondeck-body")).toBeHidden();
  const collapsedH = (await page.getByTestId("on-deck-strip").boundingBox()).height;
  expect(collapsedH).toBeLessThanOrEqual(60);

  await page.getByTestId("ondeck-collapse").click();
  await expect(page.getByTestId("ondeck-body")).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-entry-id]").first()).toBeVisible();
  await expect(page.getByTestId("ondeck-body")).toBeHidden(); // back to the default — no persistence
});

test("29.4 courts sit tight under the header at natural height", async ({ page }) => {
  // regression (r7 item 3): no band chrome between the main padding and the cards
  const gap = await page.evaluate(() => {
    const main = document.querySelector("main");
    return main.firstElementChild.getBoundingClientRect().top - main.getBoundingClientRect().top;
  });
  expect(gap).toBeLessThanOrEqual(24); // main p-4 (16px) + sub-pixel slack, nothing else
  // natural height: no fixed band height clipping the cards
  const cards = await page.evaluate(() => {
    const grid = document.querySelector("main").firstElementChild;
    return {
      grid: grid.getBoundingClientRect().height,
      card: grid.firstElementChild.getBoundingClientRect().height,
    };
  });
  expect(cards.grid).toBeGreaterThanOrEqual(cards.card);
});

test("29.5 Smart Match fills the court slots for review — nothing starts, nothing waits in a dialog", async ({
  page,
}) => {
  await page.getByTestId("btn-smart-match").click();
  await expect(page.getByTestId("start-confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("toast")).toContainText("2 lineups ready on court");
  const st = await liveState(page);
  expect(st.activeMatches).toHaveLength(0);
  expect(st.slatedMatches).toHaveLength(0); // 8 players, 2 courts — nobody left for On Deck
});

test("29.6 the header stays one row at 1280px, even with a long name waiting longest", async ({ page }) => {
  // regression: a text "Hide skill" button, or a long full name in the
  // Longest chip, wrapped the header at 1280–1300px; the sidebar's sticky
  // offset (top-14) assumes one 56px row, so it slid under the header
  await page.setViewportSize({ width: 1280, height: 700 });
  // the longest waiter gets a long full name (the real roster has these)
  const { queue } = await liveState(page);
  const leader = queue.find((e) => e.name === "Inter C1");
  await page.request.fetch(`${base()}/api/players/${leader.player_id}`, {
    method: "PATCH",
    data: { name: "Maximiliano Bartholomew Escosio-Villanueva" },
  });
  await expect(page.getByTestId("hdr-longest")).toContainText("Maximiliano");
  await page.getByTestId("btn-hide-skill").click();
  const header = page.getByTestId("brand").locator("xpath=..");
  // the chip's timer keeps ticking; check across a few renders
  for (let i = 0; i < 3; i++) {
    expect((await header.boundingBox()).height).toBeLessThanOrEqual(57);
    await page.waitForTimeout(1000);
  }
});

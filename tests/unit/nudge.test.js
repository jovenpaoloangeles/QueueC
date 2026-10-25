// v1.1 idle-court nudge: nudgeKind fires only when a court is truly free and
// someone is waiting to use it — a staged slate wins over a bare queue.
import assert from "node:assert/strict";
import { freeCourts, IDLE_NUDGE_AFTER_SEC, nudgeKind } from "../../client/src/lib/utils.js";

const court = (id, over = {}) => ({ id, enabled: true, ...over });
const NOW = 10_000;

// U4.1 — staged slate on a free court → "staged"
{
  const courts = [court(1, { active_from: NOW - 60 }), court(2)];
  const free = freeCourts(courts, [{ court_number: 1 }], NOW);
  assert.equal(free.length, 1);
  assert.deepEqual(nudgeKind(courts, [{ court_number: 1 }], 1, 0, NOW), { kind: "staged" });
}

// U4.2 — staged beats waiting
assert.deepEqual(nudgeKind([court(1)], [], 1, 6, NOW), { kind: "staged" });

// U4.3 — no slate, only 3 waiting → null
assert.equal(nudgeKind([court(1)], [], 0, 3, NOW), null);

// U4.4 — no slate, ≥4 waiting → "waiting"
assert.deepEqual(nudgeKind([court(1)], [], 0, 4, NOW), { kind: "waiting" });

// U4.5 — expired court is not free
{
  const courts = [court(1, { expires_at: NOW - 1 })];
  assert.equal(nudgeKind(courts, [], 1, 0, NOW), null);
}

// U4.6 — match occupies the only court → null
assert.equal(nudgeKind([court(1)], [{ court_number: 1 }], 1, 0, NOW), null);

// U4.7 — disabled court is not free
assert.equal(nudgeKind([court(1, { enabled: false })], [], 1, 0, NOW), null);

// U4.8 — test override window.__IDLE_NUDGE_SEC__ respected by reading helper
{
  globalThis.window = { __IDLE_NUDGE_SEC__: 5 };
  const { idleNudgeSec } = await import("../../client/src/lib/utils.js");
  assert.equal(idleNudgeSec(), 5);
  delete globalThis.window;
  assert.equal(idleNudgeSec(), IDLE_NUDGE_AFTER_SEC);
}

console.log("nudge.test.js: all assertions passed");

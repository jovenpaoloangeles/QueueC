// Simulate the timer computation logic (extracted from hook for testability)
import { netWait } from "../lib/utils.js";

function computeTimers(serverTime, queue, activeMatches) {
  const waitSeconds = new Map();
  for (const e of queue ?? []) {
    if (e.status === "waiting") {
      waitSeconds.set(e.id, netWait(serverTime, e));
    }
  }
  const playSeconds = new Map();
  for (const m of activeMatches ?? []) {
    playSeconds.set(m.id, Math.max(0, serverTime - m.started_at));
  }
  return { waitSeconds, playSeconds };
}

const now = 1000;
const queue = [
  { id: 1, status: "waiting", checked_in_at: 400, total_seconds_played: 0 },
  { id: 2, status: "playing", checked_in_at: 300, total_seconds_played: 200 },
];
const matches = [{ id: 10, started_at: 900 }];

const { waitSeconds, playSeconds } = computeTimers(now, queue, matches);
console.assert(waitSeconds.get(1) === 600, `Expected 600, got ${waitSeconds.get(1)}`);
console.assert(!waitSeconds.has(2), "Playing player should not be in waitSeconds");
console.assert(playSeconds.get(10) === 100, `Expected 100, got ${playSeconds.get(10)}`);

// waitSeconds map: rest no longer pauses the clock (R7) — a vestigial
// rested_seconds field is ignored, so wait equals a same-check-in waiting player
const restedQueue = [
  { id: 3, status: "waiting", checked_in_at: 400, total_seconds_played: 0, rested_seconds: 100 },
];
console.assert(
  computeTimers(now, restedQueue, []).waitSeconds.get(3) === 600,
  `Expected 600, got ${computeTimers(now, restedQueue, []).waitSeconds.get(3)}`,
);

// netWait: playing time is subtracted so a finished player's wait restarts
console.assert(
  netWait(1000, { checked_in_at: 400, total_seconds_played: 500 }) === 100,
  "netWait subtracts total_seconds_played",
);
console.assert(netWait(1000, { checked_in_at: 400 }) === 600, "netWait defaults total_seconds_played to 0");
console.assert(netWait(1000, { checked_in_at: 900, total_seconds_played: 500 }) === 0, "netWait clamps at 0");
console.assert(netWait(1000, {}) === 0, "netWait without checked_in_at is 0");

console.log("useTimers.test.js: all assertions passed");

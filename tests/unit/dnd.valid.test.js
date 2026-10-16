import assert from "node:assert/strict";
import { valid } from "../../client/src/lib/dnd.js";

const waiting = { kind: "player", entryId: 1, status: "waiting" };
const playing = { kind: "player", entryId: 2, status: "playing" };
const resting = { kind: "player", entryId: 3, status: "resting" };
const team = { kind: "team", matchId: 1, side: 1 };

// U1.1–U1.3 court zone
assert.equal(valid("court", waiting), true, "U1.1 court accepts waiting");
assert.equal(valid("court", playing), false, "U1.2 court rejects playing");
assert.equal(valid("court", resting), false, "U1.3 court rejects resting");

// U1.4–U1.5 resting zone was removed (cd73f31) — resting is now a queue tab
assert.equal(valid("resting", waiting), false, "U1.4 resting zone no longer exists");

// U1.6–U1.7 queue zone
assert.equal(valid("queue", playing), true, "U1.6 queue accepts playing");
assert.equal(valid("queue", waiting), true, "U1.7 queue accepts waiting");

// U1.8–U1.9 team zone
assert.equal(valid("team", team), true, "U1.8 team accepts team payload");
assert.equal(valid("team", waiting), false, "U1.9 team rejects player payload");

// U1.10–U1.12 slot zone (lineup slots take waiting AND resting players)
assert.equal(valid("slot", waiting), true, "U1.10 slot accepts waiting");
assert.equal(valid("slot", resting), true, "U1.11 slot accepts resting (pull from rest)");
assert.equal(valid("slot", team), false, "U1.12 slot rejects team payload");

// U1.13 unknown zone
assert.equal(valid("unknown", waiting), false, "U1.13 unknown zone → false");

// U1.14 null payload
for (const zone of ["court", "resting", "queue", "team", "slot"]) {
  assert.equal(valid(zone, null), false, `U1.14 ${zone} null → false`);
}

console.log("dnd.valid.test.js: all assertions passed ✓");

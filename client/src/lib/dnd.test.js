import assert from "node:assert/strict";
import { moveBefore, rearrange } from "./dnd.js";

// --- rearrange: full team swap ---
assert.deepEqual(rearrange({ team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: 4 }, 1, 2), {
  team1_p1: 3,
  team1_p2: 4,
  team2_p1: 1,
  team2_p2: 2,
});
assert.deepEqual(rearrange({ team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: 4 }, 2, 1), {
  team1_p1: 3,
  team1_p2: 4,
  team2_p1: 1,
  team2_p2: 2,
});

// --- rearrange: single-player slot swap (same slot index) ---
assert.deepEqual(rearrange({ team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: 4 }, 1, 2, 1), {
  team1_p1: 3,
  team1_p2: 2,
  team2_p1: 1,
  team2_p2: 4,
});
assert.deepEqual(rearrange({ team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: 4 }, 1, 2, 2), {
  team1_p1: 1,
  team1_p2: 4,
  team2_p1: 3,
  team2_p2: 2,
});

// --- rearrange: single-player swap leaving null behind ---
assert.deepEqual(rearrange({ team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: null }, 1, 2, 2), {
  team1_p1: 1,
  team1_p2: null,
  team2_p1: 3,
  team2_p2: 2,
});

// --- rearrange: same-side is identity ---
assert.deepEqual(rearrange({ team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: 4 }, 1, 1), {
  team1_p1: 1,
  team1_p2: 2,
  team2_p1: 3,
  team2_p2: 4,
});
assert.deepEqual(rearrange({ team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: 4 }, 2, 2, 3), {
  team1_p1: 1,
  team1_p2: 2,
  team2_p1: 3,
  team2_p2: 4,
});

// --- moveBefore ---
// drag before target: 1 dropped on 3 → 1 sits immediately before 3
assert.deepEqual(moveBefore([1, 2, 3], 1, 3), [2, 1, 3]);
// drag after target: 3 dropped on 1
assert.deepEqual(moveBefore([1, 2, 3], 3, 1), [3, 1, 2]);
// drag onto itself: identity
assert.deepEqual(moveBefore([1, 2, 3], 2, 2), [1, 2, 3]);
// drag of an unknown id: unchanged
assert.deepEqual(moveBefore([1, 2, 3], 9, 2), [1, 2, 3]);
// pure: input untouched
const orig = [1, 2, 3];
moveBefore(orig, 1, 3);
assert.deepEqual(orig, [1, 2, 3]);

console.log("dnd.test.js: all assertions passed");

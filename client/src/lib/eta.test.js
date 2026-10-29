import assert from "node:assert/strict";
import { TYPICAL_GAME_SEC as T, waitEtas } from "./eta.js";

const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9];
// a free court, nothing on deck: first four go now, next four one game later
let e = waitEtas({ waitingIds: ids, slates: 0, usableCourts: 1, freeNow: true });
assert.deepEqual([e.get(1), e.get(4), e.get(5), e.get(9)], [0, 0, T, 2 * T]);
// two courts busy, one slate ahead, next court free in 5 min
e = waitEtas({ waitingIds: ids, slates: 1, usableCourts: 2, freeNow: false, nextFreeSecs: 300 });
assert.deepEqual([e.get(1), e.get(5), e.get(9)], [300, 300 + T, 300 + T]);
// no usable court: no estimates at all
assert.equal(waitEtas({ waitingIds: ids, slates: 0, usableCourts: 0, freeNow: false }).size, 0);
console.log("eta.test.js: all assertions passed");

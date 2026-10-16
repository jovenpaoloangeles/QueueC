import assert from "node:assert/strict";
import { alphabeticalSortOrder, assignSortOrder, normalizeOrder } from "./queue.js";

// new entry goes to the end of an already-ordered session
assert.equal(assignSortOrder([3, 1, 4]), 5);

// empty session starts at 1
assert.equal(assignSortOrder([]), 1);

// "C" slots between waiting B and D — lands on D's sort_order (D shifts down)
assert.equal(
  alphabeticalSortOrder(
    [
      { name: "B", sort_order: 1 },
      { name: "D", sort_order: 2 },
    ],
    "C",
  ),
  2,
);

// "A" slots before everything
assert.equal(
  alphabeticalSortOrder(
    [
      { name: "B", sort_order: 1 },
      { name: "C", sort_order: 2 },
      { name: "D", sort_order: 3 },
    ],
    "A",
  ),
  1,
);

// after all waiting entries → null (append at session end)
assert.equal(alphabeticalSortOrder([{ name: "B", sort_order: 1 }], "C"), null);
assert.equal(alphabeticalSortOrder([], "A"), null);

// case-insensitive
assert.equal(alphabeticalSortOrder([{ name: "b", sort_order: 1 }], "A"), 1);
assert.equal(alphabeticalSortOrder([{ name: "ALICE", sort_order: 1 }], "bob"), null);

// duplicate name: new entry goes after the existing one
assert.equal(
  alphabeticalSortOrder(
    [
      { name: "B", sort_order: 1 },
      { name: "D", sort_order: 2 },
    ],
    "B",
  ),
  2,
);

// duplicate and foreign ids dropped; result is a total order of the allowed set
assert.deepEqual(normalizeOrder([4, 4, 1, 9], [1, 4]), [4, 1]);

// well-formed list passes through
assert.deepEqual(normalizeOrder([1, 2, 3], [1, 2, 3]), [1, 2, 3]);

console.log("queue.test.js: all assertions passed");

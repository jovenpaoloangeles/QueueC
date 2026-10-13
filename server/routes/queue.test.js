import assert from 'node:assert/strict'
import { assignSortOrder, normalizeOrder } from './queue.js'

// new entry goes to the end of an already-ordered session
assert.equal(assignSortOrder([3, 1, 4]), 5)

// empty session starts at 1
assert.equal(assignSortOrder([]), 1)

// duplicate and foreign ids dropped; result is a total order of the allowed set
assert.deepEqual(normalizeOrder([4, 4, 1, 9], [1, 4]), [4, 1])

// well-formed list passes through
assert.deepEqual(normalizeOrder([1, 2, 3], [1, 2, 3]), [1, 2, 3])

console.log('queue.test.js: all assertions passed')

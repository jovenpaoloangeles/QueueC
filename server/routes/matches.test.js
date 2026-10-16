import assert from "node:assert/strict";
import { validateTeamSlots } from "./matches.js";

// doubles match: entries 1,2,3,4 on court — full team swap
assert.deepEqual(validateTeamSlots({ team1_p1: 3, team1_p2: 4, team2_p1: 1, team2_p2: 2 }, [1, 2, 3, 4]), {
  ok: true,
  value: { team1_p1: 3, team1_p2: 4, team2_p1: 1, team2_p2: 2 },
});

// move one player between teams, singles-shaped
assert.deepEqual(validateTeamSlots({ team1_p1: 1, team1_p2: null, team2_p1: 3, team2_p2: null }, [1, 3]), {
  ok: true,
  value: { team1_p1: 1, team1_p2: null, team2_p1: 3, team2_p2: null },
});

// outsider rejected
assert.equal(
  validateTeamSlots({ team1_p1: 9, team1_p2: 2, team2_p1: 3, team2_p2: 4 }, [1, 2, 3, 4]).ok,
  false,
);

// duplicate rejected
assert.equal(
  validateTeamSlots({ team1_p1: 1, team1_p2: 1, team2_p1: 3, team2_p2: 4 }, [1, 2, 3, 4]).ok,
  false,
);

// missing primary rejected
assert.equal(
  validateTeamSlots({ team1_p1: null, team1_p2: 2, team2_p1: 3, team2_p2: 4 }, [1, 2, 3, 4]).ok,
  false,
);

// changed membership rejected — dropping someone is a different operation
assert.equal(
  validateTeamSlots({ team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: 5 }, [1, 2, 3, 4]).ok,
  false,
);

// a drop into a null slot is not a rearrangement
assert.equal(
  validateTeamSlots({ team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: null }, [1, 2, 3, 4]).ok,
  false,
);

console.log("matches.test.js: all assertions passed");

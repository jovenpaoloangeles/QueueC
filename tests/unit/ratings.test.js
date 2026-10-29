// v1.7 rating model (server/logic/ratings.js): margins move ratings the right
// way, uncertainty shrinks with games, form is per session, bad rows are skipped.
import assert from "node:assert/strict";
import { computeRatings } from "../../server/logic/ratings.js";

const skill = { 1: "beginner", 2: "intermediate", 3: "intermediate", 4: "intermediate" };
const skillOf = (pid) => skill[pid];
const game = (session, t, s1, s2) => ({
  session_id: session,
  started_at: t,
  team1: [1, 2],
  team2: [3, 4],
  team1_score: s1,
  team2_score: s2,
});

// a "beginner" who keeps winning big alongside an intermediate is underrated
const wins = Array.from({ length: 8 }, (_, i) => game(1, i, 31, 15));
const r = computeRatings(wins, skillOf, 1);
assert.ok(r.get(1).mu > 2.5, `beginner should climb, got μ=${r.get(1).mu.toFixed(2)}`);
assert.ok(r.get(3).mu < 4, "the losers drop");
assert.ok(r.get(1).sigma < 0.75, "uncertainty shrinks with games");
assert.ok(Math.abs(r.get(1).form) <= 1, "form offset is capped at one tier");
assert.equal(r.get(1).games, 8);

// form is tonight only: a later session starts it at 0 and widens σ
const next = computeRatings([...wins, game(2, 100, 20, 31)], skillOf, 2);
const cur = computeRatings(wins, skillOf, 2);
assert.equal(cur.get(1).form, 0, "a session the player hasn't played in has no form");
assert.ok(next.get(1).sigma > r.get(1).sigma * 0.9, "σ loosens across sessions");

// unscored / zero rows are ignored; unknown players start at their tier
const none = computeRatings([{ ...game(1, 0, null, null) }, { ...game(1, 1, 0, 0) }], skillOf, 1);
assert.equal(none.size, 0);
console.log("ratings.test.js: all assertions passed");

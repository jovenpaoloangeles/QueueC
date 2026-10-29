import assert from "node:assert/strict";
import { buildRecap } from "./recap.js";

const detail = {
  session: { name: "ASTIRISK (29-Oct-2026)" },
  leaderboard: [
    { name: "Ana", played: 3, wins: 3, losses: 0, win_rate: 100 },
    { name: "Ben", played: 5, wins: 2, losses: 3, win_rate: 40 },
  ],
  games: [
    { state: "active", ended_at: 2 },
    { state: "active", ended_at: null }, // still on court: not counted
    { state: "aborted", ended_at: 3 },
  ],
  attendance: [{ player_id: 1 }, { player_id: 2 }, { player_id: 2 }],
  shuttles: { total: 4 },
  highlights: {
    win_streaks: [{ name: "Ana", streak: 3 }],
    milestones: [{ name: "Ben", game: 100 }],
    attendance_streaks: [{ name: "Ana", streak: 5 }],
  },
};

assert.equal(
  buildRecap(detail),
  [
    "🏸 ASTIRISK (29-Oct-2026)",
    "2 players · 1 games · 4 shuttles",
    "🏆 Top: Ana (3-0, 100%)",
    "🎽 Most games: Ben (5)",
    "🔥 Ana: 3 wins in a row",
    "🎉 Ben: game #100",
    "📅 Ana: 5 sessions in a row",
  ].join("\n"),
);
assert.equal(
  buildRecap({ ...detail, leaderboard: [], games: [], attendance: [], highlights: undefined }),
  "🏸 ASTIRISK (29-Oct-2026)\n0 players · 0 games · 4 shuttles",
);
console.log("recap.test.js: all assertions passed");

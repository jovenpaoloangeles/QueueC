// v1.2 smarter matching: engine-level regression tests for planBatch.
import assert from "node:assert/strict";
import { planBatch } from "../../server/logic/smartQueue.js";

const T0 = 1_800_000_000, GAME = 720;

// U5.1 — wave crossover: 16 players / 2 courts must mix the first-8 and
// last-8 waves instead of alternating them forever (0% mixed = regression).
{
  const players = Array.from({ length: 16 }, (_, i) => ({
    id: i + 1, status: "waiting", skill_level: "intermediate",
    checked_in_at: T0, last_played_at: null, total_seconds_played: 0, games_played: 0,
  }));
  const history = [];
  const wave = new Map();
  let mixed = 0, total = 0;
  for (let r = 0; r < 12; r++) {
    const now = T0 + r * GAME;
    const plan = planBatch({ waiting: players, history, courtCount: 2, now });
    for (const m of plan.matches) {
      const q = [...m.team1, ...m.team2];
      if (wave.size >= 16) {
        const sets = new Set(q.map((id) => wave.get(id)));
        total++;
        if (sets.size === 2) mixed++;
      }
      for (const id of q) if (!wave.has(id)) wave.set(id, wave.size < 8 ? "A" : "B");
      history.push({ team1: [q[0], q[1]], team2: [q[2], q[3]], started_at: now, ended_at: now + GAME });
      for (const id of q) {
        const p = players.find((x) => x.id === id);
        p.games_played++;
        p.last_played_at = now + GAME;
      }
    }
  }
  assert.ok(total >= 16, `expected a full session, got ${total} post-wave quartets`);
  assert.ok(mixed >= 4, `wave crossover: expected ≥4 mixed quartets of ${total}, got ${mixed}`);
}

console.log("smartqueue.test.js: all assertions passed");

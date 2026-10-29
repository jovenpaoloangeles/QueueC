// v1.2 smarter matching: engine-level regression tests for planBatch.
import assert from "node:assert/strict";
import { planBatch } from "../../server/logic/smartQueue.js";

const T0 = 1_800_000_000,
  GAME = 720;

// U5.1 — wave crossover: 16 players / 2 courts must mix the first-8 and
// last-8 waves instead of alternating them forever (0% mixed = regression).
{
  const players = Array.from({ length: 16 }, (_, i) => ({
    id: i + 1,
    status: "waiting",
    skill_level: "intermediate",
    checked_in_at: T0,
    last_played_at: null,
    total_seconds_played: 0,
    games_played: 0,
  }));
  const history = [];
  const wave = new Map();
  let mixed = 0,
    total = 0;
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

// U5.2 — rest_games: a player in the most recent completed match is benched
// until N later matches have finished. P1–4 last played in entry 0 (one entry
// since → rested enough); P5 played in entry 1, the latest (0 since → benched).
{
  const restNow = T0 + 40 * 720;
  const restPlayers = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    status: "waiting",
    skill_level: "intermediate",
    checked_in_at: T0,
    last_played_at: null,
    total_seconds_played: 0,
    games_played: 0,
  }));
  const restHistory = [
    { team1: [1, 2], team2: [3, 4], started_at: T0, ended_at: T0 + 300 },
    { team1: [5, 90], team2: [91, 92], started_at: T0 + 400, ended_at: T0 + 700 },
  ];
  const restedPlan = planBatch({
    waiting: restPlayers,
    history: restHistory,
    courtCount: 1,
    now: restNow,
    cfg: { restGames: 1 },
  });
  const restedIds = restedPlan.matches[0]
    ? [...restedPlan.matches[0].team1, ...restedPlan.matches[0].team2]
    : [];
  assert.ok(!restedIds.includes(5), `rest_games=1 must bench P5 (played last round), got [${restedIds}]`);
  assert.equal(restedPlan.matches.length, 1, "P1–4 are rested enough and must field");

  // U5.3 — graceful relax overrides rest: exactly 4 players, all in the latest
  // entry, rest_games=1 → 0 eligible → relax still fields a game.
  const relaxHistory = [{ team1: [1, 2], team2: [3, 4], started_at: T0, ended_at: T0 + 300 }];
  const relaxPlan = planBatch({
    waiting: restPlayers.slice(0, 4),
    history: relaxHistory,
    courtCount: 1,
    now: restNow,
    cfg: { restGames: 1 },
  });
  assert.ok(relaxPlan.matches.length === 1, "relax must field a game when only 4 are available");
}

// U5.4 — locked: planner returns exactly one quartet containing both locked
// players, even when they sit outside the top-K priority window. 18 players,
// courtCount 3 → kTarget 16 → the priority slice cuts ids 1–2 (latest check-in
// → smallest wait → bottom of π), and only the post-slice locked union brings
// them back.
{
  const lockNow = T0 + 20 * 1000;
  const lockPlayers = Array.from({ length: 18 }, (_, i) => ({
    id: i + 1,
    status: "waiting",
    skill_level: "intermediate",
    checked_in_at: T0 + i * 1000,
    last_played_at: null,
    total_seconds_played: 0,
    games_played: 0,
  })); // ids 17,18 checked in last → smallest wait → outside the top-16 window
  const lockPlan = planBatch({
    waiting: lockPlayers,
    history: [],
    courtCount: 3,
    now: lockNow,
    locked: [17, 18],
  });
  assert.equal(
    lockPlan.matches.length,
    1,
    `locked plans exactly one quartet, got ${lockPlan.matches.length}`,
  );
  const lockIds = [...lockPlan.matches[0].team1, ...lockPlan.matches[0].team2];
  assert.ok(
    lockIds.includes(17) && lockIds.includes(18),
    `locked ids must be in the quartet, got [${lockIds}]`,
  );

  // U5.5 — locked + impossible containment → no matches, no crash.
  const impossible = planBatch({
    waiting: lockPlayers.slice(0, 3),
    history: [],
    courtCount: 1,
    now: lockNow,
    locked: [17, 18],
  });
  assert.deepEqual(impossible.matches, []);
}

// U6.1 — joint wait band: courts finishing together must both be filled. The
// ε₁ wait band is measured against the single best quartet, so when < 8 players
// hold the long waits every survivor shares them and only one disjoint quartet
// was left (review 2026-10-29: 4 of 12 rounds idled a court).
{
  const players = Array.from({ length: 16 }, (_, i) => ({
    id: i + 1,
    status: "waiting",
    skill_level: "intermediate",
    checked_in_at: T0,
    last_played_at: null,
    total_seconds_played: 0,
    games_played: 0,
  }));
  const history = [];
  let now = T0;
  const short = [];
  for (let round = 0; round < 12; round++) {
    const waiting = players.filter((p) => p.status === "waiting");
    const plan = planBatch({ waiting, history, courtCount: 2, now });
    if (plan.matches.length < 2) short.push(round);
    for (const m of plan.matches) {
      const q = [...m.team1, ...m.team2];
      history.push({ team1: m.team1, team2: m.team2, started_at: now, ended_at: now + 840 });
      for (const id of q) {
        const p = players[id - 1];
        p.games_played++;
        p.last_played_at = now + 840;
        p.total_seconds_played += 840;
      }
    }
    now += 840;
  }
  assert.deepEqual(short, [], `every synchronized round must fill both courts; short rounds: ${short}`);
}

// U6.2 — phase-lock kick. 16 equal players on 2 courts with near-identical
// game lengths (14 min ± 1, seeded) lock into two rotation cohorts that never
// meet — 0 cohort-mixed games all night without the kick (review probe,
// 2026-10-29). With it, the cohorts cross repeatedly and both courts stay full.
{
  const { cohortLocked } = await import("../../server/logic/smartQueue.js");
  const nightOf = (cfg) => {
    let s = 1;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const P = Array.from({ length: 16 }, (_, i) => ({
      id: i + 1,
      status: "waiting",
      skill_level: "intermediate",
      checked_in_at: T0,
      last_played_at: null,
      total_seconds_played: 0,
      games_played: 0,
    }));
    const live = [];
    const history = [];
    let now = T0;
    while (now < T0 + 180 * 60) {
      live.sort((a, b) => a.ends - b.ends);
      while (live.length && live[0].ends <= now) {
        const g = live.shift();
        for (const id of [...g.team1, ...g.team2]) {
          Object.assign(P[id - 1], { status: "waiting", last_played_at: g.ends });
          P[id - 1].games_played++;
        }
        history.push({ team1: g.team1, team2: g.team2, started_at: g.started_at, ended_at: g.ends });
      }
      const free = 2 - live.length;
      if (free > 0) {
        const plan = planBatch({
          waiting: P.filter((p) => p.status === "waiting"),
          history,
          courtCount: free,
          now,
          cfg,
        });
        for (const m of plan.matches.slice(0, free)) {
          for (const id of [...m.team1, ...m.team2]) P[id - 1].status = "playing";
          live.push({ ...m, started_at: now, ends: now + Math.round((14 + (rnd() * 2 - 1)) * 60) });
        }
      }
      now = live.length ? Math.min(...live.map((g) => g.ends)) : now + 30;
    }
    const first = new Set(history.slice(0, 2).flatMap((m) => [...m.team1, ...m.team2]));
    const crossed = history.filter((m) => {
      const a = [...m.team1, ...m.team2].filter((id) => first.has(id)).length;
      return a > 0 && a < 4;
    }).length;
    return { crossed, games: history.length, history };
  };
  const off = nightOf({ mixKick: false });
  assert.equal(off.crossed, 0, "precondition: without the kick the cohorts never meet");
  assert.equal(cohortLocked(off.history), true, "the detector sees the lock");
  const on = nightOf({});
  assert.ok(on.crossed >= 8, `kick: cohorts must cross repeatedly, got ${on.crossed}`);
  assert.ok(on.games >= off.games, `kick must not idle courts (${on.games} vs ${off.games} games)`);
}

console.log("smartqueue.test.js: all assertions passed");

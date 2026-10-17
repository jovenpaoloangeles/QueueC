// Run with: bun server/logic/smartQueue.test.js (pure engine — no server needed)
import { suggestPlayers, planBatch, consecutiveCounts } from "./smartQueue.js";

const now = Math.floor(Date.now() / 1000);

const entries = [
  {
    id: 1,
    status: "waiting",
    skill_level: "intermediate",
    checked_in_at: now - 600,
    total_seconds_played: 0,
  },
  { id: 2, status: "waiting", skill_level: "beginner", checked_in_at: now - 500, total_seconds_played: 0 },
  { id: 3, status: "waiting", skill_level: "advanced", checked_in_at: now - 400, total_seconds_played: 0 },
  {
    id: 4,
    status: "waiting",
    skill_level: "intermediate",
    checked_in_at: now - 300,
    total_seconds_played: 0,
  },
  {
    id: 5,
    status: "playing",
    skill_level: "intermediate",
    checked_in_at: now - 999,
    total_seconds_played: 0,
  },
];

// Singles: top 2 waiters (ids 1, 2)
const singles = suggestPlayers(entries, "singles");
console.assert(singles.length === 4, "singles should return 4 slots");
console.assert(singles[0] === 1 && singles[2] === 2, `Expected ids 1,2 got ${singles}`);
console.assert(singles[1] === null && singles[3] === null, "singles p2 slots should be null");

// Doubles: 4 players suggested, none playing
const doubles = suggestPlayers(entries, "doubles");
console.assert(doubles.length === 4, "doubles should return 4 ids");
console.assert(!doubles.includes(5), "playing player should not be suggested");

// Not enough players
const short = suggestPlayers(entries.slice(0, 1), "singles");
console.assert(short.length === 0, "should return [] when not enough players");

// Weak-link split: a=10 (prof, skill 7), b/c=11,12 (inter, 4), d=13 (newbie, 1)
// Weak-link rating R(7,1)=2.9 vs R(4,4)=4.0 → Δ0.9 beats any 7+4 vs 4+1 split
const splitEntries = [
  {
    id: 10,
    status: "waiting",
    skill_level: "professional",
    checked_in_at: now - 600,
    total_seconds_played: 0,
    games_played: 0,
  },
  {
    id: 11,
    status: "waiting",
    skill_level: "intermediate",
    checked_in_at: now - 500,
    total_seconds_played: 0,
    games_played: 0,
  },
  {
    id: 12,
    status: "waiting",
    skill_level: "intermediate",
    checked_in_at: now - 400,
    total_seconds_played: 0,
    games_played: 0,
  },
  {
    id: 13,
    status: "waiting",
    skill_level: "newbie",
    checked_in_at: now - 300,
    total_seconds_played: 0,
    games_played: 0,
  },
];
const splitRes = suggestPlayers(splitEntries, "doubles");
console.assert(
  (splitRes[0] === 10 && splitRes[1] === 13) || (splitRes[2] === 10 && splitRes[3] === 13),
  `Expected weak-link pairing (10+13 vs 11+12), got ${splitRes}`,
);

// Fairness: 3-game player 20 yields — participation-fairness band keeps only
// 0-game quartets even though his raw wait is longest
const fairnessEntries = [
  { id: 20, status: "waiting", skill_level: "intermediate", checked_in_at: now - 400, total_seconds_played: 0, games_played: 3 },
  { id: 21, status: "waiting", skill_level: "intermediate", checked_in_at: now - 350, total_seconds_played: 0, games_played: 0 },
  { id: 22, status: "waiting", skill_level: "intermediate", checked_in_at: now - 340, total_seconds_played: 0, games_played: 0 },
  { id: 23, status: "waiting", skill_level: "intermediate", checked_in_at: now - 330, total_seconds_played: 0, games_played: 0 },
  { id: 24, status: "waiting", skill_level: "intermediate", checked_in_at: now - 320, total_seconds_played: 0, games_played: 0 },
];
const fairRes = suggestPlayers(fairnessEntries, "doubles");
console.assert(
  !fairRes.includes(20),
  `Expected player 20 (3 games played) to yield to 0-game players, got ${fairRes}`,
);

// Rest no longer pauses wait (R7): a vestigial rested_seconds field is ignored,
// so the earlier check-in wins on raw wait
const restEntries = [
  { id: 30, status: "waiting", skill_level: "intermediate", checked_in_at: now - 500, total_seconds_played: 0, games_played: 0 },
  { id: 31, status: "waiting", skill_level: "intermediate", checked_in_at: now - 600, total_seconds_played: 0, games_played: 0, rested_seconds: 300 },
  { id: 32, status: "waiting", skill_level: "intermediate", checked_in_at: now - 400, total_seconds_played: 0, games_played: 0 },
  { id: 33, status: "waiting", skill_level: "intermediate", checked_in_at: now - 300, total_seconds_played: 0, games_played: 0 },
];
const restRes = suggestPlayers(restEntries, "singles");
console.assert(
  restRes[0] === 31,
  `Expected 31 (checked in 600s ago, rested_seconds ignored) to take slot 1, got ${restRes}`,
);

// --- planBatch (two-stage ε-lexicographic engine) ---

const mk = (id, waitMin, skill = "intermediate", extra = {}) => ({
  id,
  status: "waiting",
  skill_level: skill,
  checked_in_at: now - waitMin * 60,
  total_seconds_played: 0,
  games_played: 0,
  ...extra,
});
const rosters = (m) => [m.team1, m.team2];
const partners = (m, a, b) =>
  rosters(m).some((t) => t.includes(a) && t.includes(b));

// Consecutive-game rest limit: players 1,2,5,6 played the last 2 games
// straight → ineligible; the quartet comes from the fresh 3,4,7,8
const consecPool = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => mk(i, 10));
const consecHist = [
  { team1: [1, 2], team2: [5, 6] },
  { team1: [1, 2], team2: [5, 6] },
];
console.assert(
  consecutiveCounts(consecHist).get(1) === 2,
  "trailing streak should count 2",
);
const consecRes = planBatch({ waiting: consecPool, history: consecHist, now });
const consecIds = consecRes.matches.flatMap((m) => [...m.team1, ...m.team2]);
console.assert(
  !consecIds.some((i) => [1, 2, 5, 6].includes(i)),
  `consecutive-limited players must sit out, got ${consecIds}`,
);

// Relaxation: only one fresh player left → limit is relaxed, flag set
const relaxPool = [1, 2, 3, 4, 5].map((i) => mk(i, 10));
const relaxHist = [
  { team1: [1, 2], team2: [3, 4] },
  { team1: [1, 2], team2: [3, 4] },
];
const relaxRes = planBatch({ waiting: relaxPool, history: relaxHist, now });
console.assert(relaxRes.relaxed === true, "consecutive limit should relax when pool < 4");
console.assert(relaxRes.matches.length === 1, "relaxed plan still produces a match");

// Social variety: (1,2) and (3,4) just partnered → both pairs split up
const varietyPool = [1, 2, 3, 4, 5].map((i) => mk(i, 10));
const varietyHist = [{ team1: [1, 2], team2: [3, 4] }];
const varietyRes = planBatch({ waiting: varietyPool, history: varietyHist, now });
const vMatch = varietyRes.matches[0];
console.assert(
  !partners(vMatch, 1, 2) && !partners(vMatch, 3, 4),
  `repeat partnerships avoided, got ${JSON.stringify(vMatch)}`,
);

// Late-arrival virtual offset: the latecomer (0 real games, median offset 4)
// counts as caught-up, so they no longer jump the queue — without the offset
// their g_virt of 0 would make quartet {1,2,3,5} win on participation fairness
const lateBase = [
  mk(1, 30, "intermediate", { games_played: 4 }),
  mk(2, 30, "intermediate", { games_played: 4 }),
  mk(3, 30, "intermediate", { games_played: 4 }),
  mk(4, 30, "intermediate", { games_played: 4 }),
];
const lateRes = planBatch({
  waiting: [...lateBase, mk(5, 30, "intermediate", { games_played: 0, virt_offset: 4 })],
  now,
});
const lateIds = lateRes.matches.flatMap((m) => [...m.team1, ...m.team2]);
console.assert(
  !lateIds.includes(5),
  `latecomer with median offset 4 is caught up and must not jump the queue, got ${lateIds}`,
);
const noOffsetRes = planBatch({
  waiting: [...lateBase, mk(5, 30, "intermediate")],
  now,
});
const noOffsetIds = noOffsetRes.matches.flatMap((m) => [...m.team1, ...m.team2]);
console.assert(
  noOffsetIds.includes(5),
  `without the offset the 0-game latecomer is prioritised, got ${noOffsetIds}`,
);

// Multi-court: 8 equal players, 2 courts → two disjoint quartets
const multiPool = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => mk(i, 10));
const multiRes = planBatch({ waiting: multiPool, courtCount: 2, now });
console.assert(multiRes.matches.length === 2, "two courts → two matches");
const allIds = multiRes.matches.flatMap((m) => [...m.team1, ...m.team2]);
console.assert(new Set(allIds).size === 8, "multi-court quartets must be disjoint");

// Hard ban: banning (1,2) as partners forces them apart
const banPool = [mk(1, 10, "professional"), mk(2, 9, "newbie"), mk(3, 8), mk(4, 7)];
const banRes = planBatch({ waiting: banPool, bans: [[1, 2]], now });
const bMatch = banRes.matches[0];
console.assert(
  !partners(bMatch, 1, 2),
  `banned pair must not partner, got ${JSON.stringify(bMatch)}`,
);

// Multi-court timestamped consecutiveCounts:
// Court 1 finishes at t=200 (players 1,2,3,4 with 2 straight games);
// Court 2 finishes at t=210 (match started at t=100 < 200, players 5,6,7,8).
// Court 2's completion must NOT wipe players 1..4's 2-game streak.
const multiCourtHist = [
  { team1: [1, 2], team2: [3, 4], started_at: 0, ended_at: 100 },
  { team1: [1, 2], team2: [3, 4], started_at: 100, ended_at: 200 },
  { team1: [5, 6], team2: [7, 8], started_at: 100, ended_at: 210 },
];
const mcCounts = consecutiveCounts(multiCourtHist, 220);
console.assert(
  mcCounts.get(1) === 2 && mcCounts.get(5) === 1,
  `Expected player 1 streak=2 (not wiped by overlapping court 2) and player 5 streak=1, got ${JSON.stringify([...mcCounts])}`,
);
// After 8+ minutes (480s) of bench rest (now = 200 + 485 = 685), streak resets to 0
const restedCounts = consecutiveCounts(multiCourtHist, 685);
console.assert(
  restedCounts.get(1) === 0,
  `Expected player 1 streak=0 after >=8m bench rest, got ${restedCounts.get(1)}`,
);

// Hard anchor anti-starvation: skill outlier (id 1, professional, waited 18m)
// must be anchored into the match rather than bypassed by four intermediates waiting 12m
const outlierPool = [
  mk(1, 18, "professional", { last_played_at: now - 18 * 60 }),
  mk(2, 12, "intermediate", { last_played_at: now - 12 * 60 }),
  mk(3, 12, "intermediate", { last_played_at: now - 12 * 60 }),
  mk(4, 12, "intermediate", { last_played_at: now - 12 * 60 }),
  mk(5, 12, "intermediate", { last_played_at: now - 12 * 60 }),
];
const outlierRes = planBatch({ waiting: outlierPool, now });
const outlierIds = outlierRes.matches.flatMap((m) => [...m.team1, ...m.team2]);
console.assert(
  outlierIds.includes(1),
  `Expected long-waiting skill outlier (id 1) to be anchored into match, got ${outlierIds}`,
);

console.log("smartQueue.test.js: all assertions passed");

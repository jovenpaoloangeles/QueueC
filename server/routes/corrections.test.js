// API-level regression: PATCH /api/matches/:id/correct — ended matches only,
// score/players/rating/shuttles fixes, in-order slot mapping, and the derived
// stat recompute (games_played / total_seconds_played / last_played_at read
// back via SQL against the same temp DB the server uses).
// Boots its own throwaway server on :3992 — never :3001.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const PORT = 3992;
const BASE = `http://localhost:${PORT}`;
const dbPath = join(tmpdir(), `queuec-corrections-${process.pid}.db`);
const rmDb = () => ["", "-wal", "-shm"].forEach((s) => rmSync(dbPath + s, { force: true }));
rmDb();

const server = spawn("bun", ["server/index.js"], {
  cwd: root,
  stdio: "ignore",
  env: { ...process.env, DB_PATH: dbPath, PLAYERS_PATH: join(root, "tests/fixtures/players.json"), NODE_ENV: "test", PORT: String(PORT) },
});
const deadline = Date.now() + 30000;
for (;;) {
  try {
    if ((await fetch(`${BASE}/api/sessions/active`)).ok) break;
  } catch {}
  if (server.exitCode !== null) throw new Error("server exited early");
  if (Date.now() > deadline) {
    server.kill();
    rmDb();
    throw new Error("server start timeout");
  }
  await new Promise((r) => setTimeout(r, 100));
}

const api = async (path, method = "GET", body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
};

async function readFirstState() {
  const res = await fetch(`${BASE}/api/sse`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const m = buf.match(/event: state\ndata: (.*?)\n\n/s);
    if (m) {
      reader.cancel();
      return JSON.parse(m[1]);
    }
  }
  throw new Error("no state frame");
}

const entry = (sql, id) => sql.query("SELECT games_played, total_seconds_played, last_played_at, status FROM queue_entries WHERE id = ?").get(id);

async function main() {
  const stray = (await api("/api/sessions/active")).session;
  if (stray) await api(`/api/sessions/${stray.id}/end`, "PATCH");

  const now = Math.floor(Date.now() / 1000);
  const { session } = await api("/api/sessions", "POST", {
    name: "Corrections", scheduled_start: now, scheduled_end: now + 3600, court_count: 2,
  });
  const sid = session.id;
  for (let i = 0; i < 7; i++) {
    const { player } = await api("/api/players", "POST", { name: `Correct P${i + 1}`, skill_level: "intermediate" });
    await api(`/api/sessions/${sid}/checkin`, "POST", { player_id: player.id });
  }
  await api(`/api/sessions/${sid}/start`, "PATCH");
  const st0 = await readFirstState();
  const ids = st0.queue.map((e) => e.id);

  // Match A: doubles ids[0..3], ended 21-15
  const a = await api("/api/matches", "POST", {
    session_id: sid, court_number: 1,
    team1_p1: ids[0], team1_p2: ids[1], team2_p1: ids[2], team2_p2: ids[3],
  });
  assert.equal(a.status, 201, "match A created");
  const endA = await api(`/api/matches/${a.match.id}/end`, "PATCH", { team1_score: 21, team2_score: 15 });
  assert.equal(endA.status, 200, "match A ended");

  // Match B: singles ids[4] vs ids[5], still live
  const b = await api("/api/matches", "POST", { session_id: sid, court_number: 2, team1_p1: ids[4], team2_p1: ids[5] });
  assert.equal(b.status, 201, "match B created");

  // 6. correcting an un-ended (live) match → 404
  assert.equal((await api(`/api/matches/${b.match.id}/correct`, "PATCH", { team1_score: 1, team2_score: 0 })).status, 404, "live match correction 404s");
  assert.equal((await api(`/api/matches/999999/correct`, "PATCH", { team1_score: 1, team2_score: 0 })).status, 404, "unknown match 404s");

  // 3. players containing a currently-playing entry → 409
  const playing = await api(`/api/matches/${a.match.id}/correct`, "PATCH", { players: [ids[4], ids[0], ids[1], ids[2]] });
  assert.equal(playing.status, 409, "correcting in a playing entry 409s");

  // 5a. players entry from another session → 400
  const now2 = Math.floor(Date.now() / 1000);
  const s2 = await api("/api/sessions", "POST", { name: "Other", scheduled_start: now2, scheduled_end: now2 + 3600, court_count: 1 });
  const { player: otherP } = await api("/api/players", "POST", { name: `Correct Other`, skill_level: "beginner" });
  const otherCheckin = await api(`/api/sessions/${s2.session.id}/checkin`, "POST", { player_id: otherP.id });
  const otherEntry = otherCheckin.entry;
  assert.ok(otherEntry, "checkin returns the queue entry");
  const crossSession = await api(`/api/matches/${a.match.id}/correct`, "PATCH", { players: [otherEntry.id, ids[0], ids[1], ids[2]] });
  assert.equal(crossSession.status, 400, "players entry from another session 400s");

  // 5b. duplicate entry → 400; 4. shape mismatches → 400; empty body → 400
  assert.equal((await api(`/api/matches/${a.match.id}/correct`, "PATCH", { players: [ids[0], ids[0], ids[1], ids[2]] })).status, 400, "duplicate players 400");
  assert.equal((await api(`/api/matches/${a.match.id}/correct`, "PATCH", { players: [ids[0], ids[1]] })).status, 400, "2 players on doubles 400");
  assert.equal((await api(`/api/matches/${a.match.id}/correct`, "PATCH", {})).status, 400, "empty body 400");

  // 7 + 2. swap ids[3] out for ids[6]; recompute read back via SQL
  const sql = new Database(dbPath, { readonly: true });
  const before3 = entry(sql, ids[3]);
  assert.equal(before3.status, "waiting", "ids[3] waiting before the swap");

  const swap = await api(`/api/matches/${a.match.id}/correct`, "PATCH", { players: [ids[0], ids[1], ids[2], ids[6]] });
  assert.equal(swap.status, 200, "valid players swap 200s");
  assert.deepEqual([swap.match.team1_p1, swap.match.team1_p2, swap.match.team2_p1, swap.match.team2_p2], [ids[0], ids[1], ids[2], ids[6]], "in-order slot mapping");

  const durA = endA.match.ended_at - a.match.started_at;
  const after3 = entry(sql, ids[3]);
  assert.deepEqual(
    { g: after3.games_played, s: after3.total_seconds_played, l: after3.last_played_at },
    { g: 0, s: 0, l: null },
    "removed entry recomputed to zero",
  );
  assert.equal(after3.status, "waiting", "removed entry status untouched");
  const after6 = entry(sql, ids[6]);
  assert.deepEqual(
    { g: after6.games_played, s: after6.total_seconds_played, l: after6.last_played_at },
    { g: 1, s: durA, l: endA.match.ended_at },
    "added entry recomputed to the match aggregate",
  );
  const after0 = entry(sql, ids[0]);
  assert.deepEqual({ g: after0.games_played, s: after0.total_seconds_played }, { g: 1, s: durA }, "kept entry count unchanged");

  // 1. score fix flips the leaderboard
  const beforeStats = await api(`/api/sessions/${sid}/stats`);
  const fix = await api(`/api/matches/${a.match.id}/correct`, "PATCH", { team1_score: 10, team2_score: 20 });
  assert.equal(fix.status, 200, "score fix 200s");
  const afterStats = await api(`/api/sessions/${sid}/stats`);
  const winBefore = beforeStats.stats.leaderboard.filter((r) => r.wins > 0).map((r) => r.name).sort();
  const winAfter = afterStats.stats.leaderboard.filter((r) => r.wins > 0).map((r) => r.name).sort();
  assert.ok(winBefore.length === 2 && winAfter.length === 2, "two winners before and after");
  assert.notDeepEqual(winBefore, winAfter, "leaderboard winners flipped with the corrected scores");

  // 4b. singles shape: end match B, a 4-player array 400s; side swap maps [t1p1, t2p1]
  const endB = await api(`/api/matches/${b.match.id}/end`, "PATCH", { team1_score: 5, team2_score: 3 });
  assert.equal(endB.status, 200, "match B ended");
  assert.equal((await api(`/api/matches/${b.match.id}/correct`, "PATCH", { players: [ids[4], ids[5], ids[0], ids[1]] })).status, 400, "4 players on singles 400s");
  const sideswap = await api(`/api/matches/${b.match.id}/correct`, "PATCH", { players: [ids[5], ids[4]] });
  assert.equal(sideswap.status, 200, "singles side swap 200s");
  assert.deepEqual([sideswap.match.team1_p1, sideswap.match.team2_p1], [ids[5], ids[4]], "singles slot mapping [t1p1, t2p1]");

  // shuttles + rating correction lands on the row
  const misc = await api(`/api/matches/${b.match.id}/correct`, "PATCH", { new_shuttles: 3, used_shuttles: 2, rating: 4 });
  assert.equal(misc.status, 200, "shuttles/rating fix 200s");
  assert.equal(misc.match.new_shuttles, 3);
  assert.equal(misc.match.used_shuttles, 2);
  assert.equal(misc.match.rating, 4);

  sql.close();
  await api(`/api/sessions/${sid}/end`, "PATCH");
  await api(`/api/sessions/${s2.session.id}/end`, "PATCH");
  console.log("corrections.test.js: all assertions passed");
}

main()
  .finally(() => {
    server.kill();
    rmDb();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

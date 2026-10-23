// API-level regression: GET /api/sessions (history list) and
// GET /api/sessions/:id/detail (ended + live session detail).
import assert from "node:assert/strict";

const BASE = process.env.QC_TEST_BASE ?? "http://localhost:3991";

const api = async (path, method = "GET", body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
};

const pid = async (name) => (await api("/api/players")).players.find((p) => p.name === name).id;

async function main() {
  const stray = (await api("/api/sessions/active")).session;
  if (stray) await api(`/api/sessions/${stray.id}/end`, "PATCH");

  // ---- Session A: doubles, one shuttle extra, a 'left' attendance row ----
  const now = Math.floor(Date.now() / 1000);
  const a = await api("/api/sessions", "POST", { name: "Hist Alpha", scheduled_start: now, scheduled_end: now + 3600, court_count: 2 });
  const aid = a.session.id;
  const eA = {};
  for (const name of ["Inter C1", "Inter C2", "Inter C3", "Inter C4"]) {
    const ci = await api(`/api/sessions/${aid}/checkin`, "POST", { player_id: await pid(name) });
    eA[name] = ci.entry.id;
  }
  await api(`/api/sessions/${aid}/start`, "PATCH");
  const ma = await api("/api/matches", "POST", {
    session_id: aid, court_number: 1,
    team1_p1: eA["Inter C1"], team1_p2: eA["Inter C2"], team2_p1: eA["Inter C3"], team2_p2: eA["Inter C4"],
  });
  assert.equal(ma.status, 201);
  await api(`/api/matches/${ma.match.id}/end`, "PATCH", { team1_score: 21, team2_score: 15 });
  await api(`/api/sessions/${aid}/shuttles`, "PATCH", { delta: 2 }); // shuttles_extra = 2
  // a staged slate survives session end — it is not a game and must not leak
  // into the detail games log or the exports
  const sl = await api("/api/matches/slate", "POST", {
    session_id: aid, team1_p1: eA["Inter C1"], team1_p2: eA["Inter C2"], team2_p1: eA["Inter C3"], team2_p2: eA["Inter C4"],
  });
  assert.equal(sl.status, 201, "slate staged");
  await api(`/api/sessions/${aid}/end`, "PATCH");
  const leftRow = await api(`/api/sessions/${aid}/attendance`, "POST", { player_id: await pid("Beginner B1"), checked_in_at: 777 });
  assert.equal(leftRow.entry.status, "left");

  // ---- Session B: singles, no extras ----
  await new Promise((r) => setTimeout(r, 1100)); // ended_at must sort strictly after A's
  const now2 = Math.floor(Date.now() / 1000);
  const b = await api("/api/sessions", "POST", { name: "Hist Beta", scheduled_start: now2, scheduled_end: now2 + 3600, court_count: 1 });
  const bid = b.session.id;
  const e1 = await api(`/api/sessions/${bid}/checkin`, "POST", { player_id: await pid("Newbie A1") });
  const e2 = await api(`/api/sessions/${bid}/checkin`, "POST", { player_id: await pid("Newbie A2") });
  await api(`/api/sessions/${bid}/start`, "PATCH");
  const mb = await api("/api/matches", "POST", { session_id: bid, court_number: 1, team1_p1: e1.entry.id, team2_p1: e2.entry.id });
  await api(`/api/matches/${mb.match.id}/end`, "PATCH", { team1_score: 5, team2_score: 3 });
  await api(`/api/sessions/${bid}/end`, "PATCH");

  // ---- history list ----
  const list = await api("/api/sessions");
  assert.equal(list.status, 200);
  const hist = list.sessions.filter((s) => [aid, bid].includes(s.id));
  assert.deepEqual(hist.map((s) => s.id), [bid, aid], "ended sessions, ended_at DESC");
  const histA = hist.find((s) => s.id === aid);
  const histB = hist.find((s) => s.id === bid);
  assert.equal(histA.players, 5, "A: 4 checked in + 1 left row");
  assert.equal(histA.matches, 1);
  assert.equal(histA.shuttles_total, 3, "A: 1 per-game new + 2 extra");
  assert.equal(histB.players, 2);
  assert.equal(histB.matches, 1);
  assert.equal(histB.shuttles_total, 1, "B: per-game new only");
  assert.ok(hist.every((s) => s.ended_at != null && s.name && s.court_count >= 1));

  // ---- detail: ended session ----
  const det = await api(`/api/sessions/${aid}/detail`);
  assert.equal(det.status, 200);
  assert.equal(det.session.id, aid);
  assert.equal(det.leaderboard.length, 4, "leaderboard has the four doubles players");
  assert.equal(det.leaderboard.find((r) => r.name === "Inter C1").wins, 1);
  assert.equal(det.games.length, 1, "surviving slated rows are not games");
  assert.ok(det.games.every((g) => g.state !== "slated"), "no slated rows in the games log");
  const g = det.games[0];
  assert.equal(g.format, "doubles");
  assert.equal(g.state, "active");
  assert.deepEqual(g.team1.map((p) => p.name), ["Inter C1", "Inter C2"]);
  assert.deepEqual(g.team2.map((p) => p.name), ["Inter C3", "Inter C4"]);
  assert.deepEqual([g.team1_score, g.team2_score], [21, 15]);
  assert.ok(g.team1.every((p) => p.entry_id && p.player_id));
  assert.equal(det.attendance.length, 5, "attendance includes the left row");
  const left = det.attendance.find((r) => r.name === "Beginner B1");
  assert.equal(left.status, "left");
  assert.equal(left.checked_in_at, 777);
  assert.deepEqual(det.shuttles, { new: 1, used: 0, extra: 2, total: 3 });

  // ---- detail: live session ----
  const now3 = Math.floor(Date.now() / 1000);
  const live = await api("/api/sessions", "POST", { name: "Hist Live", scheduled_start: now3, scheduled_end: now3 + 3600, court_count: 1 });
  const lid = live.session.id;
  const le1 = await api(`/api/sessions/${lid}/checkin`, "POST", { player_id: await pid("Beginner B2") });
  const le2 = await api(`/api/sessions/${lid}/checkin`, "POST", { player_id: await pid("Beginner B3") });
  await api(`/api/sessions/${lid}/start`, "PATCH");
  const lm = await api("/api/matches", "POST", { session_id: lid, court_number: 1, team1_p1: le1.entry.id, team2_p1: le2.entry.id });
  assert.equal(lm.status, 201);
  const ldet = await api(`/api/sessions/${lid}/detail`);
  assert.equal(ldet.status, 200);
  assert.equal(ldet.games.length, 1);
  assert.equal(ldet.games[0].state, "active");
  assert.equal(ldet.games[0].ended_at, null);
  assert.deepEqual(ldet.games[0].team1.map((p) => p.name), ["Beginner B2"]);
  assert.deepEqual(ldet.games[0].team2.map((p) => p.name), ["Beginner B3"]);
  assert.equal(ldet.leaderboard.length, 0, "no ended matches → empty leaderboard");
  assert.deepEqual(ldet.attendance.map((r) => r.status), ["playing", "playing"]);
  await api(`/api/sessions/${lid}/end`, "PATCH");

  assert.equal((await api(`/api/sessions/999999/detail`)).status, 404, "unknown session 404s");

  console.log("history.test.js: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

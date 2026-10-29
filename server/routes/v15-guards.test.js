// API-level regression for the v1.5 scenario-probe fixes: no tied/blank
// scores, pause blocks match starts, status whitelist, unknown-player
// check-in 404, and ending a session drops unfinished games.
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

async function main() {
  const stray = (await api("/api/sessions/active")).session;
  if (stray) await api(`/api/sessions/${stray.id}/end`, "PATCH");

  const tag = `V15${Date.now().toString(36)}`;
  const e = [];
  const now = Math.floor(Date.now() / 1000);
  const { session } = await api("/api/sessions", "POST", {
    name: tag,
    scheduled_start: now,
    scheduled_end: now + 3600,
    court_count: 2,
  });
  const sid = session.id;
  for (let i = 0; i < 9; i++) {
    const p = (await api("/api/players", "POST", { name: `${tag} ${i}`, skill_level: "intermediate" }))
      .player;
    e.push((await api(`/api/sessions/${sid}/checkin`, "POST", { player_id: p.id })).entry.id);
  }
  await api(`/api/sessions/${sid}/start`, "PATCH");
  const courts = (await api(`/api/sessions/${sid}/courts`)).courts;
  const start = (court, ids) =>
    api("/api/matches", "POST", {
      session_id: sid,
      court_number: court,
      team1_p1: ids[0],
      team1_p2: ids[1],
      team2_p1: ids[2],
      team2_p2: ids[3],
    });

  // scores: tied and blank are rejected, a real result goes through
  const m = (await start(courts[0].id, e.slice(0, 4))).match;
  const end = (body) => api(`/api/matches/${m.id}/end`, "PATCH", body);
  assert.equal((await end({ team1_score: 21, team2_score: 21 })).status, 400, "tie");
  assert.equal((await end({})).status, 400, "blank scores");
  assert.equal((await end({ team1_score: 21 })).status, 400, "one score");
  assert.equal((await end({ team1_score: 21, team2_score: 15 })).status, 200);
  const tie = await api(`/api/matches/${m.id}/correct`, "PATCH", { team2_score: 21 });
  assert.equal(tie.status, 400, "correcting into a tie");
  assert.equal(
    (await api(`/api/matches/${m.id}/correct`, "PATCH", { team1_score: 10, team2_score: 21 })).status,
    200,
  );

  // status whitelist
  const live = (await start(courts[0].id, e.slice(0, 4))).match;
  assert.equal((await api(`/api/queue/${e[0]}/status`, "PATCH", { status: "left" })).status, 409, "on court");
  assert.equal((await api(`/api/queue/${e[4]}/status`, "PATCH", { status: "bogus" })).status, 400);
  assert.equal((await api(`/api/queue/${e[4]}/status`, "PATCH", { status: "playing" })).status, 400);

  // unknown player check-in
  assert.equal((await api(`/api/sessions/${sid}/checkin`, "POST", { player_id: 99999999 })).status, 404);

  // pause blocks every way of starting a match; slating still works
  const slate = await api("/api/matches/slate", "POST", {
    session_id: sid,
    team1_p1: e[4],
    team1_p2: e[5],
    team2_p1: e[6],
    team2_p2: e[7],
  });
  assert.equal(slate.status, 201, JSON.stringify(slate));
  await api(`/api/sessions/${sid}/pause`, "PATCH");
  assert.equal((await start(courts[1].id, e.slice(4, 8))).status, 409, "direct start while paused");
  assert.equal(
    (await api(`/api/matches/${slate.slate.id}/start`, "POST", { court_id: courts[1].id })).status,
    409,
    "slate start while paused",
  );
  assert.equal((await api(`/api/sessions/${sid}/automatch`, "POST", {})).status, 409, "smart match");
  assert.equal(
    (await api(`/api/sessions/${sid}/automatch`, "POST", { dry_run: true })).status,
    200,
    "dry run still plans",
  );
  await api(`/api/sessions/${sid}/resume`, "PATCH");

  // ending with a game on court and a slate on deck leaves no unfinished rows
  assert.ok(live.id);
  assert.equal((await api(`/api/sessions/${sid}/end`, "PATCH")).status, 200);
  const d = await api(`/api/sessions/${sid}/detail`);
  assert.deepEqual(
    d.games.map((g) => g.ended_at != null),
    [true],
    "only the finished game survives",
  );
  assert.ok(!d.attendance.some((a) => a.status === "playing" || a.status === "staged"));

  console.log("v15-guards.test.js: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

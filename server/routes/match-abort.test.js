// API-level regression: DELETE /api/matches/:id aborts a live match — all four
// entries return to `waiting` (sort_order kept), the row is deleted; a second
// DELETE (or one on an ended match) is 404.
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

async function main() {
  const stray = (await api("/api/sessions/active")).session;
  if (stray) await api(`/api/sessions/${stray.id}/end`, "PATCH");

  const now = Math.floor(Date.now() / 1000);
  const { session } = await api("/api/sessions", "POST", {
    name: "AbortLive",
    scheduled_start: now,
    scheduled_end: now + 3600,
    court_count: 2,
  });
  const names = ["Ab A", "Ab B", "Ab C", "Ab D"];
  for (const name of names) {
    const { player } = await api("/api/players", "POST", { name, skill_level: "intermediate" });
    await api(`/api/sessions/${session.id}/checkin`, "POST", { player_id: player.id });
  }
  await api(`/api/sessions/${session.id}/start`, "PATCH");
  const st0 = await readFirstState();
  const ids = st0.queue.map((e) => e.id);
  const { match } = await api("/api/matches", "POST", {
    session_id: session.id,
    court_number: st0.courts[0].id,
    team1_p1: ids[0],
    team1_p2: ids[1],
    team2_p1: ids[2],
    team2_p2: ids[3],
  });

  const del = await api(`/api/matches/${match.id}`, "DELETE");
  assert.equal(del.status, 200, "abort live match → 200");
  assert.equal(del.ok, true, "returns {ok:true}");

  const st1 = await readFirstState();
  assert.equal(st1.activeMatches.length, 0, "match gone from SSE");
  for (const id of ids) {
    const e = st1.queue.find((q) => q.id === id);
    assert.ok(e, "entry still present");
    assert.equal(e.status, "waiting", "entry back to waiting");
  }
  // sort_order kept: the four entries hold their original relative order
  const orders = ids.map((id) => st1.queue.find((q) => q.id === id).sort_order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b), "sort_order preserved");

  assert.equal((await api(`/api/matches/${match.id}`, "DELETE")).status, 404, "second DELETE → 404");

  // ended match: start again then end properly, abort must 404
  const { match: m2 } = await api("/api/matches", "POST", {
    session_id: session.id,
    court_number: st0.courts[0].id,
    team1_p1: ids[0],
    team1_p2: ids[1],
    team2_p1: ids[2],
    team2_p2: ids[3],
  });
  await api(`/api/matches/${m2.id}/end`, "PATCH", { team1_score: 21, team2_score: 3 });
  // v1.3: ended matches delete (history correction) instead of 404ing — but
  // only via the explicit historical path. A bare DELETE (the toast-undo's
  // abort) refuses, so a stray undo click can't erase a fully-played game;
  // the ex-players' games_played recomputes back down to their pre-match counts.
  assert.equal(
    (await api(`/api/matches/${m2.id}`, "DELETE")).status,
    409,
    "bare DELETE of ended match → 409",
  );
  assert.equal(
    (await api(`/api/matches/${m2.id}?historical=1`, "DELETE")).status,
    200,
    "historical delete of ended match → 200",
  );
  assert.equal(
    (await api(`/api/matches/${m2.id}`, "DELETE")).status,
    404,
    "double delete → 404",
  );

  await api(`/api/sessions/${session.id}/end`, "PATCH");
  console.log("match-abort.test.js: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

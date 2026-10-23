// API-level regression: ended-match DELETE with stat recompute, queue-entry
// removal guarded by match history, and the attendance endpoints (live →
// check-in semantics, ended → plain row). Run against the throwaway harness
// server via QC_TEST_BASE.
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

const playedFor = (stats, name) => stats.stats.leaderboard.find((r) => r.name === name)?.played ?? 0;

async function main() {
  const stray = (await api("/api/sessions/active")).session;
  if (stray) await api(`/api/sessions/${stray.id}/end`, "PATCH");

  // ---- Session 1: ended-match delete recomputes; slated delete still 404s ----
  const now = Math.floor(Date.now() / 1000);
  const s1 = await api("/api/sessions", "POST", { name: "Att One", scheduled_start: now, scheduled_end: now + 3600, court_count: 2 });
  const ids = {};
  const entryIds = {};
  for (const name of ["Inter C1", "Inter C2", "Inter C3", "Inter C4"]) {
    const { players } = await api("/api/players");
    ids[name] = players.find((p) => p.name === name).id;
    const ci = await api(`/api/sessions/${s1.session.id}/checkin`, "POST", { player_id: ids[name] });
    entryIds[name] = ci.entry.id;
  }
  await api(`/api/sessions/${s1.session.id}/start`, "PATCH");

  const m1 = await api("/api/matches", "POST", {
    session_id: s1.session.id, court_number: 1,
    team1_p1: entryIds["Inter C1"], team1_p2: entryIds["Inter C2"], team2_p1: entryIds["Inter C3"], team2_p2: entryIds["Inter C4"],
  });
  assert.equal(m1.status, 201);
  await api(`/api/matches/${m1.match.id}/end`, "PATCH", { team1_score: 21, team2_score: 15 });
  const mid = await api(`/api/sessions/${s1.session.id}/stats`);
  for (const name of ["Inter C1", "Inter C2", "Inter C3", "Inter C4"]) {
    assert.equal(playedFor(mid, name), 1, `${name} played 1 before delete`);
  }

  // slated match delete → 404 (unchanged); then remove the slate for cleanup
  const run = await api(`/api/sessions/${s1.session.id}/automatch`, "POST", { slate_only: true });
  assert.ok(run.slated_count >= 1, "slate created");
  const st1 = await readFirstState();
  const slatedId = st1.slatedMatches[0].id;
  assert.equal((await api(`/api/matches/${slatedId}`, "DELETE")).status, 404, "slated match delete 404s");
  await api(`/api/matches/${slatedId}/slate`, "DELETE");

  // ended match delete → row gone, counts recomputed to pre-match values
  assert.equal(
    (await api(`/api/matches/${m1.match.id}`, "DELETE")).status,
    409,
    "bare DELETE of ended match 409s (toast-undo guard)",
  );
  const del = await api(`/api/matches/${m1.match.id}?historical=1`, "DELETE");
  assert.equal(del.status, 200, "historical delete of ended match 200s");
  const after = await api(`/api/sessions/${s1.session.id}/stats`);
  assert.equal(after.stats.leaderboard.filter((r) => r.played > 0).length, 0, "no games counted after match delete");

  // live attendance delegates to check-in: alphabetical slot, dup 409
  const { players: pool1 } = await api("/api/players");
  const att = await api(`/api/sessions/${s1.session.id}/attendance`, "POST", {
    player_id: pool1.find((p) => p.name === "Beginner B1").id,
  });
  assert.equal(att.status, 201, "live attendance 201s");
  assert.equal(att.entry.status, "waiting", "live attendance entry waiting");
  const st2 = await readFirstState();
  const b1 = st2.queue.find((e) => e.name === "Beginner B1");
  assert.ok(b1, "attendance entry in queue");
  // display order: B1 sorts ahead of the Inter C entries (exact sort_order
  // values depend on the slate cleanup re-append, so compare order, not ints)
  const before = st2.queue
    .filter((e) => e.sort_order < b1.sort_order && e.status === "waiting")
    .map((e) => e.name);
  assert.deepEqual(before, [], "no waiting entry sorts ahead of B1");
  const dup = await api(`/api/sessions/${s1.session.id}/attendance`, "POST", { player_id: ids["Inter C1"] });
  assert.equal(dup.status, 409, "duplicate attendance 409s");
  await api(`/api/sessions/${s1.session.id}/end`, "PATCH");

  // ---- Session 2: queue-delete guard, matchless undo, ended-session rows ----
  const now2 = Math.floor(Date.now() / 1000);
  const s2 = await api("/api/sessions", "POST", { name: "Att Two", scheduled_start: now2, scheduled_end: now2 + 3600, court_count: 1 });
  const { players: pool } = await api("/api/players");
  const pid = (name) => pool.find((p) => p.name === name).id;
  const a1 = await api(`/api/sessions/${s2.session.id}/checkin`, "POST", { player_id: pid("Newbie A1") });
  const a2 = await api(`/api/sessions/${s2.session.id}/checkin`, "POST", { player_id: pid("Newbie A2") });
  await api(`/api/sessions/${s2.session.id}/start`, "PATCH");
  const m2 = await api("/api/matches", "POST", { session_id: s2.session.id, court_number: 1, team1_p1: a1.entry.id, team2_p1: a2.entry.id });
  await api(`/api/matches/${m2.match.id}/end`, "PATCH", { team1_score: 5, team2_score: 3 });

  const guarded = await api(`/api/queue/${a1.entry.id}`, "DELETE");
  assert.equal(guarded.status, 409, "queue delete of entry in an ended match 409s");
  assert.equal(guarded.error, "Entry has match history — fix the match instead", "exact guard message");

  // a matchless check-in on the live session, then delete the match: the
  // preset players + entries survive session end, so the wrong check-in can
  // be undone afterwards
  const b2 = await api(`/api/sessions/${s2.session.id}/attendance`, "POST", { player_id: pid("Beginner B2") });
  assert.equal(b2.status, 201);
  await api(`/api/matches/${m2.match.id}?historical=1`, "DELETE");
  await api(`/api/sessions/${s2.session.id}/end`, "PATCH");

  const undo = await api(`/api/queue/${a1.entry.id}`, "DELETE");
  assert.equal(undo.status, 200, "matchless entry on ended session removes");

  // attendance on an ended session → plain row, status 'left', body checked_in_at
  const late = await api(`/api/sessions/${s2.session.id}/attendance`, "POST", { player_id: pid("Beginner B3"), checked_in_at: 12345 });
  assert.equal(late.status, 201, "ended-session attendance 201s");
  assert.equal(late.entry.status, "left", "ended-session attendance row is 'left'");
  assert.equal(late.entry.checked_in_at, 12345, "body checked_in_at honored");
  assert.equal((await api(`/api/queue/${late.entry.id}`, "DELETE")).status, 200, "ended-session attendance undoable");


  // duplicate attendance on an ended session 409s (same contract as check-in)
  await api(`/api/sessions/${s2.session.id}/attendance`, "POST", { player_id: pid("Beginner B3") });
  const dupLate = await api(`/api/sessions/${s2.session.id}/attendance`, "POST", { player_id: pid("Beginner B3") });
  assert.equal(dupLate.status, 409, "duplicate attendance on an ended session 409s");

  console.log("attendance.test.js: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

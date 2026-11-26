// API-level regression: deleting one ended session, and clearing all history.
// Runs LAST in tests/scripts/run-server-tests.js — clear-all removes every
// ended session on the shared server.
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

// one session with one finished doubles game; ended unless `end` is false
async function playedSession(name, { end = true } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const { session } = await api("/api/sessions", "POST", {
    name,
    scheduled_start: now,
    scheduled_end: now + 3600,
    court_count: 1,
  });
  const { players } = await api("/api/players");
  const entries = [];
  for (const p of players.slice(0, 4)) {
    entries.push((await api(`/api/sessions/${session.id}/checkin`, "POST", { player_id: p.id })).entry.id);
  }
  await api(`/api/sessions/${session.id}/start`, "PATCH");
  const { courts } = await api(`/api/sessions/${session.id}/courts`);
  const { match } = await api("/api/matches", "POST", {
    session_id: session.id,
    court_number: courts[0].id,
    team1_p1: entries[0],
    team1_p2: entries[1],
    team2_p1: entries[2],
    team2_p2: entries[3],
  });
  await api(`/api/matches/${match.id}/end`, "PATCH", { team1_score: 21, team2_score: 15 });
  if (end) await api(`/api/sessions/${session.id}/end`, "PATCH");
  return { id: session.id, playerId: players[0].id };
}

const listed = async () => (await api("/api/sessions")).sessions.map((s) => s.id);

async function main() {
  const stray = (await api("/api/sessions/active")).session;
  if (stray) await api(`/api/sessions/${stray.id}/end`, "PATCH");

  // --- delete one session: it leaves the list, its detail and the player's career
  const a = await playedSession("Del Alpha");
  const b = await playedSession("Del Beta");
  const careerGames = async () => (await api(`/api/players/${a.playerId}/career`)).totals.games;
  const gamesBefore = await careerGames();
  assert.ok((await listed()).includes(a.id) && (await listed()).includes(b.id), "setup: both listed");

  const del = await api(`/api/sessions/${a.id}`, "DELETE");
  assert.equal(del.status, 200, "deleting an ended session succeeds");
  assert.equal(del.deleted, 1);
  assert.ok(!(await listed()).includes(a.id), "deleted session leaves the history list");
  assert.ok((await listed()).includes(b.id), "the other session stays");
  assert.equal((await api(`/api/sessions/${a.id}/detail`)).status, 404, "its detail page is gone");
  assert.equal((await api(`/api/sessions/${a.id}`, "DELETE")).status, 404, "deleting twice is a 404");
  assert.equal(await careerGames(), gamesBefore - 1, "career no longer counts the deleted game");

  // --- the live session can't be deleted, and clear-all leaves it alone
  const live = await playedSession("Del Live", { end: false });
  assert.equal(
    (await api(`/api/sessions/${live.id}`, "DELETE")).status,
    409,
    "a live session can't be deleted",
  );

  // --- clear all needs the explicit flag
  assert.equal((await api("/api/sessions", "DELETE")).status, 400, "clear-all without ?all=1 is refused");
  assert.ok((await listed()).includes(b.id), "…and deleted nothing");

  const clear = await api("/api/sessions?all=1", "DELETE");
  assert.equal(clear.status, 200);
  assert.ok(clear.deleted >= 1, "every ended session was deleted");
  assert.deepEqual(await listed(), [], "history list is empty");
  assert.equal((await api("/api/sessions/active")).session?.id, live.id, "the live session survives");
  assert.ok((await api("/api/players")).players.length > 0, "players are kept");

  await api(`/api/sessions/${live.id}/end`, "PATCH");
  console.log("history-delete.test.js: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

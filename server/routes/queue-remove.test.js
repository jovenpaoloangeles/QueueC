// API regression: DELETE /api/queue/:entryId removes a waiting or resting
// entry but refuses a playing one (409) — removal is check-in undo only.
// Run via tests: `bun run test:server` (throwaway server; :3001 is the live container).
import assert from "node:assert/strict";

const BASE = process.env.QC_TEST_BASE ?? "http://localhost:3991";

const api = async (path, method = "GET", body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ...(await res.json()) };
};

async function main() {
  const stray = (await api("/api/sessions/active")).session;
  if (stray) await api(`/api/sessions/${stray.id}/end`, "PATCH");
  const now = Math.floor(Date.now() / 1000);
  const { session } = await api("/api/sessions", "POST", {
    name: "Remove",
    scheduled_start: now,
    scheduled_end: now + 14400,
    court_count: 1,
    courts: [{ label: "A", duration_minutes: 120 }],
  });

  const ids = [];
  for (const p of (await api("/api/players")).players.slice(0, 8)) {
    const { entry } = await api(`/api/sessions/${session.id}/checkin`, "POST", { player_id: p.id });
    ids.push(entry.id);
  }

  // resting entry: removable (rest does not block check-in undo)
  await api(`/api/queue/${ids[1]}/status`, "PATCH", { status: "resting" });
  const resting = await api(`/api/queue/${ids[1]}`, "DELETE");
  assert.equal(resting.status, 200, `resting removal ok (got ${resting.status}: ${resting.error})`);
  assert.equal((await api(`/api/queue/${ids[1]}`, "DELETE")).status, 404, "row is gone");

  // playing entry: refused — the match would be orphaned
  await api(`/api/sessions/${session.id}/start`, "PATCH");
  const { courts } = await api(`/api/sessions/${session.id}/courts`);
  const made = await api("/api/matches", "POST", {
    session_id: session.id,
    court_number: courts[0].id,
    team1_p1: ids[0],
    team2_p1: ids[2],
  });
  assert.ok(made.status === 200 || made.status === 201, `match created (got ${made.status})`);
  const playing = await api(`/api/queue/${ids[0]}`, "DELETE");
  assert.equal(playing.status, 409);
  assert.equal(playing.error, "Cannot remove a playing entry");

  // staged entry: refused — arm-then-confirm can race a slate landing, and
  // deleting a staged entry would orphan the slated row
  const slate = await api("/api/matches/slate", "POST", {
    session_id: session.id,
    team1_p1: ids[4],
    team1_p2: ids[5],
    team2_p1: ids[6],
    team2_p2: ids[7],
  });
  assert.equal(slate.status, 201, `slate created (got ${slate.status}: ${slate.error})`);
  const staged = await api(`/api/queue/${ids[4]}`, "DELETE");
  assert.equal(staged.status, 409);

  // waiting entry: the check-in-undo path
  const waiting = await api(`/api/queue/${ids[3]}`, "DELETE");
  assert.equal(waiting.status, 200);
  assert.equal((await api(`/api/queue/${ids[3]}`, "DELETE")).status, 404);

  console.log("queue-remove.test.js: all assertions passed");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);

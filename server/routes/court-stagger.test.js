// tests/e2e/../server regression: a court with an opens_after offset is unusable
// until its offset elapses, then opens (lazy active_from check), and its rental
// clock anchors to its own open time, not the session's.
// Run with: bun server/routes/court-stagger.test.js (target a throwaway server: QC_TEST_BASE=http://localhost:<port> — :3001 is the live container)
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
  // fresh session: court A starts with the session, court B opens +5 min
  const stray = (await api("/api/sessions/active")).session;
  if (stray) await api(`/api/sessions/${stray.id}/end`, "PATCH");
  const now = Math.floor(Date.now() / 1000);
  const { session } = await api("/api/sessions", "POST", {
    name: "Stagger",
    scheduled_start: now,
    scheduled_end: now + 14400,
    court_count: 2,
    courts: [
      { label: "A", duration_minutes: 120 },
      { label: "B", duration_minutes: 120, opens_after: 5 },
    ],
  });
  const entries = [];
  for (const p of (await api("/api/players")).players.slice(0, 4)) {
    const { entry } = await api(`/api/sessions/${session.id}/checkin`, "POST", { player_id: p.id });
    entries.push(entry);
  }
  const started = await api(`/api/sessions/${session.id}/start`, "PATCH").then((r) => r.session);
  assert.ok(started.started_at, "session started");

  const { courts } = await api(`/api/sessions/${session.id}/courts`);
  const [a, b] = courts;
  assert.equal(a.active_from, null, "offset-0 court has no active_from");
  assert.ok(
    Math.abs(b.active_from - (started.started_at + 300)) <= 1,
    `court B opens +5min (got ${b.active_from} vs ${started.started_at + 300})`,
  );
  // expiry anchors to each court's OWN open time
  assert.equal(a.expires_at, started.started_at + 120 * 60);
  assert.equal(b.expires_at, started.started_at + 300 + 120 * 60);

  const [p1, p2] = entries;

  // t=0: court B rejected by manual start and excluded from auto-match
  const early = await api("/api/matches", "POST", {
    session_id: session.id,
    court_number: b.id,
    team1_p1: p1.id,
    team2_p1: p2.id,
  });
  assert.equal(early.status, 400);
  assert.equal(early.error, "Court is not open yet");
  const plan = (await api(`/api/sessions/${session.id}/automatch`, "POST", { dry_run: true })).plan;
  assert.ok(
    plan.matches.every((m) => m.court_id !== b.id),
    "automatch must not use a not-yet-open court",
  );

  // +5 min (simulated by backdating active_from — availability is lazy on it)
  await api(`/api/courts/${b.id}`, "PATCH", { active_from: Math.floor(Date.now() / 1000) - 1 });
  const late = await api("/api/matches", "POST", {
    session_id: session.id,
    court_number: b.id,
    team1_p1: p1.id,
    team2_p1: p2.id,
  });
  assert.equal(late.status, 201, `match on opened court should start: ${JSON.stringify(late)}`);
  await api(`/api/matches/${late.match.id}/end`, "PATCH", { team1_score: 21, team2_score: 15 });

  await api(`/api/sessions/${session.id}/end`, "PATCH");
  console.log("court-stagger.test.js: all assertions passed");
}

main();

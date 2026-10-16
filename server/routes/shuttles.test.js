// API regression: 1 new game = 1 shuttle by default (stamped at game start),
// PATCH /sessions/:id/shuttles adjusts the session-level extra with a 0 clamp,
// and stats expose total = new + extra. Run via tests: `bun run test:server`.
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
    name: "Shuttles",
    scheduled_start: now,
    scheduled_end: now + 14400,
    court_count: 1,
    courts: [{ label: "A", duration_minutes: 120 }],
  });

  const stats = async () => (await api(`/api/sessions/${session.id}/stats`)).stats.shuttles;
  assert.equal((await stats()).total, 0, "fresh session: no shuttles");

  // validation before any state change
  assert.equal(
    (await api(`/api/sessions/999999/shuttles`, "PATCH", { delta: 1 })).status,
    404,
    "unknown session",
  );
  assert.equal(
    (await api(`/api/sessions/${session.id}/shuttles`, "PATCH", { delta: 0 })).status,
    400,
    "zero delta",
  );
  assert.equal(
    (await api(`/api/sessions/${session.id}/shuttles`, "PATCH", { delta: 1.5 })).status,
    400,
    "non-integer",
  );
  assert.equal((await api(`/api/sessions/${session.id}/shuttles`, "PATCH", {})).status, 400, "missing delta");

  // game start stamps 1 shuttle — singles match via POST /matches
  const ids = [];
  for (const p of (await api("/api/players")).players.slice(0, 4)) {
    const { entry } = await api(`/api/sessions/${session.id}/checkin`, "POST", { player_id: p.id });
    ids.push(entry.id);
  }
  await api(`/api/sessions/${session.id}/start`, "PATCH");
  const { courts } = await api(`/api/sessions/${session.id}/courts`);
  await api("/api/matches", "POST", {
    session_id: session.id,
    court_number: courts[0].id,
    team1_p1: ids[0],
    team2_p1: ids[1],
  });
  let s = await stats();
  assert.equal(s.new, 1, "one game = one new shuttle");
  assert.equal(s.total, 1, "total tracks games before any manual add");

  // manual +1 → total 2; −3 clamps at 0
  assert.equal((await api(`/api/sessions/${session.id}/shuttles`, "PATCH", { delta: 1 })).shuttles_extra, 1);
  s = await stats();
  assert.equal(s.extra, 1, "extra recorded on the session");
  assert.equal(s.total, 2, "total = games + extra");
  assert.equal(
    (await api(`/api/sessions/${session.id}/shuttles`, "PATCH", { delta: -3 })).shuttles_extra,
    0,
    "clamped at 0",
  );
  assert.equal((await stats()).total, 1, "clamp leaves game count intact");

  console.log("shuttles.test.js: all assertions passed");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);

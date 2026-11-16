// API-level regression for plan 004: the five unguarded endpoints now return
// 400 (never 500, never silent corruption) on missing/typed-wrong bodies.
// The extend case also pins that a rejected extend leaves expires_at intact.
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

  const tag = `VAL${Date.now().toString(36)}`;
  const now = Math.floor(Date.now() / 1000);

  // --- session create ---
  const bad = async (body, error) => {
    const r = await api("/api/sessions", "POST", body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.error, error, JSON.stringify(body));
  };
  await bad({ scheduled_start: now, scheduled_end: now + 3600 }, "Name is required");
  await bad({ name: tag, court_count: 100000 }, "court_count must be an integer 1–16");
  await bad({ name: tag, court_count: 0 }, "court_count must be an integer 1–16");
  await bad(
    { name: tag, scheduled_start: "2026-11-16", scheduled_end: now + 3600 },
    "scheduled_start must be epoch seconds",
  );
  // NOT NULL columns: a missing timestamp must 400, not bind NULL → 500
  await bad({ name: tag, scheduled_start: now }, "scheduled_end must be epoch seconds");
  const happy = await api("/api/sessions", "POST", {
    name: tag,
    scheduled_start: now,
    scheduled_end: now + 3600,
    // a timed court doubles as the extend/shuttles fixture below
    courts: [{ label: "Court A", duration_minutes: 60 }],
  });
  assert.equal(happy.status, 201);
  const sid = happy.session.id;
  await api(`/api/sessions/${sid}/start`, "PATCH");

  // --- players ---
  const skillError =
    "skill_level must be one of: newbie, beginner, lower_intermediate, intermediate, " +
    "upper_intermediate, expert, professional, advanced";
  await api("/api/players", "POST", { name: `${tag} bad`, skill_level: "champion" }).then((r) => {
    assert.equal(r.status, 400);
    assert.equal(r.error, skillError);
  });
  const { player } = await api("/api/players", "POST", {
    name: `${tag} good`,
    skill_level: "intermediate",
  });
  assert.equal(player.skill_level, "intermediate", "happy-path create unchanged");
  const patch = await api(`/api/players/${player.id}`, "PATCH", { skill_level: "champion" });
  assert.equal(patch.status, 400);
  assert.equal(patch.error, skillError);
  assert.equal(
    (await api(`/api/players/${player.id}`, "PATCH", { skill_level: "advanced" })).status,
    200,
    "legacy alias still accepted",
  );

  // --- court extend: 400 AND the rental timer survives ---
  const court = (await api(`/api/sessions/${sid}/courts`)).courts[0];
  assert.ok(court.expires_at, "fixture court has a rental timer");
  const badExtend = await api(`/api/courts/${court.id}/extend`, "PATCH", { minutes: "1hr" });
  assert.equal(badExtend.status, 400);
  assert.equal(badExtend.error, "minutes must be a whole number 1–240");
  const after = (await api(`/api/sessions/${sid}/courts`)).courts[0];
  assert.equal(after.expires_at, court.expires_at, "timer NOT erased by the rejected extend");
  assert.equal((await api(`/api/courts/${court.id}/extend`, "PATCH", { minutes: 60 })).status, 200);

  // --- match shuttles deltas ---
  const e = [];
  for (let i = 0; i < 4; i++) {
    const p = (await api("/api/players", "POST", { name: `${tag} p${i}`, skill_level: "beginner" })).player;
    e.push((await api(`/api/sessions/${sid}/checkin`, "POST", { player_id: p.id })).entry.id);
  }
  const m = (
    await api("/api/matches", "POST", {
      session_id: sid,
      court_number: court.id,
      team1_p1: e[0],
      team1_p2: e[1],
      team2_p1: e[2],
      team2_p2: e[3],
    })
  ).match;
  assert.ok(m?.id, "fixture match started");
  const badShuttles = await api(`/api/matches/${m.id}/shuttles`, "PATCH", { delta_new: "one" });
  assert.equal(badShuttles.status, 400);
  assert.equal(badShuttles.error, "delta_new and delta_used must be integers");
  const shuttled = await api(`/api/matches/${m.id}/shuttles`, "PATCH", { delta_new: 1 });
  assert.equal(shuttled.status, 200);
  assert.equal(shuttled.match.new_shuttles, m.new_shuttles + 1, "happy-path delta unchanged");

  // --- attendance on an ended session stores checked_in_at raw ---
  const esid = (
    await api("/api/sessions", "POST", {
      name: `${tag} ended`,
      scheduled_start: now,
      scheduled_end: now + 3600,
      court_count: 1,
    })
  ).session.id;
  await api(`/api/sessions/${esid}/end`, "PATCH");
  const badAtt = await api(`/api/sessions/${esid}/attendance`, "POST", {
    player_id: player.id,
    checked_in_at: "yesterday",
  });
  assert.equal(badAtt.status, 400);
  assert.equal(badAtt.error, "checked_in_at must be epoch seconds");
  const goodAtt = await api(`/api/sessions/${esid}/attendance`, "POST", {
    player_id: player.id,
    checked_in_at: now,
  });
  assert.equal(goodAtt.status, 201);
  assert.equal(goodAtt.entry.checked_in_at, now);

  console.log("validation.test.js: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

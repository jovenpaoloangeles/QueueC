// API-level regression: GET /api/players/:id/career — totals, partners,
// per-session attendance, monthly attendance with eligibility.
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

async function playDoubles(sessionId, court, a, b, c, d, s1, s2) {
  const m = await api("/api/matches", "POST", {
    session_id: sessionId,
    court_number: court,
    team1_p1: a,
    team1_p2: b,
    team2_p1: c,
    team2_p2: d,
  });
  assert.equal(m.status, 201);
  const end = await api(`/api/matches/${m.match.id}/end`, "PATCH", { team1_score: s1, team2_score: s2 });
  assert.equal(end.status, 200);
}

async function main() {
  const stray = (await api("/api/sessions/active")).session;
  if (stray) await api(`/api/sessions/${stray.id}/end`, "PATCH");

  // fresh drop-ins, not fixtures: fixture players carry matches from earlier
  // files in the suite, and career totals are all-time
  const tag = `Career${Date.now().toString(36)}`;
  const mk = async (name, skill = "intermediate") =>
    (await api("/api/players", "POST", { name, skill_level: skill })).player.id;
  const c1 = await mk(`${tag} P1`);
  const c2 = await mk(`${tag} P2`);
  const c3 = await mk(`${tag} P3`);
  const c4 = await mk(`${tag} P4`);

  // two ended sessions, C1+C2 together: win then loss
  const checkinAll = async (sid) => {
    const e = {};
    for (const [name, p] of [
      ["C1", c1],
      ["C2", c2],
      ["C3", c3],
      ["C4", c4],
    ]) {
      const ci = await api(`/api/sessions/${sid}/checkin`, "POST", { player_id: p });
      e[name] = ci.entry.id;
    }
    return e;
  };
  const now = Math.floor(Date.now() / 1000);
  const s1 = await api("/api/sessions", "POST", {
    name: "Career One",
    scheduled_start: now,
    scheduled_end: now + 3600,
    court_count: 2,
  });
  const e1 = await checkinAll(s1.session.id);
  await api(`/api/sessions/${s1.session.id}/start`, "PATCH");
  await playDoubles(s1.session.id, 1, e1.C1, e1.C2, e1.C3, e1.C4, 21, 15);
  await api(`/api/sessions/${s1.session.id}/end`, "PATCH");

  await new Promise((r) => setTimeout(r, 1100));
  const now2 = Math.floor(Date.now() / 1000);
  const s2 = await api("/api/sessions", "POST", {
    name: "Career Two",
    scheduled_start: now,
    scheduled_end: now + 3600,
    court_count: 2,
  });
  const e2 = await checkinAll(s2.session.id);
  await api(`/api/sessions/${s2.session.id}/start`, "PATCH");
  await playDoubles(s2.session.id, 1, e2.C1, e2.C2, e2.C3, e2.C4, 15, 21);
  await api(`/api/sessions/${s2.session.id}/end`, "PATCH");

  const career = await api(`/api/players/${c1}/career`);
  assert.equal(career.status, 200);
  assert.equal(career.player.id, c1);
  assert.equal(career.player.name, `${tag} P1`);
  assert.ok(career.player.skill_level);

  assert.deepEqual(
    {
      g: career.totals.games,
      w: career.totals.wins,
      l: career.totals.losses,
      r: career.totals.win_rate,
      d: career.totals.point_diff,
    },
    { g: 2, w: 1, l: 1, r: 50, d: 0 },
    "career totals",
  );
  assert.equal(typeof career.totals.seconds_played, "number");

  assert.equal(career.partners.length, 1, "one partner: Inter C2");
  assert.deepEqual(
    {
      id: career.partners[0].player_id,
      name: career.partners[0].name,
      g: career.partners[0].games,
      w: career.partners[0].wins,
      l: career.partners[0].losses,
    },
    { id: c2, name: `${tag} P2`, g: 2, w: 1, l: 1 },
  );

  assert.deepEqual(
    career.attendance.sessions.map((s) => s.name),
    ["Career Two", "Career One"],
    "sessions ended_at DESC",
  );
  assert.ok(career.attendance.sessions.every((s) => s.games_played === 1 && s.session_id));

  const month = new Date().toISOString().slice(0, 7);
  const mrow = career.attendance.months.find((m) => m.month === month);
  assert.ok(mrow, "current month row exists");
  assert.equal(mrow.attended, 2, "both sessions attended");
  assert.ok(mrow.total >= 2, "denominator includes other sessions this month");
  assert.equal(mrow.pct, Math.round((mrow.attended / mrow.total) * 100));

  // opponent has no partner rows with C1 (opponents don't count)
  const opp = await api(`/api/players/${c3}/career`);
  assert.equal(opp.totals.games, 2);
  assert.equal(opp.totals.losses, 1);
  assert.equal(
    opp.partners.find((p) => p.player_id === c1),
    undefined,
    "opponent is not a partner",
  );

  assert.equal((await api(`/api/players/999999/career`)).status, 404, "unknown player 404s");

  // subject seated at team1_p2: the partner is team1_p1 — both p2-slot
  // placements must still credit the mate (regression: p2 subjects lost
  // their partner rows entirely)
  const tag2 = `CareerB${Date.now().toString(36)}`;
  const p5 = await mk(`${tag2} S5`);
  const p6 = await mk(`${tag2} S6`);
  const p7 = await mk(`${tag2} S7`);
  const p8 = await mk(`${tag2} S8`);
  const s3 = await api("/api/sessions", "POST", {
    name: "Career Three",
    scheduled_start: now2 + 10,
    scheduled_end: now2 + 3610,
    court_count: 2,
  });
  const e3 = {};
  for (const [k, id] of [
    ["S5", p5],
    ["S6", p6],
    ["S7", p7],
    ["S8", p8],
  ]) {
    e3[k] = (await api(`/api/sessions/${s3.session.id}/checkin`, "POST", { player_id: id })).entry.id;
  }
  await api(`/api/sessions/${s3.session.id}/start`, "PATCH");
  await playDoubles(s3.session.id, 1, e3.S6, e3.S5, e3.S7, e3.S8, 21, 15);
  await api(`/api/sessions/${s3.session.id}/end`, "PATCH");

  const subj = await api(`/api/players/${p5}/career`);
  const subjPartner = subj.partners.find((x) => x.player_id === p6);
  assert.ok(subjPartner, "p2-seated subject still credits their partner");
  assert.deepEqual(
    { g: subjPartner.games, w: subjPartner.wins, l: subjPartner.losses },
    { g: 1, w: 1, l: 0 },
  );

  // eligibility: a player created AFTER an earlier ended session must not
  // have that session in their monthly denominator (created_at filter)
  const p9 = await mk(`${tag2} S9`);
  const late = await api(`/api/sessions/${s3.session.id}/attendance`, "POST", { player_id: p9 });
  assert.equal(late.status, 201);
  const fresh = await api(`/api/players/${p9}/career`);
  const fmonth = new Date().toISOString().slice(0, 7);
  const frow = fresh.attendance.months.find((m) => m.month === fmonth);
  assert.ok(frow, "fresh player has a month row");
  assert.equal(frow.total, 1, "sessions predating the player are excluded from the denominator");
  assert.equal(frow.attended, 1);
  assert.equal(frow.pct, 100);

  console.log("career.test.js: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// API-level regression for v1.4 stats: leaderboard windows, career
// opponents/partner win %, session fairness and highlights.
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

async function play(sid, e, s1, s2) {
  const m = await api("/api/matches", "POST", {
    session_id: sid,
    court_number: 1,
    team1_p1: e.A,
    team1_p2: e.B,
    team2_p1: e.C,
    team2_p2: e.D,
  });
  assert.equal(m.status, 201, JSON.stringify(m));
  const end = await api(`/api/matches/${m.match.id}/end`, "PATCH", { team1_score: s1, team2_score: s2 });
  assert.equal(end.status, 200);
}

async function main() {
  const stray = (await api("/api/sessions/active")).session;
  if (stray) await api(`/api/sessions/${stray.id}/end`, "PATCH");

  const tag = `V14${Date.now().toString(36)}`;
  const ids = {};
  const mk = async (k) => {
    ids[k] = (
      await api("/api/players", "POST", { name: `${tag} ${k}`, skill_level: "intermediate" })
    ).player.id;
  };
  for (const k of ["A", "B", "C", "D"]) await mk(k);

  // far-future schedule so no other test file's session lands between ours
  // (attendance streaks count consecutive sessions by scheduled_start)
  const base = Math.floor(Date.now() / 1000) + 10_000_000;
  const session = async (k, who) => {
    const s = (
      await api("/api/sessions", "POST", {
        name: `${tag} S${k}`,
        scheduled_start: base + k,
        scheduled_end: base + k + 3600,
        court_count: 1,
      })
    ).session;
    const e = {};
    for (const p of who) {
      const ci = await api(`/api/sessions/${s.id}/checkin`, "POST", { player_id: ids[p] });
      assert.equal(ci.status, 201, `${k}/${p}: ${JSON.stringify(ci)}`);
      e[p] = ci.entry.id;
    }
    await api(`/api/sessions/${s.id}/start`, "PATCH");
    return { sid: s.id, e };
  };

  // S1, S2: one win each for A+B; S3: 8 straight wins (A's 10th career game)
  for (const k of [1, 2]) {
    const { sid, e } = await session(k, ["A", "B", "C", "D"]);
    await play(sid, e, 21, 10);
    await api(`/api/sessions/${sid}/end`, "PATCH");
  }
  await mk("E"); // created late: session end prunes never-played drop-ins
  const { sid, e } = await session(3, ["A", "B", "C", "D", "E"]);
  for (let i = 0; i < 8; i++) await play(sid, e, 21, 15);

  // read live: ending the session prunes never-played drop-ins (E)
  const d = await api(`/api/sessions/${sid}/detail`);
  assert.equal(d.status, 200);
  assert.deepEqual(d.fairness.games, { min: 0, median: 8, max: 8 }, "E never played");
  assert.equal(typeof d.fairness.avg_wait_seconds, "number");
  assert.ok(d.fairness.most_bumped.length <= 3);
  assert.ok(
    d.fairness.most_bumped.every((p) => p.games === 8 && p.longest_wait_seconds >= 0),
    "never-played players have no closed gap",
  );

  const h = d.highlights;
  const byName = (list) => Object.fromEntries(list.map((x) => [x.name.replace(`${tag} `, ""), x]));
  assert.equal(byName(h.win_streaks).A.streak, 8);
  assert.equal(byName(h.win_streaks).B.streak, 8);
  assert.equal(byName(h.win_streaks).C, undefined, "losers have no streak");
  assert.equal(byName(h.attendance_streaks).A.streak, 3, "S1–S3 in a row");
  assert.equal(byName(h.attendance_streaks).E, undefined, "E only came once");
  assert.deepEqual(
    h.milestones.filter((m) => m.name.startsWith(tag)).map((m) => [m.name.replace(`${tag} `, ""), m.game]),
    [
      ["A", 10],
      ["B", 10],
      ["C", 10],
      ["D", 10],
    ],
  );

  // career: opponents + partner win %
  const k = await api(`/api/players/${ids.A}/career`);
  assert.deepEqual(
    k.partners.map((p) => [p.player_id, p.games, p.win_rate]),
    [[ids.B, 10, 100]],
  );
  assert.deepEqual(
    k.opponents.map((p) => [p.player_id, p.games, p.wins, p.losses, p.win_rate]).sort((a, b) => a[0] - b[0]),
    [
      [ids.C, 10, 10, 0, 100],
      [ids.D, 10, 10, 0, 100],
    ],
  );
  const kc = await api(`/api/players/${ids.C}/career`);
  assert.ok(kc.opponents.every((p) => p.win_rate === 0 && p.losses === 10));

  // leaderboard windows
  const all = await api("/api/leaderboard?since=0");
  assert.equal(all.status, 200);
  const a = all.leaderboard.find((r) => r.player_id === ids.A);
  assert.deepEqual([a.played, a.wins, a.losses], [10, 10, 0], "all-time spans sessions");
  const future = await api(`/api/leaderboard?since=${base * 2}`);
  assert.deepEqual(future.leaderboard, []);
  assert.equal((await api("/api/leaderboard?since=abc")).status, 400);

  await api(`/api/sessions/${sid}/end`, "PATCH");
  console.log("stats-v14.test.js: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

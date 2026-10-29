// API-level regression for the v1.7 learned rating: career exposes it, a
// lopsided win moves winners up and losers down, Smart Match still plans.
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

  const tag = `V17${Date.now().toString(36)}`;
  const now = Math.floor(Date.now() / 1000);
  const { session } = await api("/api/sessions", "POST", {
    name: tag,
    scheduled_start: now,
    scheduled_end: now + 3600,
    court_count: 1,
  });
  const pids = [];
  const e = [];
  for (let i = 0; i < 8; i++) {
    const p = (await api("/api/players", "POST", { name: `${tag} ${i}`, skill_level: "intermediate" }))
      .player;
    pids.push(p.id);
    e.push((await api(`/api/sessions/${session.id}/checkin`, "POST", { player_id: p.id })).entry.id);
  }
  await api(`/api/sessions/${session.id}/start`, "PATCH");
  const court = (await api(`/api/sessions/${session.id}/courts`)).courts[0].id;

  const before = await api(`/api/players/${pids[0]}/career`);
  assert.equal(before.rating, null, "no scored games → no rating yet");

  const m = (
    await api("/api/matches", "POST", {
      session_id: session.id,
      court_number: court,
      team1_p1: e[0],
      team1_p2: e[1],
      team2_p1: e[2],
      team2_p2: e[3],
    })
  ).match;
  await api(`/api/matches/${m.id}/end`, "PATCH", { team1_score: 31, team2_score: 9 });

  const win = (await api(`/api/players/${pids[0]}/career`)).rating;
  const lose = (await api(`/api/players/${pids[2]}/career`)).rating;
  assert.ok(
    win.mu > 4 && lose.mu < 4,
    `31–9: winners above tier 4, losers below (got ${win.mu}, ${lose.mu})`,
  );
  assert.ok(win.sigma < 0.75, "one game tightens the estimate");
  assert.equal(win.games, 1);

  const plan = await api(`/api/sessions/${session.id}/automatch`, "POST", { dry_run: true });
  assert.equal(plan.status, 200);
  assert.equal(
    plan.plan.matches.length + plan.plan.slate.length > 0,
    true,
    "Smart Match still plans with ratings",
  );

  await api(`/api/sessions/${session.id}/end`, "PATCH");
  console.log("v17-ratings.test.js: all assertions passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

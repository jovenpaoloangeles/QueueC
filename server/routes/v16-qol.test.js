// API-level regression for v1.6 QM quality of life: payments (fees, split,
// paid), gone-home → back via check-in, mid-match substitution.
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

  const tag = `V16${Date.now().toString(36)}`;
  const now = Math.floor(Date.now() / 1000);
  const { session } = await api("/api/sessions", "POST", {
    name: tag,
    scheduled_start: now,
    scheduled_end: now + 3600,
    court_count: 1,
  });
  const sid = session.id;
  const pids = [];
  const e = [];
  for (let i = 0; i < 5; i++) {
    const p = (await api("/api/players", "POST", { name: `${tag} ${i}`, skill_level: "intermediate" }))
      .player;
    pids.push(p.id);
    e.push((await api(`/api/sessions/${sid}/checkin`, "POST", { player_id: p.id })).entry.id);
  }
  await api(`/api/sessions/${sid}/start`, "PATCH");
  const court = (await api(`/api/sessions/${sid}/courts`)).courts[0].id;

  // substitution: e[4] replaces e[0] mid-game
  const m = (
    await api("/api/matches", "POST", {
      session_id: sid,
      court_number: court,
      team1_p1: e[0],
      team1_p2: e[1],
      team2_p1: e[2],
      team2_p2: e[3],
    })
  ).match;
  const sub = (body) => api(`/api/matches/${m.id}/substitute`, "PATCH", body);
  assert.equal((await sub({ out_entry: e[4], in_entry: e[0] })).status, 400, "out not in match");
  assert.equal((await sub({ out_entry: e[0], in_entry: e[1] })).status, 409, "sub must be waiting");
  const ok = await sub({ out_entry: e[0], in_entry: e[4] });
  assert.equal(ok.status, 200);
  assert.equal(ok.match.team1_p1, e[4]);
  const att = (await api(`/api/sessions/${sid}/detail`)).attendance;
  const statusOf = (id) => att.find((a) => a.entry_id === id).status;
  assert.equal(statusOf(e[0]), "resting", "subbed-off player rests");
  assert.equal(statusOf(e[4]), "playing");
  assert.equal(
    (await api(`/api/matches/${m.id}/end`, "PATCH", { team1_score: 21, team2_score: 10 })).status,
    200,
  );
  await api(`/api/matches/${m.id}/correct`, "PATCH", { new_shuttles: 4 });

  // gone home → back: check-in revives the same entry
  assert.equal((await api(`/api/queue/${e[0]}/status`, "PATCH", { status: "left" })).status, 200);
  const back = await api(`/api/sessions/${sid}/checkin`, "POST", { player_id: pids[0] });
  assert.equal(back.status, 200, "revive is 200, not 201");
  assert.equal(back.entry.id, e[0], "same entry");
  assert.equal(back.entry.status, "waiting");
  assert.equal((await api(`/api/sessions/${sid}/checkin`, "POST", { player_id: pids[0] })).status, 409);

  // payments
  const fees = (b) => api(`/api/sessions/${sid}/fees`, "PATCH", b);
  assert.equal((await fees({ court_fee: -1 })).status, 400);
  assert.equal((await fees({ shuttle_price: 1.5 })).status, 400);
  assert.equal((await fees({ fee_split: "whatever" })).status, 400);
  assert.equal((await fees({ court_fee: 500, shuttle_price: 100 })).status, 200);

  // equal: (500 + 4 shuttles × 100) / 5 = 180 each
  let pay = (await api(`/api/sessions/${sid}/detail`)).payments;
  assert.equal(pay.split, "equal");
  assert.deepEqual(
    pay.rows.map((r) => r.share),
    [180, 180, 180, 180, 180],
  );
  assert.equal(pay.total, 900);

  // per game: court 100 each; the game's 400 split over its 4 seats (e[4] took e[0]'s)
  await fees({ fee_split: "per_game" });
  pay = (await api(`/api/sessions/${sid}/detail`)).payments;
  const share = Object.fromEntries(pay.rows.map((r) => [r.entry_id, r.share]));
  assert.deepEqual(
    e.map((id) => share[id]),
    [100, 200, 200, 200, 200],
    "subbed-off player pays court only",
  );

  assert.equal((await api(`/api/queue/${e[1]}/paid`, "PATCH", { paid: "yes" })).status, 400);
  assert.equal((await api(`/api/queue/${e[1]}/paid`, "PATCH", { paid: true })).status, 200);
  pay = (await api(`/api/sessions/${sid}/detail`)).payments;
  assert.equal(pay.collected, 200);
  assert.equal(pay.rows.find((r) => r.entry_id === e[1]).paid, true);

  await api(`/api/sessions/${sid}/end`, "PATCH");
  console.log("v16-qol.test.js: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

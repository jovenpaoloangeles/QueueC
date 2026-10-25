// API-level regression: CSV/JSON export for sessions and player careers.
// format=json must equal the detail/career payloads the pages render.
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

async function main() {
  const stray = (await api("/api/sessions/active")).session;
  if (stray) await api(`/api/sessions/${stray.id}/end`, "PATCH");

  const now = Math.floor(Date.now() / 1000);
  const s = await api("/api/sessions", "POST", {
    name: "Export One",
    scheduled_start: now,
    scheduled_end: now + 3600,
    court_count: 2,
  });
  const sid = s.session.id;
  const e = {};
  for (const name of ["Inter C1", "Inter C2", "Inter C3", "Inter C4"]) {
    const ci = await api(`/api/sessions/${sid}/checkin`, "POST", { player_id: await pid(name) });
    e[name] = ci.entry.id;
  }
  await api(`/api/sessions/${sid}/start`, "PATCH");
  const m = await api("/api/matches", "POST", {
    session_id: sid,
    court_number: 1,
    team1_p1: e["Inter C1"],
    team1_p2: e["Inter C2"],
    team2_p1: e["Inter C3"],
    team2_p2: e["Inter C4"],
  });
  await api(`/api/matches/${m.match.id}/end`, "PATCH", { team1_score: 21, team2_score: 15 });
  await api(`/api/sessions/${sid}/shuttles`, "PATCH", { delta: 2 });
  await api(`/api/sessions/${sid}/end`, "PATCH");
  const c1 = await pid("Inter C1");

  // ---- session export: JSON === detail payload ----
  const jres = await fetch(`${BASE}/api/sessions/${sid}/export?format=json`);
  assert.equal(jres.status, 200);
  assert.match(jres.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(jres.headers.get("content-disposition"), `attachment; filename="session-${sid}-detail.json"`);
  const jexp = await jres.json();
  const detail = await (await fetch(`${BASE}/api/sessions/${sid}/detail`)).json();
  assert.deepEqual(jexp, detail, "session export JSON equals detail payload");

  // ---- career export: JSON === career payload ----
  const cjres = await fetch(`${BASE}/api/players/${c1}/career/export?format=json`);
  assert.equal(cjres.status, 200);
  assert.equal(cjres.headers.get("content-disposition"), `attachment; filename="player-${c1}-career.json"`);
  assert.deepEqual(
    await cjres.json(),
    await (await fetch(`${BASE}/api/players/${c1}/career`)).json(),
    "career export JSON equals career payload",
  );

  // ---- CSV: default format, section comments, row counts, quoting ----
  const cres = await fetch(`${BASE}/api/sessions/${sid}/export`);
  assert.equal(cres.status, 200);
  assert.match(cres.headers.get("content-type") ?? "", /text\/csv/);
  assert.equal(cres.headers.get("content-disposition"), `attachment; filename="session-${sid}-detail.csv"`);
  const csv = await cres.text();
  assert.ok(csv.startsWith("# Leaderboard\n"), "CSV starts with the leaderboard section");
  for (const section of ["# Games", "# Attendance", "# Shuttles"]) {
    assert.ok(
      csv.includes(`\n# ${section.replace("# ", "")}\n`) || csv.includes(`# ${section}\n`),
      `CSV has a ${section} section`,
    );
  }
  const lbRows = csv.split("\n# Games")[0].trim().split("\n").slice(2); // skip # comment + header row
  assert.equal(lbRows.length, 4, "one row per leaderboard player");
  assert.ok(
    lbRows.every((r) => r.split(",").length >= 6),
    "leaderboard rows carry the header's columns",
  );

  const kres = await fetch(`${BASE}/api/players/${c1}/career/export`);
  assert.equal(kres.status, 200);
  const kcsv = await kres.text();
  assert.ok(kcsv.startsWith("# Totals\n"), "career CSV starts with totals");
  for (const section of ["# Partners", "# Attendance", "# Months"]) {
    assert.ok(kcsv.includes(`${section}\n`), `career CSV has a ${section} section`);
  }

  // RFC 4180: a player name with a comma is quoted. The player must PLAY —
  // session end purges history-less drop-ins, taking their attendance along.
  const qp = await api("/api/players", "POST", { name: "Quote, Player", skill_level: "intermediate" });
  const qs = await api("/api/sessions", "POST", {
    name: "Export Quoted",
    scheduled_start: now,
    scheduled_end: now + 3600,
    court_count: 1,
  });
  const qe = [qp.player.id, await pid("Inter C1"), await pid("Inter C2"), await pid("Inter C3")].map(
    (player_id) =>
      api(`/api/sessions/${qs.session.id}/checkin`, "POST", { player_id }).then((r) => r.entry.id),
  );
  await api(`/api/sessions/${qs.session.id}/start`, "PATCH");
  const qm = await api("/api/matches", "POST", {
    session_id: qs.session.id,
    court_number: 1,
    team1_p1: await qe[0],
    team1_p2: await qe[1],
    team2_p1: await qe[2],
    team2_p2: await qe[3],
  });
  await api(`/api/matches/${qm.match.id}/end`, "PATCH", { team1_score: 21, team2_score: 19 });
  await api(`/api/sessions/${qs.session.id}/end`, "PATCH");
  const qres = await fetch(`${BASE}/api/sessions/${qs.session.id}/export`);
  const qcsv = await qres.text();
  assert.ok(qcsv.includes('"Quote, Player"'), "commas in values are quoted");

  assert.equal((await fetch(`${BASE}/api/sessions/999999/export`)).status, 404, "unknown session 404s");
  assert.equal((await fetch(`${BASE}/api/players/999999/career/export`)).status, 404, "unknown player 404s");

  console.log("export.test.js: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

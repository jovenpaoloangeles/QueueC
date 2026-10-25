// API-level regression: `locked` on slate-only automatch — validation edges and
// the happy path (dry-run plan and committed slate both contain the locked ids).
// Run with: bun server/routes/automatch-locked.test.js (QC_TEST_BASE targets a
// throwaway server — never :3001)
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

async function readFirstState() {
  const res = await fetch(`${BASE}/api/sse`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const m = buf.match(/event: state\ndata: (.*?)\n\n/s);
    if (m) {
      reader.cancel();
      return JSON.parse(m[1]);
    }
  }
  throw new Error("no state frame");
}

async function main() {
  const stray = (await api("/api/sessions/active")).session;
  if (stray) await api(`/api/sessions/${stray.id}/end`, "PATCH");

  const now = Math.floor(Date.now() / 1000);
  const { session } = await api("/api/sessions", "POST", {
    name: "LockedSlate",
    scheduled_start: now,
    scheduled_end: now + 3600,
    court_count: 1,
  });
  for (let i = 0; i < 6; i++) {
    const { player } = await api("/api/players", "POST", {
      name: `Locked P${i + 1}`,
      skill_level: "intermediate",
    });
    await api(`/api/sessions/${session.id}/checkin`, "POST", { player_id: player.id });
  }
  await api(`/api/sessions/${session.id}/start`, "PATCH");
  // queue-entry ids (what the plan and `locked` speak in), from the live state
  const st0 = await readFirstState();
  const ids = st0.queue.map((e) => e.id);

  // Validation edges
  const noSlate = await api(`/api/sessions/${session.id}/automatch`, "POST", { locked: [ids[0], ids[1]] });
  assert.equal(noSlate.status, 400, "locked without slate_only must 400");

  const dup = await api(`/api/sessions/${session.id}/automatch`, "POST", {
    slate_only: true,
    locked: [ids[0], ids[0]],
  });
  assert.equal(dup.status, 400, "duplicate locked ids must 400");

  const notWaiting = await api(`/api/sessions/${session.id}/automatch`, "POST", {
    slate_only: true,
    locked: [ids[0], 999999],
  });
  assert.equal(notWaiting.status, 400, "locked id not currently waiting must 400");

  const four = await api(`/api/sessions/${session.id}/automatch`, "POST", {
    slate_only: true,
    locked: ids.slice(0, 4),
  });
  assert.equal(four.status, 400, "locked length 4 must 400 (nothing left to plan)");

  // Happy path: dry-run plan contains both locked ids
  const dry = await api(`/api/sessions/${session.id}/automatch`, "POST", {
    dry_run: true,
    slate_only: true,
    locked: [ids[0], ids[1]],
  });
  assert.equal(dry.status, 200, "valid locked dry-run must 200");
  const quartet = [...(dry.plan.slate[0]?.team1 ?? []), ...(dry.plan.slate[0]?.team2 ?? [])];
  assert.ok(
    quartet.includes(ids[0]) && quartet.includes(ids[1]),
    `locked ids in dry-run slate quartet, got [${quartet}]`,
  );
  assert.equal(dry.plan.slate.length, 1, "locked plans exactly one quartet");

  // Committed (non-dry) run slates them
  const run = await api(`/api/sessions/${session.id}/automatch`, "POST", {
    slate_only: true,
    locked: [ids[0], ids[1]],
  });
  assert.ok(run.status < 300, `committed locked run must succeed (got ${run.status})`);
  assert.equal(run.slated, true, "non-dry run slates");
  assert.equal(run.slated_count, 1, "exactly one slate committed");
  const st1 = await readFirstState();
  const sl = st1.slatedMatches[0];
  const slateIds = [sl.team1_p1, sl.team1_p2, sl.team2_p1, sl.team2_p2];
  assert.ok(
    slateIds.includes(ids[0]) && slateIds.includes(ids[1]),
    `committed slate contains locked ids, got [${slateIds}]`,
  );

  await api(`/api/sessions/${session.id}/end`, "PATCH");
  console.log("automatch-locked.test.js: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

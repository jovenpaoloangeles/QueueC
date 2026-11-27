// API-level regression for the 2026-11-27 event feedback:
//  1. players picked in setup are "away" (not at the venue) — no wait clock,
//     never matched — until checked in, which starts them fresh;
//  2. a live session's courts can be re-timed, switched off and added.
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

  const now = Math.floor(Date.now() / 1000);
  const { session } = await api("/api/sessions", "POST", {
    name: "Arrivals",
    scheduled_start: now,
    scheduled_end: now + 3600,
    court_count: 1,
  });
  const sid = session.id;
  const { players } = await api("/api/players");
  const ps = players.slice(0, 5);
  for (const p of ps) {
    const r = await api(`/api/sessions/${sid}/checkin`, "POST", { player_id: p.id, away: true });
    assert.equal(r.status, 201, "away check-in creates the entry");
    assert.equal(r.entry.status, "away");
  }
  await api(`/api/sessions/${sid}/start`, "PATCH");

  // nobody here → nothing to match, and they can't be benched either
  const dry = await api(`/api/sessions/${sid}/automatch`, "POST", { dry_run: true });
  assert.equal((dry.plan?.matches ?? []).length, 0, "away players are never matched");
  const stats = await api(`/api/sessions/${sid}/stats`);
  assert.equal(stats.stats.player_count, 0, "away players don't count as present");

  // arrival: a normal check-in replaces the away entry with a fresh one
  const later = await api(`/api/sessions/${sid}/checkin`, "POST", { player_id: ps[0].id });
  assert.equal(later.status, 201, "arriving checks the player in");
  assert.equal(later.entry.status, "waiting");
  assert.ok(later.entry.checked_in_at >= now, "wait clock starts at arrival");
  const again = await api(`/api/sessions/${sid}/checkin`, "POST", { player_id: ps[0].id });
  assert.equal(again.status, 409, "a second arrival is a duplicate");

  const awayEntry = (await api(`/api/sessions/${sid}/detail`)).attendance.find(
    (a) => a.player_id === ps[1].id,
  );
  assert.equal(awayEntry, undefined, "away players are not in attendance");

  for (const p of ps.slice(1, 4)) await api(`/api/sessions/${sid}/checkin`, "POST", { player_id: p.id });
  const live = await api(`/api/sessions/${sid}/automatch`, "POST", { dry_run: true });
  assert.equal(live.plan.matches.length, 1, "four arrivals make a match");

  // --- courts: re-time, switch off, add
  const { courts } = await api(`/api/sessions/${sid}/courts`);
  const close = now + 2 * 3600;
  const patched = await api(`/api/courts/${courts[0].id}`, "PATCH", { expires_at: close, label: "Court 6" });
  assert.equal(patched.court.expires_at, close, "closing time moves");
  assert.equal(patched.court.label, "Court 6");
  const bad = await api(`/api/courts/${courts[0].id}`, "PATCH", { expires_at: "6pm" });
  assert.equal(bad.status, 400, "non-epoch time is refused");

  const added = await api(`/api/sessions/${sid}/courts`, "POST", {
    label: "Court 8",
    active_from: null,
    expires_at: now + 3600,
  });
  assert.equal(added.status, 201);
  assert.equal(added.court.expires_at, now + 3600, "a new court takes an exact closing time");

  await api(`/api/courts/${courts[0].id}`, "PATCH", { enabled: 0 });
  const onlyNew = await api(`/api/sessions/${sid}/automatch`, "POST", { dry_run: true });
  assert.deepEqual(
    onlyNew.plan.matches.map((m) => m.court_id),
    [added.court.id],
    "a switched-off court gets no lineup; the added one does",
  );

  // ending drops the never-arrived from attendance
  await api(`/api/sessions/${sid}/end`, "PATCH");
  const att = (await api(`/api/sessions/${sid}/detail`)).attendance.map((a) => a.player_id);
  assert.deepEqual(
    att.sort(),
    ps
      .slice(0, 4)
      .map((p) => p.id)
      .sort(),
    "no-shows leave no attendance row",
  );

  console.log("arrivals-courts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

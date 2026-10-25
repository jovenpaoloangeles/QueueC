// tests/e2e/../server regression: session pause freezes every clock (SSE
// serverTime pins to paused_at), end-match refuses while paused, and resume
// shifts pause-anchored timestamps so waits/durations continue as if no time
// passed.
// Run with: bun server/routes/pause.test.js (target a throwaway server: QC_TEST_BASE=http://localhost:<port> — :3001 is the live container)
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

/** First SSE `state` frame as a parsed payload. */
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

  // (a) guards: draft and ended sessions can't pause
  const now = Math.floor(Date.now() / 1000);
  const draft = (
    await api("/api/sessions", "POST", {
      name: "PauseDraft",
      scheduled_start: now,
      scheduled_end: now + 3600,
      court_count: 1,
    })
  ).session;
  assert.equal((await api(`/api/sessions/${draft.id}/pause`, "PATCH")).status, 400, "draft pause → 400");

  const throwaway = (
    await api("/api/sessions", "POST", {
      name: "PauseEnded",
      scheduled_start: now,
      scheduled_end: now + 3600,
      court_count: 1,
    })
  ).session;
  await api(`/api/sessions/${throwaway.id}/start`, "PATCH");
  await api(`/api/sessions/${throwaway.id}/end`, "PATCH");
  assert.equal((await api(`/api/sessions/${throwaway.id}/pause`, "PATCH")).status, 400, "ended pause → 400");
  assert.equal(
    (await api(`/api/sessions/${throwaway.id}/resume`, "PATCH")).status,
    400,
    "resume unpaused → 400",
  );

  // (a) live session pauses
  const { session } = await api("/api/sessions", "POST", {
    name: "PauseLive",
    scheduled_start: now,
    scheduled_end: now + 3600,
    court_count: 2,
  });
  const names = ["Pz A", "Pz B", "Pz C", "Pz D", "Pz E"];
  for (const name of names) {
    const { player } = await api("/api/players", "POST", { name, skill_level: "intermediate" });
    await api(`/api/sessions/${session.id}/checkin`, "POST", { player_id: player.id });
  }
  await api(`/api/sessions/${session.id}/start`, "PATCH");
  const st0 = await readFirstState();
  const ids = st0.queue.map((e) => e.id);
  await api("/api/matches", "POST", {
    session_id: session.id,
    court_number: st0.courts[0].id,
    team1_p1: ids[0],
    team1_p2: ids[1],
    team2_p1: ids[2],
    team2_p2: ids[3],
  });

  const paused = await api(`/api/sessions/${session.id}/pause`, "PATCH");
  assert.equal(paused.status, 200, "live pause → 200");
  assert.ok(paused.session.paused_at != null, "paused_at set");
  assert.equal((await api(`/api/sessions/${session.id}/pause`, "PATCH")).status, 400, "double pause → 400");

  // (b) SSE serverTime pins to paused_at while paused
  const stPaused = await readFirstState();
  assert.equal(stPaused.serverTime, paused.session.paused_at, "serverTime frozen at paused_at");

  // (c) end-match refused while paused
  const stM = await readFirstState();
  const live = stM.activeMatches[0];
  assert.ok(live, "match is live");
  assert.equal(
    (await api(`/api/matches/${live.id}/end`, "PATCH", { team1_score: 21, team2_score: 5 })).status,
    409,
    "end match while paused → 409",
  );

  // (d1) writes DURING the pause must not be future-dated by the resume shift:
  // a check-in mid-pause keeps a wait clock >= 0 after resume (clamp, not +delta)
  await Bun.sleep(2500); // land mid-pause, not in the pause's own second
  const { player: midPausePlayer } = await api("/api/players", "POST", {
    name: "Pz MidPause",
    skill_level: "intermediate",
  });
  const midPause = await api(`/api/sessions/${session.id}/checkin`, "POST", {
    player_id: midPausePlayer.id,
  });
  assert.equal(midPause.status, 201, "check-in during pause is allowed");
  const midPauseEntryId = midPause.entry.id;

  // (d) resume shifts checked_in_at by the pause delta; waits continue
  const startedAtPre = (await readFirstState()).session.started_at;
  const waiterPre = (await readFirstState()).queue.find((e) => e.id === ids[4]);
  const waitPre = stPaused.serverTime - waiterPre.checked_in_at - waiterPre.total_seconds_played;
  await Bun.sleep(2100);
  const resumed = await api(`/api/sessions/${session.id}/resume`, "PATCH");
  assert.equal(resumed.status, 200, "resume → 200");
  assert.equal(resumed.session.paused_at, null, "paused_at cleared");
  const waiterPost = (await readFirstState()).queue.find((e) => e.id === ids[4]);
  const grown = waiterPost.checked_in_at - waiterPre.checked_in_at;
  assert.ok(grown >= 1 && grown <= 8, `checked_in_at grew by the pause length, got ${grown}`);
  const stPost = await readFirstState();
  const waitPostExact = stPost.serverTime - waiterPost.checked_in_at - waiterPost.total_seconds_played;
  assert.ok(
    Math.abs(waitPostExact - waitPre) <= 2,
    `wait preserved across pause (${waitPre} → ${waitPostExact})`,
  );
  assert.ok(stPost.serverTime > stPaused.serverTime, "serverTime flowing again");

  // the mid-pause check-in is clamped to resume-now, never in the future
  const midPauseEntry = stPost.queue.find((e) => e.id === midPauseEntryId);
  assert.ok(
    midPauseEntry.checked_in_at <= stPost.serverTime,
    `mid-pause check-in not future-dated (${midPauseEntry.checked_in_at} vs ${stPost.serverTime})`,
  );

  // (d2) sessions.started_at shifts too — the header elapsed pill continues
  // through the pause instead of leaping forward on resume
  const delta = waiterPost.checked_in_at - waiterPre.checked_in_at;
  assert.equal(stPost.session.started_at - startedAtPre, delta, "started_at shifted by pause delta");

  // match duration math also survives: end the match, duration ≈ pre-pause elapsed
  const endRes = await api(`/api/matches/${live.id}/end`, "PATCH", { team1_score: 21, team2_score: 5 });
  assert.equal(endRes.status, 200, "end match after resume → 200");
  const dur = endRes.match.ended_at - endRes.match.started_at;
  assert.ok(dur < 15, `duration excludes pause time (${dur}s)`);

  // (f) re-pause after resume works
  assert.equal((await api(`/api/sessions/${session.id}/pause`, "PATCH")).status, 200, "re-pause → 200");
  assert.equal((await api(`/api/sessions/${session.id}/resume`, "PATCH")).status, 200, "final resume → 200");

  await api(`/api/sessions/${session.id}/end`, "PATCH");
  console.log("pause.test.js: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

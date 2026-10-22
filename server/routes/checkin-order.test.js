// Server regression: per-session check-in order — 'arrival' appends check-ins in
// arrival order, 'alphabetical' (default) slots them alphabetically; invalid
// values are rejected at session creation.
// Run with: bun server/routes/checkin-order.test.js (QC_TEST_BASE targets a throwaway server — never :3001)
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

async function checkinTwo(sessionId, [first, second]) {
  const ids = [];
  for (const name of [first, second]) {
    const { player } = await api("/api/players", "POST", {
      name,
      skill_level: "intermediate",
    });
    await api(`/api/sessions/${sessionId}/checkin`, "POST", { player_id: player.id });
    ids.push(player.id);
  }
  return ids;
}

async function main() {
  const stray = (await api("/api/sessions/active")).session;
  if (stray) await api(`/api/sessions/${stray.id}/end`, "PATCH");
  const now = Math.floor(Date.now() / 1000);

  // (a) arrival order: Bob checked in before Alice stays ahead of her
  const arrival = (
    await api("/api/sessions", "POST", {
      name: "arrival-test",
      scheduled_start: now,
      scheduled_end: now + 3600,
      checkin_order: "arrival",
    })
  ).session;
  assert.equal(arrival.checkin_order, "arrival", "session echoes checkin_order");
  await checkinTwo(arrival.id, ["Zed Arrival", "Amy Arrival"]);
  await api(`/api/sessions/${arrival.id}/start`, "PATCH");
  let st = await readFirstState();
  let names = st.queue.map((e) => e.name);
  assert.ok(
    names.indexOf("Zed Arrival") < names.indexOf("Amy Arrival"),
    `arrival order keeps check-in sequence, got: ${names.join(",")}`,
  );
  await api(`/api/sessions/${arrival.id}/end`, "PATCH");

  // (b) default (alphabetical): same flow sorts Alice first
  const alpha = (
    await api("/api/sessions", "POST", {
      name: "alpha-test",
      scheduled_start: now,
      scheduled_end: now + 3600,
    })
  ).session;
  assert.equal(alpha.checkin_order, "alphabetical", "default is alphabetical");
  await checkinTwo(alpha.id, ["Zed Alpha", "Amy Alpha"]);
  await api(`/api/sessions/${alpha.id}/start`, "PATCH");
  st = await readFirstState();
  names = st.queue.map((e) => e.name);
  assert.ok(
    names.indexOf("Amy Alpha") < names.indexOf("Zed Alpha"),
    `alphabetical default slots by name, got: ${names.join(",")}`,
  );
  await api(`/api/sessions/${alpha.id}/end`, "PATCH");

  // (c) invalid value rejected
  const bad = await api("/api/sessions", "POST", {
    name: "bad",
    scheduled_start: now,
    scheduled_end: now + 3600,
    checkin_order: "weird",
  });
  assert.equal(bad.status, 400, `invalid checkin_order → 400, got ${bad.status}`);

  console.log("checkin-order.test.js: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

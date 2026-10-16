import assert from "node:assert/strict";

const BASE = process.env.QC_TEST_BASE ?? process.env.BASE_URL ?? "http://localhost:3991/api";

// create a throwaway session
const s = await fetch(`${BASE}/sessions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Test", scheduled_start: 1, scheduled_end: 2, court_count: 1 }),
}).then((r) => r.json());
const sid = s.session.id;

// GET courts — should have 1 seeded by session create
const { courts } = await fetch(`${BASE}/sessions/${sid}/courts`).then((r) => r.json());
assert.equal(courts.length, 1);
assert.equal(courts[0].label, "Court 1");
assert.equal(courts[0].enabled, 1);

// POST — add a second court
const added = await fetch(`${BASE}/sessions/${sid}/courts`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ label: "Court 2" }),
}).then((r) => r.json());
assert.equal(added.court.label, "Court 2");

// PATCH — disable court 1
const patched = await fetch(`${BASE}/courts/${courts[0].id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ enabled: 0 }),
}).then((r) => r.json());
assert.equal(patched.court.enabled, 0);

// DELETE — delete court 2 (no matches)
const del = await fetch(`${BASE}/courts/${added.court.id}`, { method: "DELETE" });
assert.equal(del.status, 204);

console.log("courts.test.js: all assertions passed");

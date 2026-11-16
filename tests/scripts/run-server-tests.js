// Boots a throwaway server (temp DB, fixture players) and runs the API-level
// regression scripts against it — so `bun run test:server` can never write to
// whatever happens to be listening on :3001 (the live container here).
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const db = join(tmpdir(), `queuec-server-tests-${process.pid}.db`);
const rmDb = () =>
  ["", "-wal", "-shm"].forEach((s) => {
    rmSync(db + s, { force: true });
  });
rmDb();

let code = 0;

// Pre-phase: db-backed suites that need no HTTP server. One fresh temp DB per
// file — several of these import db.js directly and would otherwise open the
// repo-root dev DB.
for (const f of [
  "server/db.test.js",
  "server/db.migration.test.js", // self-contained: builds its own fixture + dynamic-imports db.js (plan 005)
  "server/schema.test.js",
  "server/routes/sse.state.test.js",
  "server/routes/matches.test.js",
  "server/routes/queue.test.js",
  // pure logic — no env needed, but sharing the loop is harmless
  "server/logic/smartQueue.test.js",
]) {
  const fileDb = join(tmpdir(), `queuec-${f.replaceAll("/", "-")}-${process.pid}.db`);
  const rmFileDb = () =>
    ["", "-wal", "-shm"].forEach((s) => {
      rmSync(fileDb + s, { force: true });
    });
  rmFileDb();
  const r = Bun.spawnSync(["bun", join(root, f)], {
    cwd: root,
    env: {
      ...process.env,
      DB_PATH: fileDb,
      PLAYERS_PATH: join(root, "tests/fixtures/players.json"),
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  rmFileDb();
  if (r.exitCode !== 0) code = r.exitCode ?? 1;
}

const PORT = 3991;
const server = spawn("bun", ["server/index.js"], {
  cwd: root,
  stdio: "ignore",
  env: {
    ...process.env,
    DB_PATH: db,
    PLAYERS_PATH: join(root, "tests/fixtures/players.json"),
    NODE_ENV: "test",
    PORT: String(PORT),
  },
});
const BASE = `http://localhost:${PORT}`;
const deadline = Date.now() + 30000;
for (;;) {
  try {
    if ((await fetch(`${BASE}/api/sessions/active`)).ok) break;
  } catch {}
  if (server.exitCode !== null) throw new Error("server exited early");
  if (Date.now() > deadline) {
    server.kill();
    rmDb();
    throw new Error("server start timeout");
  }
  await new Promise((r) => setTimeout(r, 100));
}

for (const f of [
  // first: run() asserts the pool equals the preset, so it needs a pristine server
  "server/routes/sessions.test.js",
  "server/routes/automatch.test.js",
  "server/routes/two-match-end.test.js",
  "server/routes/court-stagger.test.js",
  "server/routes/queue-remove.test.js",
  "server/routes/shuttles.test.js",
  "server/routes/pause.test.js",
  "server/routes/match-abort.test.js",
  "server/routes/checkin-order.test.js",
  "server/routes/automatch-locked.test.js",
  // boots its own server on :3992 (needs direct SQL read-back for recompute)
  "server/routes/corrections.test.js",
  "server/routes/attendance.test.js",
  "server/routes/history.test.js",
  "server/routes/career.test.js",
  "server/routes/export.test.js",
  "server/routes/stats-v14.test.js",
  "server/routes/v15-guards.test.js",
  "server/routes/v16-qol.test.js",
  "server/routes/v17-ratings.test.js",
  // registered 2026-11-16: trial-verified against the shared server (see plans/002)
  "server/routes/alphabetical-insert.test.js",
  "server/routes/courts.test.js",
  "server/routes/matches.integration.test.js",
  "server/routes/metrics.test.js", // expectations aligned in this plan
  "server/routes/players-queue.test.js",
  "server/routes/slate.test.js", // expectation aligned in this plan (Step 5b)
  "server/routes/stats.test.js", // expectations aligned in this plan
  // registered 2026-11-16: plan 004 request-validation guards (one case per rule)
  "server/routes/validation.test.js",
]) {
  const r = Bun.spawnSync(["bun", join(root, f)], {
    cwd: root,
    env: {
      ...process.env,
      QC_TEST_BASE: BASE,
      BASE_URL: `${BASE}/api`,
      PLAYERS_PATH: join(root, "tests/fixtures/players.json"),
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  if (r.exitCode !== 0) code = r.exitCode ?? 1;
}

server.kill();
rmDb();
process.exit(code);

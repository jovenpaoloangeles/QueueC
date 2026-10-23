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

let code = 0;
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
]) {
  const r = Bun.spawnSync(["bun", join(root, f)], {
    cwd: root,
    env: { ...process.env, QC_TEST_BASE: BASE, PLAYERS_PATH: join(root, "tests/fixtures/players.json") },
    stdout: "inherit",
    stderr: "inherit",
  });
  if (r.exitCode !== 0) code = r.exitCode ?? 1;
}

server.kill();
rmDb();
process.exit(code);

// Custom Playwright test: one server process + one temp SQLite DB per worker.

import { execFileSync, spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const PLAYERS = join(here, "fixtures/players.json");
const fixture = JSON.parse(readFileSync(PLAYERS, "utf8"));
const keep = fixture.map((p) => `'${p.name.replace(/'/g, "''")}'`).join(",");
const RESET_SQL = `
  DELETE FROM matches; DELETE FROM courts; DELETE FROM queue_entries; DELETE FROM sessions;
  DELETE FROM players WHERE name NOT IN (${keep});
  ${fixture
    .map(
      (
        p,
      ) => `INSERT INTO players (name, skill_level, created_at) SELECT '${p.name.replace(/'/g, "''")}', '${p.skill_level}', strftime('%s','now') WHERE NOT EXISTS (SELECT 1 FROM players WHERE name = '${p.name.replace(/'/g, "''")}');
  UPDATE players SET skill_level = '${p.skill_level}' WHERE name = '${p.name.replace(/'/g, "''")}';`,
    )
    .join("\n")}`;

const rmDb = (p) =>
  ["", "-wal", "-shm"].forEach((s) => {
    rmSync(p + s, { force: true });
  });

export const test = base.extend({
  server: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures must take the destructured args object
    async ({}, use, workerInfo) => {
      const port = Number(process.env.PW_BASE_PORT ?? 3410) + workerInfo.parallelIndex;
      const dbPath = join(tmpdir(), `queuec-w${port}.db`);
      rmDb(dbPath);
      const proc = spawn("bun", ["server/index.js"], {
        cwd: root,
        stdio: "ignore",
        env: { ...process.env, DB_PATH: dbPath, PLAYERS_PATH: PLAYERS, NODE_ENV: "test", PORT: String(port) },
      });
      const url = `http://localhost:${port}`;
      const deadline = Date.now() + 30000;
      for (;;) {
        try {
          if ((await fetch(`${url}/api/sessions/active`)).ok) break;
        } catch {}
        if (proc.exitCode !== null) throw new Error(`server exited early (port ${port})`);
        if (Date.now() > deadline) {
          proc.kill();
          throw new Error("server start timeout");
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      process.env.QC_BASE = url; // per-worker process => safe
      await use({ base: url, port, dbPath });
      proc.kill();
      await new Promise((r) => (proc.exitCode !== null ? r() : proc.once("exit", r)));
      rmDb(dbPath);
    },
    { scope: "worker", auto: true },
  ],

  baseURL: async ({ server }, use) => use(server.base),

  // Per-test reset: direct row wipe (same as old globalSetup). Direct DB exec is
  // robust (no dependence on app endpoints, handles leaked players) at ~40ms/test.
  _reset: [
    async ({ server }, use) => {
      execFileSync("bun", [
        "-e",
        `import { Database } from 'bun:sqlite'; const db = new Database(${JSON.stringify(server.dbPath)}); db.exec('PRAGMA busy_timeout=5000'); db.exec(${JSON.stringify(RESET_SQL)}); db.close();`,
      ]);
      await use();
    },
    { auto: true },
  ],
});

export { expect };

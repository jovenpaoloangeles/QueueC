#!/usr/bin/env bun
// test:touched — print the e2e spec files whose code a git rev touches.
// Dumb and grep-based on purpose: no manifest to maintain.
//
//   bun run test:touched -- [rev]     (rev defaults to HEAD~1)
//
// Mapping:
//   - a changed tests/e2e/*.spec.js  → itself
//   - changed server/**              → nothing (server routes are covered by
//     `bun test server/`; e2e specs exercise them through the UI, so there are
//     no per-route e2e specs — don't expect any)
//   - anything else                  → grep the spec sources for the changed
//     path / basename; if that misses, split the basename into camelCase /
//     hyphen words (>=4 chars) and take the specs containing all of them
//     (e.g. QueueGrid.jsx → "queue" AND "grid").
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const rev = process.argv[2] ?? "HEAD~1";
const changed = execFileSync("git", ["diff", "--name-only", rev], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
if (!changed.length) {
  console.log(`no files changed vs ${rev}`);
  process.exit(0);
}

const specs = readdirSync("tests/e2e")
  .filter((f) => f.endsWith(".spec.js"))
  .sort()
  .map((f) => `tests/e2e/${f}`);
const src = new Map(specs.map((f) => [f, readFileSync(f, "utf8").toLowerCase()]));

const hits = new Set();
let touchedServer = false;
for (const f of changed) {
  if (/^tests\/e2e\/.+\.spec\.js$/.test(f)) {
    hits.add(f);
    continue;
  }
  if (f.startsWith("server/")) {
    touchedServer = true;
    continue;
  }
  const base = f.split("/").pop();
  const stem = base.replace(/\.[a-z]+$/, "");
  const words = stem
    .split(/(?<=[a-z])(?=[A-Z])|[-_]/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 4);
  for (const [spec, text] of src) {
    if (text.includes(f.toLowerCase()) || text.includes(base.toLowerCase())) {
      hits.add(spec);
      continue;
    }
    if (words.length && words.every((w) => text.includes(w))) hits.add(spec);
  }
}

if (touchedServer) console.error("# server/** changed: no e2e mapping — covered by `bun test server/`");
for (const s of [...hits].sort()) console.log(s);

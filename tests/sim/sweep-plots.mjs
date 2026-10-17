// Renders static SVG plots for docs/simulation-sweep-report.md from the cell
// means dumped by sweep-sim.mjs (docs/sweep-cells.json):
//   bun tests/sim/sweep-sim.mjs        # ~5 min, writes sweep-cells.json
//   bun tests/sim/sweep-plots.mjs      # <1s, re-renders docs/sweep-plots/*.svg
//
// Static SVG (no scripts) so the images render on GitHub. Light-surface card
// with the reference dataviz palette; density series keep a fixed hue order.
// Aqua sits below 3:1 on the light surface — relief via the report's tables.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const cells = JSON.parse(readFileSync(new URL("../../docs/sweep-cells.json", import.meta.url)));

// Palette (validated: categorical slots 1–3, all-pairs safe in light mode)
const DENSITY_COLORS = { light: "#2a78d6", normal: "#eb6834", peak: "#1baf7a" };
const DENSITIES = ["light", "normal", "peak"];
const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#898781" };
const GRID = "#e1e0d9";
const BASELINE = "#c3c2b7";
const SURFACE = "#fcfcfb";
const FONT = `system-ui,-apple-system,"Segoe UI",sans-serif`;
const DE = "EPSILON_LEX";

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
// mean of a policy metric over every cell matching the selector
const agg = (sel, p, f) =>
  mean(cells.filter((c) => Object.entries(sel).every(([k, v]) => c[k] === v)).map((c) => c.policies[p][f]));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// ---------- tiny SVG kit ----------

function svgDoc(w, h, title, subtitle, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<rect width="${w}" height="${h}" fill="${SURFACE}"/>
<text x="20" y="30" font-family='${FONT}' font-size="15" font-weight="600" fill="${INK.primary}">${esc(title)}</text>
<text x="20" y="50" font-family='${FONT}' font-size="12" fill="${INK.secondary}">${esc(subtitle)}</text>
${body}
</svg>`;
}

function legend(x, y, entries) {
  let out = "";
  let cx = x;
  for (const [label, color] of entries) {
    out += `<line x1="${cx}" y1="${y - 4}" x2="${cx + 18}" y2="${y - 4}" stroke="${color}" stroke-width="2" stroke-linecap="round"/><circle cx="${cx + 9}" cy="${y - 4}" r="4" fill="${color}" stroke="${SURFACE}" stroke-width="2"/>`;
    out += `<text x="${cx + 24}" y="${y}" font-family='${FONT}' font-size="12" fill="${INK.secondary}">${esc(label)}</text>`;
    cx += 24 + label.length * 6.6 + 22;
  }
  return out;
}

function yScale(y0, y1, top, bottom, max) {
  const y = (v) => bottom - ((v - y0) / (max - y0)) * (bottom - top);
  const ticks = [];
  for (let v = 0; v <= max; v += max / 5) ticks.push(v);
  return { y, ticks };
}

function yAxis(x, { y, ticks }, width, fmt = (v) => String(+v.toFixed(1))) {
  let out = "";
  for (const v of ticks) {
    if (v === 0) continue;
    out += `<line x1="${x}" y1="${y(v)}" x2="${x + width}" y2="${y(v)}" stroke="${GRID}" stroke-width="1"/>`;
    out += `<text x="${x - 8}" y="${y(v) + 4}" text-anchor="end" font-family='${FONT}' font-size="11" fill="${INK.muted}">${fmt(v)}</text>`;
  }
  return out;
}

const dot = (cx, cy, color) =>
  `<circle cx="${cx}" cy="${cy}" r="4" fill="${color}" stroke="${SURFACE}" stroke-width="2"/>`;

// ---------- aggregation ----------

const COURTS = [1, 2, 3, 4];

// Fig 1 — max wait, FIFO vs This Algorithm panels, 3 density lines
function figMaxWait() {
  const W = 940;
  const top = 104;
  const bottom = 300;
  const pw = 330; // panel plot width
  const px = [70, 70 + pw + 130]; // 130px gutter for the first panel's end labels
  const maxV = 35;
  const pol = [
    ["FIFO", "FIFO"],
    ["This Algorithm", DE],
  ];
  const s = yScale(0, maxV, top, bottom, maxV);
  const x = (pi, c) => px[pi] + ((c - 1) / 3) * pw;
  let body = yAxis(70, { y: s.y, ticks: s.ticks }, pw, (v) => String(v));
  body += `<text x="28" y="${(top + bottom) / 2}" font-family='${FONT}' font-size="11" fill="${INK.muted}" transform="rotate(-90 28 ${(top + bottom) / 2})" text-anchor="middle">Max wait (min)</text>`;

  pol.forEach(([label, key], pi) => {
    body += `<text x="${px[pi]}" y="${top - 12}" font-family='${FONT}' font-size="12" font-weight="600" fill="${INK.primary}">${esc(label)}</text>`;
    body += `<line x1="${px[pi]}" y1="${bottom}" x2="${px[pi] + pw}" y2="${bottom}" stroke="${BASELINE}" stroke-width="1"/>`;
    for (const c of COURTS) {
      body += `<text x="${x(pi, c)}" y="${bottom + 18}" text-anchor="middle" font-family='${FONT}' font-size="11" fill="${INK.muted}">${c}</text>`;
    }
    const ends = [];
    for (const d of DENSITIES) {
      const pts = COURTS.map((c) => [x(pi, c), s.y(agg({ courts: c, density: d }, key, "max_wait_mins"))]);
      const color = DENSITY_COLORS[d];
      body += `<path d="M${pts.map((p) => p.join(",")).join(" L")}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      for (const [cx2, cy2] of pts) body += dot(cx2, cy2, color);
      ends.push([d, pts[3]]);
    }
    ends.sort((a, b) => a[1][1] - b[1][1]);
    for (let i = 1; i < ends.length; i++) {
      if (ends[i][1][1] - ends[i - 1][1][1] < 16) ends[i][1][1] = ends[i - 1][1][1] + 16;
    }
    for (const [d, [ex, ey]] of ends) {
      body += `<circle cx="${ex + 14}" cy="${ey}" r="4" fill="${DENSITY_COLORS[d]}"/>`;
      body += `<text x="${ex + 22}" y="${ey + 4}" font-family='${FONT}' font-size="12" fill="${INK.secondary}">${d}</text>`;
    }
  });
  body += `<text x="${px[0] + pw / 2}" y="${bottom + 38}" text-anchor="middle" font-family='${FONT}' font-size="11" fill="${INK.muted}">Courts</text>`;
  body += `<text x="${px[1] + pw / 2}" y="${bottom + 38}" text-anchor="middle" font-family='${FONT}' font-size="11" fill="${INK.muted}">Courts</text>`;
  return svgDoc(
    W,
    348,
    "Longest wait of the session — FIFO vs This Algorithm",
    "Max wait (min), mean over session lengths and skill mixes. Left panel FIFO, right panel This Algorithm.",
    legend(70, 74, DENSITIES.map((d) => [d, DENSITY_COLORS[d]])) + body,
  );
}

// Fig 2 — cohort SD ratio (TA/FIFO), grouped bars + 0.65 gate
function figSdRatio() {
  const W = 880;
  const top = 96;
  const bottom = 320;
  const left = 70;
  const pw = 740;
  const maxV = 1.0;
  const s = yScale(0, maxV, top, bottom, maxV);
  const x = (c) => left + ((c - 1) / 3) * pw;
  const bw = 22;
  let body = yAxis(left, { y: s.y, ticks: s.ticks }, pw, (v) => v.toFixed(1));
  body += `<text x="28" y="${(top + bottom) / 2}" font-family='${FONT}' font-size="11" fill="${INK.muted}" transform="rotate(-90 28 ${(top + bottom) / 2})" text-anchor="middle">Cohort SD, This Algorithm / FIFO</text>`;
  body += `<line x1="${left}" y1="${bottom}" x2="${left + pw}" y2="${bottom}" stroke="${BASELINE}" stroke-width="1"/>`;
  // 0.65 gate reference
  const gy = s.y(0.65);
  body += `<line x1="${left}" y1="${gy}" x2="${left + pw}" y2="${gy}" stroke="${INK.muted}" stroke-width="1" stroke-dasharray="4 3"/>`;
  body += `<text x="${left + pw / 6}" y="${gy - 6}" text-anchor="middle" font-family='${FONT}' font-size="11" fill="${INK.muted}">0.65 gate</text>`;
  for (const c of COURTS) {
    body += `<text x="${x(c)}" y="${bottom + 18}" text-anchor="middle" font-family='${FONT}' font-size="11" fill="${INK.muted}">${c} court${c > 1 ? "s" : ""}</text>`;
    DENSITIES.forEach((d, di) => {
      const ratio = agg({ courts: c, density: d }, DE, "mean_cohort_sd") / agg({ courts: c, density: d }, "FIFO", "mean_cohort_sd");
      const bx = x(c) - ((DENSITIES.length * bw + (DENSITIES.length - 1) * 2) / 2) + di * (bw + 2);
      const by = s.y(Math.min(ratio, maxV));
      const bh = bottom - by;
      body += `<path d="M${bx},${bottom} L${bx},${by + 4} Q${bx},${by} ${bx + 4},${by} L${bx + bw - 4},${by} Q${bx + bw},${by} ${bx + bw},${by + 4} L${bx + bw},${bottom} Z" fill="${DENSITY_COLORS[d]}"/>`;
    });
  }
  return svgDoc(
    W,
    372,
    "Cohort skill spread vs FIFO (1.0 = same as FIFO)",
    "Mean cohort skill SD, This Algorithm relative to FIFO — lower is more evenly matched. Grouped by crowd density.",
    legend(70, 76, DENSITIES.map((d) => [d, DENSITY_COLORS[d]])) + body,
  );
}

// Fig 3 — competitive-game share dumbbell, FIFO (gray) -> TA (blue)
function figCompetitive() {
  const W = 880;
  const rowH = 24;
  const top = 96;
  const bottom = top + DENSITIES.length * COURTS.length * rowH + 44;
  const left = 150;
  const pw = 620;
  const maxV = 100;
  const sx = (v) => left + (v / maxV) * pw;
  const rows = [];
  for (const c of COURTS) for (const d of DENSITIES) rows.push([c, d]);
  let body = "";
  for (let v = 0; v <= maxV; v += 25) {
    body += `<line x1="${sx(v)}" y1="${top}" x2="${sx(v)}" y2="${top + rows.length * rowH}" stroke="${GRID}" stroke-width="1"/>`;
    body += `<text x="${sx(v)}" y="${bottom - 6}" text-anchor="middle" font-family='${FONT}' font-size="11" fill="${INK.muted}">${v}%</text>`;
  }
  body += `<text x="${left + pw / 2}" y="${bottom + 16}" text-anchor="middle" font-family='${FONT}' font-size="11" fill="${INK.muted}">Competitive games (% of session games)</text>`;
  rows.forEach(([c, d], i) => {
    const cy = top + i * rowH + rowH / 2;
    const f = agg({ courts: c, density: d }, "FIFO", "competitive_game_pct");
    const t = agg({ courts: c, density: d }, DE, "competitive_game_pct");
    if (i % 4 === 0) {
      body += `<text x="${left - 12}" y="${cy + 4}" text-anchor="end" font-family='${FONT}' font-size="12" fill="${INK.secondary}">${c} court${c > 1 ? "s" : ""}</text>`;
    }
    body += `<line x1="${sx(f)}" y1="${cy}" x2="${sx(t)}" y2="${cy}" stroke="${GRID}" stroke-width="2"/>`;
    body += dot(sx(f), cy, "#898781");
    body += dot(sx(t), cy, "#2a78d6");
  });
  return svgDoc(
    W,
    Math.ceil(bottom) + 8,
    "Competitive-game share — FIFO to This Algorithm",
    "Share of games with a balanced cohort (skill SD ≤ 1.0) and even teams (team diff ≤ 0.5). Gray: FIFO. Blue: This Algorithm.",
    legend(left, 76, [
      ["FIFO", "#898781"],
      ["This Algorithm", "#2a78d6"],
    ]) + body,
  );
}

// Fig 4 — latecomer bursts by court count, LRG (gray) vs TA (blue)
function figBursts() {
  const W = 880;
  const top = 96;
  const bottom = 300;
  const left = 70;
  const pw = 620;
  const maxV = 25;
  const s = yScale(0, maxV, top, bottom, maxV);
  const x = (c) => left + ((c - 1) / 3) * pw;
  let body = yAxis(left, { y: s.y, ticks: s.ticks }, pw, (v) => String(v));
  body += `<text x="28" y="${(top + bottom) / 2}" font-family='${FONT}' font-size="11" fill="${INK.muted}" transform="rotate(-90 28 ${(top + bottom) / 2})" text-anchor="middle">Latecomer bursts / session</text>`;
  body += `<line x1="${left}" y1="${bottom}" x2="${left + pw}" y2="${bottom}" stroke="${BASELINE}" stroke-width="1"/>`;
  for (const c of COURTS) {
    body += `<text x="${x(c)}" y="${bottom + 18}" text-anchor="middle" font-family='${FONT}' font-size="11" fill="${INK.muted}">${c}</text>`;
  }
  body += `<text x="${left + pw / 2}" y="${bottom + 38}" text-anchor="middle" font-family='${FONT}' font-size="11" fill="${INK.muted}">Courts</text>`;
  const series = [
    ["Lowest Raw Games", "LOWEST_RAW_GAMES", "#898781"],
    ["This Algorithm", DE, "#2a78d6"],
  ];
  const ends = [];
  for (const [label, key, color] of series) {
    const pts = COURTS.map((c) => [x(c), s.y(agg({ courts: c }, key, "latecomer_consec_bursts"))]);
    body += `<path d="M${pts.map((p) => p.join(",")).join(" L")}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (const [cx2, cy2] of pts) body += dot(cx2, cy2, color);
    ends.push([label, color, pts[3]]);
  }
  ends.sort((a, b) => a[2][1] - b[2][1]);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i][2][1] - ends[i - 1][2][1] < 16) ends[i][2][1] = ends[i - 1][2][1] + 16;
  }
  for (const [label, color, [ex, ey]] of ends) {
    body += `<circle cx="${ex + 14}" cy="${ey}" r="4" fill="${color}"/>`;
    body += `<text x="${ex + 22}" y="${ey + 4}" font-family='${FONT}' font-size="12" fill="${INK.secondary}">${esc(label)}</text>`;
  }
  return svgDoc(
    W,
    348,
    "Latecomer back-to-back games per session",
    "Sessions where a latecomer plays consecutive games — mean over session lengths, densities, and skill mixes.",
    legend(left, 76, [
      ["Lowest Raw Games", "#898781"],
      ["This Algorithm", "#2a78d6"],
    ]) + body,
  );
}

mkdirSync(new URL("../../docs/sweep-plots/", import.meta.url), { recursive: true });
const figs = {
  "max-wait.svg": figMaxWait(),
  "cohort-sd-ratio.svg": figSdRatio(),
  "competitive.svg": figCompetitive(),
  "latecomer-bursts.svg": figBursts(),
};
for (const [name, svg] of Object.entries(figs)) {
  writeFileSync(new URL(`../../docs/sweep-plots/${name}`, import.meta.url), svg);
  console.log(`wrote docs/sweep-plots/${name}`);
}

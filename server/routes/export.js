// v1.3 exports: CSV/JSON downloads of the exact payloads the history/career
// pages render (builders in stats.js). CSV sections are #-comment headers so
// the file stays readable in a text editor.
import { Hono } from "hono";
import { getCareer, getSessionDetail } from "./stats.js";

const router = new Hono();

/** RFC 4180 quoting: quote fields containing quotes, commas, or newlines. */
function csvField(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function csvTable(header, rows) {
  const lines = [header, ...rows].map((r) => r.map(csvField).join(","));
  return lines.join("\n") + "\n";
}

const iso = (ts) => (ts == null ? "" : new Date(ts * 1000).toISOString());

router.get("/sessions/:id/export", (c) => {
  const detail = getSessionDetail(c.req.param("id"));
  if (!detail) return c.json({ error: "Session not found" }, 404);
  const filename = `session-${detail.session.id}-detail`;

  if (c.req.query("format") === "json") {
    return c.body(JSON.stringify(detail), 200, {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}.json"`,
    });
  }

  const lb = csvTable(
    ["name", "played", "wins", "losses", "win_rate", "point_diff"],
    detail.leaderboard.map((r) => [r.name, r.played, r.wins, r.losses, r.win_rate, r.point_diff]),
  );
  const games = csvTable(
    [
      "id",
      "format",
      "state",
      "court_number",
      "started_at",
      "ended_at",
      "team1",
      "team2",
      "team1_score",
      "team2_score",
      "rating",
      "new_shuttles",
      "used_shuttles",
    ],
    detail.games.map((g) => [
      g.id,
      g.format,
      g.state,
      g.court_number ?? "",
      iso(g.started_at),
      iso(g.ended_at),
      g.team1.map((p) => p.name).join(" & "),
      g.team2.map((p) => p.name).join(" & "),
      g.team1_score,
      g.team2_score,
      g.rating ?? "",
      g.new_shuttles,
      g.used_shuttles,
    ]),
  );
  const attendance = csvTable(
    ["name", "status", "checked_in_at"],
    detail.attendance.map((a) => [a.name, a.status, iso(a.checked_in_at)]),
  );
  const shuttles = csvTable(
    ["new", "used", "extra", "total"],
    [[detail.shuttles.new, detail.shuttles.used, detail.shuttles.extra, detail.shuttles.total]],
  );

  return c.body(
    `# Leaderboard\n${lb}\n# Games\n${games}\n# Attendance\n${attendance}\n# Shuttles\n${shuttles}`,
    200,
    {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  );
});

router.get("/players/:id/career/export", (c) => {
  const career = getCareer(c.req.param("id"));
  if (!career) return c.json({ error: "Player not found" }, 404);
  const filename = `player-${career.player.id}-career`;

  if (c.req.query("format") === "json") {
    return c.body(JSON.stringify(career), 200, {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}.json"`,
    });
  }

  const t = career.totals;
  const totals = csvTable(
    ["games", "wins", "losses", "win_rate", "point_diff", "seconds_played"],
    [[t.games, t.wins, t.losses, t.win_rate, t.point_diff, t.seconds_played]],
  );
  const record = (list) =>
    csvTable(
      ["name", "games", "wins", "losses", "win_rate"],
      list.map((p) => [p.name, p.games, p.wins, p.losses, p.win_rate]),
    );
  const partners = record(career.partners);
  const opponents = record(career.opponents);
  const attendance = csvTable(
    ["session", "date", "games_played"],
    career.attendance.sessions.map((s) => [s.name, iso(s.date), s.games_played]),
  );
  const months = csvTable(
    ["month", "attended", "total", "pct"],
    career.attendance.months.map((m) => [m.month, m.attended, m.total, m.pct]),
  );

  return c.body(
    `# Totals\n${totals}\n# Partners\n${partners}\n# Opponents\n${opponents}\n# Attendance\n${attendance}\n# Months\n${months}`,
    200,
    {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  );
});

export default router;

// v1.4 share recap: plain-text session summary for the group chat, built from
// the GET /sessions/:id/detail payload.
// ponytail: text only — a generated PNG/photo card can come later if the
// group chat wants images.
export function buildRecap({ session, leaderboard, games, attendance, shuttles, highlights }) {
  const played = games.filter((g) => g.state === "active" && g.ended_at != null).length;
  const players = new Set(attendance.map((a) => a.player_id)).size;
  const lines = [`🏸 ${session.name}`, `${players} players · ${played} games · ${shuttles.total} shuttles`];
  const top = leaderboard[0];
  if (top) lines.push(`🏆 Top: ${top.name} (${top.wins}-${top.losses}, ${top.win_rate}%)`);
  const busiest = [...leaderboard].sort((a, b) => b.played - a.played)[0];
  if (busiest) lines.push(`🎽 Most games: ${busiest.name} (${busiest.played})`);
  // one line per highlight type, top 3 names — the full list lives on the page
  for (const line of highlightLines(highlights, 3)) lines.push(line);
  return lines.join("\n");
}

// shared with the session page: [emoji label, "Name (n), …"] per non-empty type
export function highlightGroups(highlights, limit = Infinity) {
  const top = (list, fmt) => list.slice(0, limit).map(fmt).join(", ") + (list.length > limit ? ", …" : "");
  return [
    ["🔥 Win streaks", highlights?.win_streaks ?? [], (s) => `${s.name} (${s.streak})`],
    ["🎉 Milestones", highlights?.milestones ?? [], (m) => `${m.name} (game #${m.game})`],
    ["📅 Attendance streaks", highlights?.attendance_streaks ?? [], (s) => `${s.name} (${s.streak})`],
  ]
    .filter(([, list]) => list.length)
    .map(([label, list, fmt]) => ({ label, list, text: top(list, fmt) }));
}

const highlightLines = (highlights, limit) =>
  highlightGroups(highlights, limit).map((g) => `${g.label}: ${g.text}`);

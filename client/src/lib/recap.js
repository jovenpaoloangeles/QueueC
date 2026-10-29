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
  for (const s of highlights?.win_streaks ?? []) lines.push(`🔥 ${s.name}: ${s.streak} wins in a row`);
  for (const m of highlights?.milestones ?? []) lines.push(`🎉 ${m.name}: game #${m.game}`);
  for (const s of highlights?.attendance_streaks ?? [])
    lines.push(`📅 ${s.name}: ${s.streak} sessions in a row`);
  return lines.join("\n");
}

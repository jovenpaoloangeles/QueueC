import { useEffect, useState } from "react";
import { getPlayerCareer } from "@/api";
import HistoryShell from "./HistoryShell.jsx";

// v1.3 player career: all-time totals, doubles partners, per-session
// attendance and monthly attendance %. Data from GET /players/:id/career.
const fmtHours = (seconds) => (seconds / 3600).toFixed(1);
const fmtMonth = (month) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString([], { month: "long", year: "numeric" });
const fmtDate = (ts) =>
  ts ? new Date(ts * 1000).toLocaleDateString([], { month: "short", day: "numeric" }) : "—";

export default function CareerPage({ id }) {
  const [career, setCareer] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getPlayerCareer(id)
      .then((c) => !cancelled && setCareer(c))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error)
    return (
      <HistoryShell title="Player">
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-destructive shadow-card">
          {error}
        </div>
      </HistoryShell>
    );
  if (!career)
    return (
      <HistoryShell title="Player">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </HistoryShell>
    );

  const { player, totals, partners, attendance } = career;

  return (
    <HistoryShell title={player.name} back="#/history">
      <div className="flex flex-col gap-4">
        {/* all-time totals strip */}
        <section
          data-testid="career-totals"
          className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border shadow-card sm:grid-cols-5"
          aria-label="Career totals"
        >
          {[
            ["Games", totals.games],
            ["W/L", `${totals.wins}/${totals.losses}`],
            ["Win %", `${totals.win_rate}%`],
            ["Pt Diff", totals.point_diff > 0 ? `+${totals.point_diff}` : totals.point_diff],
            ["Hours", fmtHours(totals.seconds_played)],
          ].map(([label, value]) => (
            <div key={label} className="bg-card px-4 py-3">
              <div className="text-[12.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className="font-mono text-lg font-bold tabular-nums">{value}</div>
            </div>
          ))}
        </section>

        {/* doubles partners */}
        <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Partners">
          <h2 className="border-b border-border px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Partners
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[12.5px] text-muted-foreground">
                <th className="px-4 py-2 font-medium">Player</th>
                <th className="px-2 py-2 font-medium">Games</th>
                <th className="px-2 py-2 font-medium">W/L</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.player_id} data-testid="career-partner-row" className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <a href={`#/players/${p.player_id}`} className="font-medium text-foreground hover:text-primary">
                      {p.name}
                    </a>
                  </td>
                  <td className="px-2 py-2 font-mono tabular-nums">{p.games}</td>
                  <td className="px-2 py-2 font-mono tabular-nums text-muted-foreground">
                    {p.wins}/{p.losses}
                  </td>
                </tr>
              ))}
              {partners.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                    No doubles games yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* per-session attendance */}
          <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Sessions attended">
            <h2 className="border-b border-border px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sessions
            </h2>
            <ul className="divide-y divide-border">
              {attendance.sessions.map((s) => (
                <li key={s.session_id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <a href={`#/history/${s.session_id}`} className="font-medium text-foreground hover:text-primary">
                    {s.name}
                  </a>
                  <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
                    {fmtDate(s.date)} · {s.games_played} games
                  </span>
                </li>
              ))}
              {attendance.sessions.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">No sessions yet.</li>
              )}
            </ul>
          </section>

          {/* monthly attendance % */}
          <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Monthly attendance">
            <h2 className="border-b border-border px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Attendance by month
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[12.5px] text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Month</th>
                  <th className="px-2 py-2 font-medium">Attended</th>
                  <th className="px-2 py-2 font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {attendance.months.map((m) => (
                  <tr key={m.month} data-testid="career-month-row" className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{fmtMonth(m.month)}</td>
                    <td className="px-2 py-2 font-mono tabular-nums text-muted-foreground">
                      {m.attended}/{m.total}
                    </td>
                    <td className="px-2 py-2 font-mono font-bold tabular-nums">{m.pct}%</td>
                  </tr>
                ))}
                {attendance.months.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      No ended sessions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </HistoryShell>
  );
}

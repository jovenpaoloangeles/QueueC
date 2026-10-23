import { useEffect, useState } from "react";
import { getSessions } from "@/api";
import HistoryShell from "./HistoryShell.jsx";

// v1.3 history browser: every ended session, newest first, one row per session
// with the card aggregates from GET /sessions (players/matches/shuttles).
const fmtDate = (ts) =>
  new Date(ts * 1000).toLocaleDateString([], { month: "short", day: "numeric" });

export default function HistoryPage() {
  const [sessions, setSessions] = useState(null);
  useEffect(() => {
    let live = true;
    getSessions()
      .then((d) => live && setSessions(d.sessions))
      .catch(() => live && setSessions([]));
  }, []);
  return (
    <HistoryShell title="History" back="#/">
      <div data-testid="history-list" className="flex flex-col gap-2">
        {sessions === null && (
          <div className="text-sm text-muted-foreground">Loading…</div>
        )}
        {sessions?.length === 0 && (
          <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-card">
            No past sessions yet.
          </div>
          )}
        {sessions?.length > 0 &&
          sessions.map((s) => (
            <a
              key={s.id}
              href={`#/history/${s.id}`}
              data-testid="history-row"
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-card transition-colors hover:border-primary/40"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold text-foreground">{s.name}</div>
                <div className="text-[12.5px] text-muted-foreground">
                  {fmtDate(s.ended_at)} · {s.players} players · {s.matches} matches · {s.shuttles_total} shuttles
                </div>
              </div>
              <span className="shrink-0 text-[12.5px] text-muted-foreground" aria-hidden="true">
                →
              </span>
            </a>
          ))}
      </div>
    </HistoryShell>
  );
}

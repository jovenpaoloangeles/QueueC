import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { pauseSession, resumeSession } from "@/api";
import { toggleTheme } from "@/lib/theme";
import { cn, fmtClock, fmtDur, netWait } from "@/lib/utils";
import EndSessionConfirmDialog from "./EndSessionConfirmDialog.jsx";

export default function Header({ session, sseData, draftedIds = new Set(), onSmartMatch, onEndSession, onCheatsheet }) {
  const [elapsed, setElapsed] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const paused = session?.paused_at != null;

  useEffect(() => {
    if (!session || session.started_at == null) return;
    // paused: the pill pins to the pause moment (server also freezes serverTime there)
    const base = (session.paused_at ?? Math.floor(Date.now() / 1000)) - session.started_at;
    setElapsed(base);
    if (paused) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [session?.id, session?.started_at, session]);

  const togglePause = () => (paused ? resumeSession(session.id) : pauseSession(session.id)).catch(() => {});

  const fmtTime = (ts) =>
    ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

  // ---- live indicators, all derived client-side from the SSE payload ----
  const queue = sseData?.queue ?? [];
  const courts = sseData?.courts ?? [];
  const stats = sseData?.stats;
  const serverTime = sseData?.serverTime ?? Math.floor(Date.now() / 1000);

  const courtsLive = courts.filter(
    (c) =>
      c.enabled &&
      (c.expires_at == null || serverTime < c.expires_at) &&
      (c.active_from == null || serverTime >= c.active_from) &&
      (c.active_until == null || serverTime < c.active_until),
  ).length;

  // staged entries are excluded server-side from the SSE queue; drafted entries
  // (sitting in a court's lineup slots) are held locally and don't read as available
  const waiting = queue.filter((e) => e.status === "waiting" && !draftedIds.has(e.id));
  const longest = waiting.reduce(
    (best, e) => {
      const secs = netWait(serverTime, e);
      return secs > best.secs ? { secs, name: e.name } : best;
    },
    { secs: 0, name: null },
  );

  const ChipDot = ({ tone }) => (
    <span className={cn("size-2 shrink-0 rounded-full", tone)} aria-hidden="true" />
  );

  // session name "NAME (date)" → one line: NAME (uppercased) · date;
  // without ' (' the full name renders alone (defensive path)
  function SessionNameBlock({ name }) {
    const idx = (name ?? "").indexOf(" (");
    const namePart = idx === -1 ? (name ?? "") : name.slice(0, idx);
    const datePart = idx === -1 ? null : name.slice(idx + 2, name.length - 1);
    return (
      <span data-testid="header-session-name" className="whitespace-nowrap">
        <span className="text-[13.5px] font-bold tracking-wide text-foreground">
          {namePart.toUpperCase()}
        </span>
        {datePart != null && <span className="text-[12.5px] text-muted-foreground"> · {datePart}</span>}
      </span>
    );
  }

  return (
    <div className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/70 px-5 backdrop-blur-xl backdrop-saturate-150">
      {/* brand — green app dot + wordmark; session name + date inline as a single line */}
      <div data-testid="brand" className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="size-2.5 shrink-0 self-center rounded-[5px] bg-primary" aria-hidden="true" />
        <span className="text-[15px] font-bold tracking-tight text-foreground">QueueC</span>
        {session ? (
          <>
            <SessionNameBlock name={session.name} />
            <span
              data-testid="header-time-range"
              className="text-[12.5px] uppercase tracking-wider text-muted-foreground"
            >
              {fmtTime(session.scheduled_start)}–{fmtTime(session.scheduled_end)}
            </span>
          </>
        ) : (
          <span className="text-[12.5px] uppercase tracking-wider text-muted-foreground">
            No active session
          </span>
        )}
      </div>

      {/* live status chips — draft `.chips`, space-evenly, hidden under lg */}
      <div aria-label="Session status" className="hidden flex-1 items-center justify-evenly px-2 lg:flex">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-muted-foreground">
          <ChipDot tone="bg-primary" />
          Courts{" "}
          <b data-testid="hdr-courts" className="font-mono font-bold tabular-nums text-foreground">
            {courtsLive} / {courts.length}
          </b>
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-muted-foreground">
          <ChipDot tone="bg-amber-500" />
          Waiting{" "}
          <b data-testid="hdr-waiting" className="font-mono font-bold tabular-nums text-amber">
            {waiting.length}
          </b>
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-muted-foreground">
          <ChipDot tone="bg-destructive" />
          Longest{" "}
          <b
            data-testid="hdr-longest"
            className={cn("font-bold text-foreground", !longest.name && "text-muted-foreground")}
          >
            {longest.name ? (
              <>
                {longest.name}{" "}
                <span className="font-mono font-semibold text-destructive">({fmtDur(longest.secs)})</span>
              </>
            ) : (
              "—"
            )}
          </b>
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-muted-foreground">
          <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden="true" />
          Avg wait{" "}
          <b data-testid="hdr-avg" className="font-mono font-bold tabular-nums text-foreground">
            {fmtClock(stats?.avg_wait_seconds)}
          </b>
        </span>
      </div>

      {/* quick actions + session controls */}
      <div className="flex items-center gap-2">
        {session && session.started_at != null && (
          <span
            data-testid="session-timer"
            title="Session elapsed"
            className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-mono text-[13.5px] font-bold tabular-nums text-green-deep"
          >
            <span
              className={cn("size-2 shrink-0 rounded-full bg-primary", !paused && "animate-pulse")}
              aria-hidden="true"
            />
            {fmtDur(elapsed)}
          </span>
        )}
        {session && session.started_at == null && (
          <span className="text-[12.5px] uppercase tracking-wider text-muted-foreground">Not started</span>
        )}
        <Button
          size="sm"
          variant="secondary"
          data-testid="btn-smart-match"
          title="Line up the next matches in On Deck"
          disabled={!session || session.started_at == null}
          className="rounded-full"
          onClick={() => onSmartMatch?.()}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="inline-start" className="size-3">
            <path
              d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7L12 3z"
              fill="currentColor"
            />
            <path
              d="M18.5 15l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z"
              fill="currentColor"
              opacity=".7"
            />
          </svg>
          Smart Match
        </Button>
        <Button
          size="sm"
          variant="ghost"
          data-testid="btn-dark-toggle"
          aria-label="Toggle dark mode"
          title="Toggle dark mode"
          className="rounded-full px-2"
          onClick={() => toggleTheme()}
        >
          ☾
        </Button>
        <Button asChild size="sm" variant="ghost" className="rounded-full">
          <a data-testid="nav-history" href="#/history">
            History
          </a>
        </Button>
        {session && session.started_at != null && !session.ended_at && (
          <Button
            size="sm"
            variant="ghost"
            data-testid="btn-cheatsheet"
            title="Keyboard shortcuts (?)"
            onClick={() => onCheatsheet?.()}
          >
            ?
          </Button>
        )}
        {session && session.started_at != null && !session.ended_at && (
          <Button
            size="sm"
            variant="ghost"
            data-testid="btn-pause"
            title="Freeze all countdowns for a break"
            onClick={togglePause}
          >
            {paused ? "Resume" : "Pause"}
          </Button>
        )}
        {session && onEndSession && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full text-destructive hover:bg-wash-red hover:text-destructive"
              onClick={() => setConfirmEnd(true)}
            >
              End Session
            </Button>
            <EndSessionConfirmDialog
              open={confirmEnd}
              onOpenChange={setConfirmEnd}
              onConfirm={() => {
                setConfirmEnd(false);
                onEndSession?.();
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { pauseSession, resumeSession } from "@/api";
import { Button } from "@/components/ui/button";
import { toggleSkillPrivacy, toggleTheme } from "@/lib/theme";
import { cn, fmtClock, fmtDur, netWait } from "@/lib/utils";
import EndSessionConfirmDialog from "./EndSessionConfirmDialog.jsx";
import { useToast } from "./Toast.jsx";

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
      <span className="text-[13.5px] font-bold tracking-wide text-foreground">{namePart.toUpperCase()}</span>
      {datePart != null && <span className="text-[12.5px] text-muted-foreground"> · {datePart}</span>}
    </span>
  );
}

export default function Header({
  session,
  sseData,
  draftedIds = new Set(),
  onSmartMatch,
  onEndSession,
  onCheatsheet,
}) {
  const [elapsed, setElapsed] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [skillHidden, setSkillHidden] = useState(() =>
    document.documentElement.classList.contains("hide-skill"),
  );
  const toast = useToast();
  const paused = session?.paused_at != null;

  useEffect(() => {
    if (!session || session.started_at == null) return;
    // paused: the pill pins to the pause moment (server also freezes serverTime there)
    const base = (session.paused_at ?? Math.floor(Date.now() / 1000)) - session.started_at;
    setElapsed(base);
    if (paused) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [session?.id, session?.started_at, session, paused]);

  const togglePause = () =>
    (paused ? resumeSession(session.id) : pauseSession(session.id)).catch(() =>
      toast(`Could not ${paused ? "resume" : "pause"} — check connection`, "error"),
    );

  const fmtTime = (ts) =>
    ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

  // ---- live indicators, all derived client-side from the SSE payload ----
  const queue = sseData?.queue ?? [];
  const courts = sseData?.courts ?? [];
  // the courts' real hours win over the setup guess once the session is live
  // (Edit courts can move them); fall back to the scheduled window
  const opens = courts.filter((c) => c.enabled).map((c) => c.active_from ?? session?.started_at);
  const closes = courts.filter((c) => c.enabled && c.expires_at != null).map((c) => c.expires_at);
  const timeRange = [
    session?.started_at != null && opens.length ? Math.min(...opens) : session?.scheduled_start,
    closes.length ? Math.max(...closes) : session?.scheduled_end,
  ];
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

  return (
    <div className="sticky top-0 z-20 flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-card/70 px-5 py-2 backdrop-blur-xl backdrop-saturate-150">
      {/* brand — green app dot + wordmark; session name + date inline as a single line */}
      <div data-testid="brand" className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="size-2.5 shrink-0 self-center rounded-[5px] bg-primary" aria-hidden="true" />
        <span className="text-[15px] font-bold tracking-tight text-foreground">QueueC</span>
        {session ? (
          <>
            <SessionNameBlock name={session.name} />
            <span
              data-testid="header-time-range"
              className="hidden text-[12.5px] uppercase tracking-wider text-muted-foreground 2xl:inline"
            >
              {fmtTime(timeRange[0])}–{fmtTime(timeRange[1])}
            </span>
          </>
        ) : (
          <span className="text-[12.5px] uppercase tracking-wider text-muted-foreground">
            No active session
          </span>
        )}
      </div>

      {/* live status chips — draft `.chips`, space-evenly; only from xl, where
          they fit beside the actions (below that the actions would overflow) */}
      <div
        aria-label="Session status"
        className="hidden min-w-0 flex-1 items-center justify-evenly gap-4 px-2 xl:flex"
      >
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
        {/* min-w-0 chain: a long name shrinks (truncates) instead of wrapping the header */}
        <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12.5px] text-muted-foreground">
          <ChipDot tone="bg-destructive" />
          Longest{" "}
          <b
            data-testid="hdr-longest"
            className={cn(
              "flex min-w-0 gap-1 font-bold text-foreground",
              !longest.name && "text-muted-foreground",
            )}
          >
            {longest.name ? (
              <>
                {/* a long full name must not wrap the header (sidebar offset assumes one row) */}
                <span className="min-w-0 max-w-[10rem] truncate" title={longest.name}>
                  {longest.name}
                </span>{" "}
                <span className="shrink-0 font-mono font-semibold text-destructive">
                  ({fmtDur(longest.secs)})
                </span>
              </>
            ) : (
              "—"
            )}
          </b>
        </span>
        {/* duplicate of the sidebar's Avg Wait tile — first to go when space is short */}
        <span className="hidden items-center gap-1.5 whitespace-nowrap text-[12.5px] text-muted-foreground 2xl:inline-flex">
          <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden="true" />
          Avg wait{" "}
          <b data-testid="hdr-avg" className="font-mono font-bold tabular-nums text-foreground">
            {fmtClock(stats?.avg_wait_seconds)}
          </b>
        </span>
      </div>

      {/* quick actions + session controls */}
      <div className="ml-auto flex flex-wrap items-center gap-2">
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
          title="Fill the free courts' lineups for review and line up the next matches on On Deck"
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
          data-testid="btn-hide-skill"
          aria-pressed={skillHidden}
          title={
            skillHidden ? "Show skill levels" : "Hide skill levels (for when players can see the screen)"
          }
          aria-label={skillHidden ? "Show skill" : "Hide skill"}
          className="rounded-full px-2"
          onClick={() => setSkillHidden(toggleSkillPrivacy())}
        >
          {/* icon-only like ☾: a text label wrapped the header to two rows at
              1280–1300px, and the sidebar's sticky offset assumes one row */}
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {skillHidden && <path d="M3 3l18 18" />}
          </svg>
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
        {session && session.started_at != null && (
          <Button asChild size="sm" variant="ghost" className="rounded-full">
            <a
              data-testid="nav-payments"
              href={`#/history/${session.id}`}
              title="Session page: fees and who paid"
            >
              Payments
            </a>
          </Button>
        )}
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
              onCourt={sseData?.activeMatches?.length ?? 0}
              onDeck={sseData?.slatedMatches?.length ?? 0}
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

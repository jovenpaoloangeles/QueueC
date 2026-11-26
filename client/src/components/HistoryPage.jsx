import { useEffect, useState } from "react";
import { clearHistory, deleteSession, getSessions } from "@/api";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import HistoryShell from "./HistoryShell.jsx";

// v1.3 history browser: every ended session, newest first, one row per session
// with the card aggregates from GET /sessions (players/matches/shuttles).
// Each row can be deleted, or the whole history cleared — both are permanent,
// so both confirm first (a deleted game can't come back the way an Undo can).
const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString([], { month: "short", day: "numeric" });

export default function HistoryPage() {
  const [sessions, setSessions] = useState(null);
  const [tick, setTick] = useState(0);
  // {id, name} for one session, or "all" for the whole history
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is a refetch trigger, not a value the effect reads
  useEffect(() => {
    let live = true;
    getSessions()
      .then((d) => live && setSessions(d.sessions))
      .catch(() => live && setSessions([]));
    return () => {
      live = false;
    };
  }, [tick]);

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    try {
      if (target === "all") {
        const { deleted } = await clearHistory();
        toast(`History cleared — ${deleted} session${deleted === 1 ? "" : "s"} deleted`, "success");
      } else {
        await deleteSession(target.id);
        toast(`Deleted ${target.name}`, "success");
      }
      setTarget(null);
      setTick((n) => n + 1);
    } catch (err) {
      toast(err?.data?.error ?? "Could not delete", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <HistoryShell title="History" back="#/">
      <div data-testid="history-list" className="flex flex-col gap-2">
        {sessions === null && <div className="text-sm text-muted-foreground">Loading…</div>}
        {sessions?.length === 0 && (
          <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-card">
            No past sessions yet.
          </div>
        )}
        {sessions?.length > 0 && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-muted-foreground hover:text-destructive"
              data-testid="history-clear-all"
              onClick={() => setTarget("all")}
            >
              Clear all history
            </Button>
          </div>
        )}
        {sessions?.length > 0 &&
          sessions.map((s) => (
            <div
              key={s.id}
              data-testid="history-row"
              className="flex items-center gap-2 rounded-lg border border-border bg-card pr-2 shadow-card transition-colors hover:border-primary/40"
            >
              <a
                href={`#/history/${s.id}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-foreground">{s.name}</div>
                  <div className="text-[12.5px] text-muted-foreground">
                    {fmtDate(s.ended_at)} · {s.players} players · {s.matches} matches · {s.shuttles_total}{" "}
                    shuttles
                  </div>
                </div>
                <span className="shrink-0 text-[12.5px] text-muted-foreground" aria-hidden="true">
                  →
                </span>
              </a>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                data-testid="history-delete"
                aria-label={`Delete ${s.name}`}
                onClick={() => setTarget({ id: s.id, name: s.name })}
              >
                Delete
              </Button>
            </div>
          ))}
      </div>

      {target && (
        <Dialog open onOpenChange={(open) => !open && !busy && setTarget(null)}>
          <DialogContent className="sm:max-w-sm shadow-lift" data-testid="history-delete-dialog">
            <DialogHeader>
              <DialogTitle>{target === "all" ? "Clear all history?" : `Delete ${target.name}?`}</DialogTitle>
              <DialogDescription>
                {target === "all"
                  ? "Every past session goes — its games, attendance and payments. Leaderboards, careers and learned skill ratings are rebuilt without them. Your players stay. This can't be undone."
                  : "Its games, attendance and payments go. Leaderboards, careers and learned skill ratings are rebuilt without them. This can't be undone — export it from the session page first if you want a copy."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" disabled={busy} onClick={() => setTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                data-testid="history-delete-confirm"
                disabled={busy}
                onClick={confirmDelete}
              >
                {target === "all" ? "Clear all" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </HistoryShell>
  );
}

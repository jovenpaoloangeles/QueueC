import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { drag, moveBefore } from "@/lib/dnd";
import { cn } from "@/lib/utils";
import { getPlayers, removeEntry, setEntryStatus } from "../api.js";
import PlayerCard from "./PlayerCard.jsx";
import PlayerSearchAdd from "./PlayerSearchAdd.jsx";
import { useToast } from "./Toast.jsx";

// mockup .queue-tabs: All = everything in the session (waiting + resting, then
// playing), Wait = waiting only, Rest = resting only
const TABS = [
  { id: "all", label: "All", testid: "queue-tab-all" },
  { id: "wait", label: "Wait", testid: "queue-tab-wait" },
  { id: "rest", label: "Rest", testid: "queue-tab-rest" },
];

export default function QueueGrid({
  session,
  queue,
  waitSeconds,
  playSeconds,
  selection,
  draftedIds = new Set(),
  onSelectionChange,
  onReorder,
  onPlayersChanged,
  checkinOpen,
  onCheckinOpenChange,
}) {
  const [allPlayers, setAllPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [playersError, setPlayersError] = useState(false);
  // check-in panel open state lives in App (keyboard `c` needs to reach it)
  const showCheckin = checkinOpen ?? false;
  const setShowCheckin = onCheckinOpenChange ?? (() => {});
  const [order, setOrder] = useState([]);
  const [tab, setTab] = useState("all");
  const [filter, setFilter] = useState("");
  const [pendingRemove, setPendingRemove] = useState(null); // confirm-dialog target
  const [removing, setRemoving] = useState(false);
  const toast = useToast();

  // check-in undo: if the entry is already gone (another client checked them
  // out), say so instead of toasting a false "Undone" — OnDeckStrip convention
  const undoRemove = (entryId) =>
    removeEntry(entryId).catch((err) => {
      if (err?.status === 404) {
        toast("Already removed — nothing to undo", "info");
        return false; // handled its own failure — don't clobber with "Undone"
      }
    });

  // order survives SSE pushes (every 1s) so an optimistic drag doesn't snap
  // back — but when the id SET changes (check-in insert, removal) the server's
  // order is the truth: alphabetical inserts land mid-list, not at the end
  useEffect(() => {
    setOrder((prev) => {
      const server = queue.map((e) => e.id);
      if (prev.length === 0) return server;
      const known = new Set(prev);
      const sameSet = server.length === prev.length && server.every((id) => known.has(id));
      return sameSet ? prev : server;
    });
  }, [queue]);

  function loadPlayers() {
    setPlayersLoading(true);
    setPlayersError(false);
    getPlayers()
      .then((d) => setAllPlayers(d.players))
      .catch(() => setPlayersError(true))
      .finally(() => setPlayersLoading(false));
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only — loadPlayers is redefined each render
  useEffect(() => {
    loadPlayers();
  }, []);

  function toggleSelect(entryId) {
    if (draftedIds.has(entryId)) return; // already drafted onto a court — selecting would double-book them
    if (selection.includes(entryId)) {
      onSelectionChange(selection.filter((id) => id !== entryId));
    } else if (selection.length < 4) {
      onSelectionChange([...selection, entryId]);
    }
  }

  // benching must also leave the selection, or handleStartMatch would put a
  // resting player on court
  function bench(id) {
    setEntryStatus(id, "resting")
      .then(() => onSelectionChange(selection.filter((s) => s !== id)))
      .catch((err) => toast(err?.data?.error ?? "Could not update", "error"));
  }

  // Rest/Wake toggle on a queue row: waiting → resting (also leaves the
  // selection), resting → waiting. 409s (playing/staged) surface as toasts.
  function toggleRest(entry) {
    const next = entry.status === "resting" ? "waiting" : "resting";
    setEntryStatus(entry.id, next)
      .then(() => {
        if (next === "resting") onSelectionChange(selection.filter((s) => s !== entry.id));
      })
      .catch((err) => toast(err?.data?.error ?? "Could not update", "error"));
  }

  // Remove (check-in undo): the card's Remove only arms the confirm dialog;
  // the server refuses playing entries (409) and its card never shows the button.
  function removePlayer(entry) {
    if (removing) return;
    setRemoving(true);
    removeEntry(entry.id)
      .then(() => onSelectionChange(selection.filter((s) => s !== entry.id)))
      .catch((err) => toast(err?.data?.error ?? "Could not remove player", "error"))
      .finally(() => {
        setRemoving(false);
        setPendingRemove(null);
      });
  }

  // drafted entries (court draft / on-deck builder) leave the list entirely —
  // they are not merely disabled
  const notDrafted = (e) => !draftedIds.has(e.id);
  const waiting = queue.filter((e) => e.status === "waiting" && notDrafted(e));
  const resting = queue.filter((e) => e.status === "resting" && notDrafted(e));
  const playing = queue.filter((e) => e.status === "playing" && notDrafted(e));
  // click-selected OR drag-drafted players both count as "picked" for the header line
  const pickedCount = new Set([...selection, ...draftedIds]).size;

  const list = useMemo(() => {
    const idx = new Map(order.map((id, i) => [id, i]));
    const byOrder = (a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9);
    const base = tab === "wait" ? waiting : tab === "rest" ? resting : [...waiting, ...resting, ...playing];
    const q = filter.trim().toLowerCase();
    if (tab === "all") {
      // groups stay intact (playing last); each group keeps its own order
      return [waiting, resting, playing].flatMap((g) =>
        g.filter((e) => !q || (e.name ?? "").toLowerCase().includes(q)).sort(byOrder),
      );
    }
    return base.filter((e) => !q || (e.name ?? "").toLowerCase().includes(q)).sort(byOrder);
  }, [waiting, resting, playing, order, tab, filter]);

  function handleDropOnPlayer(dragId, targetId) {
    if (drag.current?.status === "playing") return; // playing cards don't reorder the queue
    if (drag.current?.status === "resting") {
      setEntryStatus(dragId, "waiting")
        .then(() => onSelectionChange(selection.filter((s) => s !== dragId)))
        .catch((err) => toast(err?.data?.error ?? "Could not update", "error"));
      return;
    }
    const next = moveBefore(order, dragId, targetId);
    setOrder(next);
    // full session order, every entry id exactly once, built after the local reorder
    const waitingIds = new Set(waiting.map((e) => e.id));
    const waitingInOrder = next.filter((id) => waitingIds.has(id));
    const restingIds = resting.map((e) => e.id);
    const playingIds = queue.filter((e) => e.status === "playing").map((e) => e.id);
    onReorder([...waitingInOrder, ...restingIds, ...playingIds]);
  }

  // the front of the waiting order is the next lineup (draft is-next cards)
  const nextIds = useMemo(() => {
    const idx = new Map(order.map((id, i) => [id, i]));
    return new Set(
      [...waiting]
        .sort((a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9))
        .slice(0, 4)
        .map((e) => e.id),
    );
  }, [waiting, order]);

  const tabCount = (id) =>
    id === "wait"
      ? waiting.length
      : id === "rest"
        ? resting.length
        : waiting.length + resting.length + playing.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-[15px] font-bold tracking-tight text-foreground">
          Queue · <span className="font-mono tabular-nums">{waiting.length}</span> Waiting
          {pickedCount > 0 && (
            <span className="ml-2 text-xs font-semibold text-primary">
              {pickedCount} selected → {pickedCount === 2 ? "Singles" : pickedCount === 4 ? "Doubles" : "..."}
            </span>
          )}
        </h2>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="ghost"
            size="sm"
            data-testid="checkin-toggle"
            className="rounded-full bg-secondary px-3.5 font-medium text-foreground hover:bg-secondary/70 dark:hover:bg-secondary/70"
            onClick={() => setShowCheckin((v) => !v)}
          >
            + Check In
          </Button>
        </div>
      </div>

      {/* draft .seg: quiet pill container, active segment lifts on bg-card */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input
          type="search"
          aria-label="Filter queue"
          placeholder="Filter queue…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8 w-44 rounded-full border-border bg-card text-xs"
        />
        <div className="flex items-center rounded-[9px] bg-secondary p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={t.testid}
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-[7px] px-3 py-1.5 text-xs transition-colors duration-150",
                tab === t.id
                  ? "bg-card font-semibold text-foreground shadow-sm"
                  : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}{" "}
              <span
                className={cn(
                  "font-mono tabular-nums",
                  tab === t.id ? "text-foreground/70" : "text-muted-foreground",
                )}
              >
                ({tabCount(t.id)})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* search-driven check-in: nothing listed until the user types — the old
          full pool dump is gone. Stays open for multi-add; PlayerSearchAdd
          clears the query after each check-in / register. Rendered as a quiet
          card so it never outshines the white queue cards. */}
      {showCheckin && (
        <div
          data-testid="checkin-panel"
          className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/50 p-3"
        >
          {playersLoading ? (
            <div className="flex gap-2">
              <Skeleton className="h-8 w-full" />
            </div>
          ) : playersError ? (
            // pool failed to load — register-new-player still works via
            // PlayerSearchAdd, but the failure must be visible with a way out
            <div className="flex flex-col gap-2" data-testid="checkin-error">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Couldn&apos;t load players.</span>
                <Button variant="outline" size="xs" className="rounded-full" onClick={loadPlayers}>
                  Retry
                </Button>
              </div>
              <PlayerSearchAdd
                session={session}
                queue={queue}
                players={[]}
                onPlayersChanged={onPlayersChanged}
                onCheckedIn={(p, entryId) =>
                  toast(`Checked in: ${p.name}`, "success", entryId != null ? { undo: () => undoRemove(entryId) } : undefined)
                }
                inputTestid="checkin-search"
                requireConfirm
                placeholder="Search or add player…"
                maxMatches={8}
              />
            </div>
          ) : (
            <PlayerSearchAdd
              session={session}
              queue={queue}
              players={allPlayers}
              onPlayersChanged={onPlayersChanged}
              multi
              onCheckedIn={(p, entryId) =>
                toast(`Checked in: ${p?.name}`, "success", entryId != null ? { undo: () => undoRemove(entryId) } : undefined)
              }
              inputTestid="checkin-search"
              requireConfirm
              placeholder="Search or add player…"
              hint="Type to search registered players"
              maxMatches={8}
            />
          )}
        </div>
      )}

      {/* auto-fill at ≥252px like the draft .queue-grid; 2 cols below md */}
      <div
        data-queue-list
        // dropping a resting chip on empty list space wakes it (rows handle their own drops)
        onDragOver={(e) => {
          if (drag.current?.status === "resting") e.preventDefault();
        }}
        onDrop={(e) => {
          if (e.defaultPrevented || drag.current?.status !== "resting") return;
          e.preventDefault();
          handleDropOnPlayer(drag.current.entryId, null);
        }}
        className="grid auto-rows-min grid-cols-2 gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(252px,1fr))]"
      >
        {list.map((entry) => (
          <PlayerCard
            key={entry.id}
            entry={entry}
            waitSecs={waitSeconds.get(entry.id) ?? 0}
            playSecs={playSeconds?.get(entry.id) ?? 0}
            isNext={nextIds.has(entry.id)}
            selectionIndex={selection.indexOf(entry.id)}
            onClick={(e) => {
              if (entry.status !== "waiting") return; // resting rows are not selectable
              if (e.shiftKey) {
                if (!draftedIds.has(entry.id)) bench(entry.id);
              } else {
                toggleSelect(entry.id);
              }
            }}
            onDropOn={handleDropOnPlayer}
            onToggleRest={toggleRest}
            onRemove={setPendingRemove}
          />
        ))}
      </div>

      {/* Remove-confirm gate: destructive, so the button only arms the dialog.
          Esc/backdrop = keep. One dialog grid-wide. */}
      <Dialog
        open={pendingRemove != null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
      >
        <DialogContent className="sm:max-w-xs" data-testid="remove-player-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span aria-hidden="true">✕</span>
              Remove {pendingRemove?.name}?
            </DialogTitle>
            <DialogDescription>They leave the queue and are checked out of this session.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="remove-player-abort"
              onClick={() => setPendingRemove(null)}
            >
              Keep
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              data-testid="remove-player-confirm"
              disabled={removing}
              onClick={() => removePlayer(pendingRemove)}
            >
              Remove player
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

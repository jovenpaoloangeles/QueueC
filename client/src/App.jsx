import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import {
  abortMatch,
  autoMatch,
  cancelSlate,
  endSession,
  setQueueOrder,
  startMatch,
  startSlateOnCourt,
} from "./api.js";
import CourtsRow from "./components/CourtsRow.jsx";
import HistoryPage from "./components/HistoryPage.jsx";
import SessionDetailPage from "./components/SessionDetailPage.jsx";
import CareerPage from "./components/CareerPage.jsx";
import EndMatchModal from "./components/EndMatchModal.jsx";
import Header from "./components/Header.jsx";
import OnDeckStrip from "./components/OnDeckStrip.jsx";
import QueueGrid from "./components/QueueGrid.jsx";
import SetupScreen from "./components/SetupScreen.jsx";
import ShortcutCheatsheet from "./components/ShortcutCheatsheet.jsx";
import StartMatchConfirmDialog from "./components/StartMatchConfirmDialog.jsx";
import StatsSidebar from "./components/StatsSidebar.jsx";
import { useSSE } from "./hooks/useSSE.js";
import useHashRoute from "./hooks/useHashRoute.js";
import { useTimers } from "./hooks/useTimers.js";
import { EMPTY_DRAFT } from "./lib/dnd.js";
import { fmtDur, freeCourts, idleNudgeSec, nudgeKind } from "./lib/utils.js";

function LiveView() {
  const [sseData, setSseData] = useState({
    session: null,
    queue: [],
    activeMatches: [],
    slatedMatches: [],
    courts: [],
    stats: null,
    serverTime: null,
  });
  const [selection, setSelection] = useState([]);
  // per-court lineup drafts: { [courtId]: [team1_p1, team1_p2, team2_p1, team2_p2] }
  // drag-flow only — the click-to-select `selection` above stays untouched for that flow
  const [drafts, setDrafts] = useState({});
  // live entry ids in the OnDeckStrip slate editor's draft — folded into
  // draftedIds so a court draft can't hold the same entry mid-edit
  const [slateDraftIds, setSlateDraftIds] = useState([]);
  // live entry ids in the On Deck "Add to On Deck" builder (manual assign)
  const [builderDraftIds, setBuilderDraftIds] = useState([]);
  // bumped after a live register-new-player so QueueGrid refetches the pool
  const [playersVersion, setPlayersVersion] = useState(0);
  // session id already restored from sessionStorage (one restore per session)
  const restoredRef = useRef(null);
  // On Deck collapsible — plain local state, nothing persisted
  const [deckOpen, setDeckOpen] = useState(false);

  const { session, queue, activeMatches, slatedMatches = [], courts, stats } = sseData;
  const toast = useToast();
  // Pending start awaiting confirmation:
  //  { kind:'manual', courtId, sel, source, matches } | { kind:'smart', plan, matches, slate }
  const [pending, setPending] = useState(null);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  // keyboard `e` target: {match, courtLabel} for the App-level EndMatchModal
  const [endTarget, setEndTarget] = useState(null);
  const [pendingBusy, setPendingBusy] = useState(false);

  const resolveTeam = (ids) =>
    ids.map((id) => {
      const e = queue.find((q) => q.id === id);
      return { name: e?.name ?? "?", skill_level: e?.skill_level };
    });

  // header "✨ Smart Match": slate-only, never auto-start. Ask the server for a
  // dry-run plan, preview it in the confirm dialog, then commit it to On Deck —
  // the QM reviews/edits there and sends lineups to a court manually.
  async function handleSmartMatch() {
    if (!session) return;
    try {
      const { plan } = await autoMatch(session.id, { dry_run: true, slate_only: true });
      if (!plan || (!plan.matches.length && !plan.slate.length)) {
        toast("Nothing to auto-match", "info");
        return;
      }
      setPending({
        kind: "smart",
        plan,
        matches: plan.matches.map((m) => ({
          courtLabel:
            m.court_label ?? courts.find((c) => c.id === m.court_id)?.label ?? `Court ${m.court_id}`,
          format: m.format,
          team1: resolveTeam(m.team1),
          team2: resolveTeam(m.team2),
        })),
        slate: plan.slate.map((m) => ({
          format: m.format,
          team1: resolveTeam(m.team1),
          team2: resolveTeam(m.team2),
        })),
      });
    } catch (err) {
      toast(err?.data?.error ?? (err?.status ? err.message : "Auto-match failed"), "error");
    }
  }

  // On Deck "✨ Smart add" / builder "✨ Smart Match": slate-only dry run whose
  // first slate is poured into the On Deck builder for review — the builder IS
  // the review surface, so no confirm dialog and nothing is slated here.
  // Returns the 4 entry ids to fill (or null after toasting why not).
  async function handleSmartFill(locked = []) {
    if (!session) return null;
    try {
      const { plan } = await autoMatch(session.id, {
        dry_run: true,
        slate_only: true,
        ...(locked.length ? { locked } : {}),
      });
      const ids = plan?.slate?.[0]
        ? [plan.slate[0].team1[0], plan.slate[0].team1[1], plan.slate[0].team2[0], plan.slate[0].team2[1]]
        : null;
      if (!ids || ids.some((id) => id == null)) {
        toast(
          locked.length
            ? "Nothing to add — no fair quartet around your picks"
            : "Nothing to add — need 4 waiting players",
          "info",
        );
        return null;
      }
      return ids;
    } catch (err) {
      toast(err?.data?.error ?? (err?.status ? err.message : "Smart add failed"), "error");
      return null;
    }
  }

  // Smart Match commit: always the slate-only path — every lineup lands in
  // On Deck for review; nothing starts on a court until the QM sends it.
  async function confirmSmartMatch(plan) {
    setPendingBusy(true);
    try {
      const r = await autoMatch(session.id, { plan, slate_only: true });
      toast(
        r.slated_count > 1
          ? `Added ${r.slated_count} lineups to On Deck for review`
          : "Added to On Deck for review",
        "success",
        r.slate_ids?.length
          ? {
              undo: () =>
                Promise.allSettled(r.slate_ids.map((id) => cancelSlate(id))).catch(() => {}),
            }
          : undefined,
      );
    } catch (err) {
      toast(err?.data?.error ?? (err?.status ? err.message : "Auto-match failed"), "error");
    } finally {
      setPendingBusy(false);
      setPending(null);
    }
  }

  async function confirmPending() {
    if (!pending || pendingBusy) return;
    if (pending.kind === "smart") return confirmSmartMatch(pending.plan);
    if (pending.kind === "promote") {
      setPendingBusy(true);
      try {
        await startSlateOnCourt(pending.slateId, pending.courtId);
      } catch (err) {
        toast(err?.data?.error ?? "Could not start lineup", "error");
      } finally {
        setPendingBusy(false);
        setPending(null);
      }
      return;
    }
    const { courtId, sel, source } = pending;
    setPendingBusy(true);
    try {
      await handleStartMatch(courtId, sel, source);
    } finally {
      setPendingBusy(false);
      setPending(null);
    }
  }

  async function handleEndSession() {
    if (!session) return;
    try {
      await endSession(session.id);
      setDrafts({});
      setSelection([]);
      setSlateDraftIds([]);
      setBuilderDraftIds([]);
    } catch (err) {
      toast(err?.data?.error ?? "Could not end session", "error");
    }
  }

  const clearDraft = useCallback(
    (courtId) =>
      setDrafts((prev) => {
        if (!prev[courtId]?.some(Boolean)) return prev;
        return { ...prev, [courtId]: EMPTY_DRAFT };
      }),
    [],
  );

  const clearSlot = useCallback(
    (courtId, slotIdx) =>
      setDrafts((prev) => {
        const cur = prev[courtId];
        if (!cur || cur[slotIdx] == null) return prev;
        return { ...prev, [courtId]: cur.map((v, i) => (i === slotIdx ? null : v)) };
      }),
    [],
  );

  // A new session invalidates every draft entry id (ids come from the old session's queue)
  useEffect(() => {
    setDrafts((prev) => (Object.keys(prev).length ? {} : prev));
    setSelection([]);
    setSlateDraftIds([]);
    setBuilderDraftIds([]);
  }, []);

  // Stale-draft pruning: a draft slot can outlive its entry (started elsewhere,
  // check-in undone, slated into a match). Keep waiting/resting entries — the
  // QM may still be assembling that lineup. Runs every SSE tick; identity-stable
  // when nothing needs pruning so it never causes a render loop.
  useEffect(() => {
    const status = new Map(queue.map((e) => [e.id, e.status]));
    setDrafts((prev) => {
      let changed = false;
      const next = {};
      for (const [courtId, slots] of Object.entries(prev)) {
        const pruned = slots.map((id) => {
          const st = id != null ? status.get(id) : "waiting";
          if (st !== "waiting" && st !== "resting") {
            changed = true;
            return null;
          }
          return id;
        });
        next[courtId] = pruned;
      }
      return changed ? next : prev;
    });
  }, [queue]);

  // Late-game restore: drafts+selection survive a refresh, per session id.
  // Load once per session id; write on every change; gone when the session ends.
  useEffect(() => {
    if (!session || restoredRef.current === session.id) return;
    restoredRef.current = session.id;
    try {
      const saved = JSON.parse(sessionStorage.getItem(`queuec.drafts.${session.id}`) ?? "null");
      if (saved) {
        setDrafts(saved.drafts ?? {});
        setSelection(saved.selection ?? []);
      }
    } catch {} // corrupted blob = no restore
  }, [session?.id]);
  useEffect(() => {
    if (!session || session.ended_at != null) return;
    sessionStorage.setItem(`queuec.drafts.${session.id}`, JSON.stringify({ drafts, selection }));
  }, [session?.id, session?.ended_at, drafts, selection]);
  // session ended or gone (SSE sends null after an end) → nothing left to
  // restore; hadSessionRef keeps the pre-SSE "no session yet" frame from wiping
  const hadSessionRef = useRef(false);
  useEffect(() => {
    if (!session) {
      if (hadSessionRef.current) {
        for (const k of Object.keys(sessionStorage)) {
          if (k.startsWith("queuec.drafts.")) sessionStorage.removeItem(k);
        }
      }
      return;
    }
    hadSessionRef.current = true;
    if (session.ended_at != null) {
      for (const k of Object.keys(sessionStorage)) {
        if (k.startsWith("queuec.drafts.")) sessionStorage.removeItem(k);
      }
    }
  }, [session?.id, session?.ended_at]);

  // Every entry id currently sitting in any court's draft OR in the OnDeck
  // strip's slate edit draft — excluded from the header waiting count so
  // drafted players don't look available.
  const draftedIds = useMemo(
    () => new Set([...Object.values(drafts).flat().filter(Boolean), ...slateDraftIds, ...builderDraftIds]),
    [drafts, slateDraftIds, builderDraftIds],
  );

  // Manual start gate: validate, then open the confirm dialog. Nothing starts
  // (and the draft/selection stays intact) until the user confirms.
  function requestStartMatch(courtNumber, sel, source = "selection") {
    if (!session) return false;
    const status = new Map(queue.map((e) => [e.id, e.status]));
    const validIds = sel.filter((id) => status.get(id) === "waiting");
    if (validIds.length !== 2 && validIds.length !== 4) {
      toast("Not enough available players", "error");
      return false;
    }
    const team1 = validIds.length === 2 ? [validIds[0]] : validIds.slice(0, 2);
    const team2 = validIds.length === 2 ? [validIds[1]] : validIds.slice(2);
    const court = courts.find((c) => c.id === courtNumber);
    setPending({
      kind: "manual",
      courtId: courtNumber,
      sel,
      source,
      matches: [
        {
          courtLabel: court?.label ?? `Court ${courtNumber}`,
          format: validIds.length === 2 ? "singles" : "doubles",
          team1: resolveTeam(team1),
          team2: resolveTeam(team2),
        },
      ],
      slate: [],
    });
    return true;
  }

  // sel: 2 ids → singles (each on its own team), 4 ids → doubles in slot order.
  // source: 'draft' | 'selection' — only the lineup actually used is cleared on
  // success, so a draft-based start never wipes an unrelated selection (and vice
  // versa). A failed start keeps the selection/draft so the QM can fix and retry.
  async function handleStartMatch(courtNumber, sel, source = "selection") {
    if (!session) return false;
    // Stale guard: a draft slot or selection can reference a player who already
    // started elsewhere since the last SSE tick — never double-book them.
    const status = new Map(queue.map((e) => [e.id, e.status]));
    const validIds = sel.filter((id) => status.get(id) === "waiting");
    // anything but a full 2 or 4 lineup can't start (3 is a partial doubles)
    if (validIds.length !== 2 && validIds.length !== 4) {
      toast("Not enough available players", "error");
      return false;
    }
    const mapped = validIds.length === 2 ? [validIds[0], null, validIds[1], null] : validIds;
    const [t1p1, t1p2, t2p1, t2p2] = mapped;
    try {
      const { match } = await startMatch({
        session_id: session.id,
        court_number: courtNumber,
        team1_p1: t1p1,
        team1_p2: t1p2 ?? null,
        team2_p1: t2p1,
        team2_p2: t2p2 ?? null,
      });
      if (source === "draft") clearDraft(courtNumber);
      else setSelection([]);
      const label = sseData.courts.find((c) => c.id === courtNumber)?.label ?? `Court ${courtNumber}`;
      toast(
        `Started on ${label}`,
        "success",
        match
          ? {
              undo: () =>
                abortMatch(match.id).catch((err) => {
                  if (err?.status === 404) {
                    toast("Already ended — nothing to undo", "info");
                    return false; // handled its own failure — don't clobber with "Undone"
                  }
                }),
            }
          : undefined,
      );
      return true;
    } catch (err) {
      toast(err?.data?.error ?? "Could not start match", "error");
      return false;
    }
  }

  // Slot drop → per-court draft on an idle court (live courts render no lineup
  // matrix). The 4th name opens the start confirmation; pre-building a lineup
  // for the next free court lives in the On Deck builder.
  function handleDropOnSlot(courtId, slotIdx, entryId) {
    const draft = drafts[courtId] ?? EMPTY_DRAFT;
    if (draft[slotIdx] != null) return; // slot busy — clear it with ✕ first
    if (draft.includes(entryId)) return; // already drafted on this court
    if (draftedIds.has(entryId)) return; // drafted on another court
    const next = draft.map((v, i) => (i === slotIdx ? entryId : v));
    setDrafts((prev) => ({ ...prev, [courtId]: next }));
    if (next.filter(Boolean).length === 4) {
      requestStartMatch(courtId, next, "draft"); // confirm dialog; draft cleared on confirmed success
    }
  }

  // Legacy court-level drop target ([data-drop^="court-"]) → first empty slot.
  // A full court changes nothing (doubles at 4, singles via the Start Singles button).
  function handleDropOnCourt(courtId, entryId) {
    const draft = drafts[courtId] ?? EMPTY_DRAFT;
    const idx = draft.findIndex((v) => v == null);
    if (idx === -1) return;
    handleDropOnSlot(courtId, idx, entryId);
  }

  const handleReorder = useCallback(
    (newOrder) => {
      setQueueOrder(session.id, newOrder).catch((err) =>
        toast(err?.data?.error ?? "Could not reorder queue", "error"),
      ); // SSE keeps the truth
    },
    [session?.id, toast],
  );

  const [connected, setConnected] = useState(true);
  useSSE(
    useCallback((data) => setSseData(data), []),
    setConnected,
  );

  useEffect(() => {
    document.title = session?.name ? `${session.name} · QueueC` : "QueueC";
  }, [session?.name]);

  const { waitSeconds, playSeconds } = useTimers(
    sseData.serverTime,
    sseData.queue,
    sseData.activeMatches,
    sseData.session?.paused_at,
  );

  // Idle-court nudge: how long the nudge condition has held without a break.
  // useTimers re-renders App every second, so no extra ticker; hidden while
  // paused (ruled cosmetic — a paused session is already "nudged" everywhere).
  const freeSinceRef = useRef(null);
  const nowRender = Math.floor(Date.now() / 1000);
  const nudge =
    session?.paused_at == null
      ? nudgeKind(
          sseData.courts,
          sseData.activeMatches,
          (sseData.slatedMatches ?? []).length,
          sseData.queue?.filter((e) => e.status === "waiting").length ?? 0,
          nowRender,
        )
      : null;
  if (nudge) {
    if (freeSinceRef.current == null) freeSinceRef.current = nowRender;
  } else {
    freeSinceRef.current = null;
  }
  const nudgeIdleSecs = freeSinceRef.current == null ? 0 : nowRender - freeSinceRef.current;
  const showNudge = nudge != null && nudgeIdleSecs >= idleNudgeSec();

  // ---- keyboard shortcuts (queue-master keys; ignored while typing) ----
  function promoteNextSlate() {
    const slate = slatedMatches[0];
    const free = freeCourts(courts, activeMatches, Math.floor(Date.now() / 1000));
    if (!slate || !free.length) {
      toast("Nothing to promote", "info");
      return;
    }
    setPending({
      kind: "promote",
      slateId: slate.id,
      courtId: free[0].id,
      matches: [
        {
          courtLabel: free[0].label ?? `Court ${free[0].id}`,
          format: slate.format,
          team1: [
            { name: slate.team1_p1_name, skill_level: slate.team1_p1_skill },
            ...(slate.team1_p2_name ? [{ name: slate.team1_p2_name, skill_level: slate.team1_p2_skill }] : []),
          ],
          team2: [
            { name: slate.team2_p1_name, skill_level: slate.team2_p1_skill },
            ...(slate.team2_p2_name ? [{ name: slate.team2_p2_name, skill_level: slate.team2_p2_skill }] : []),
          ],
        },
      ],
      slate: [],
    });
  }

  function endLongestMatch() {
    const live = [...activeMatches].sort((a, b) => (a.started_at ?? 0) - (b.started_at ?? 0))[0];
    if (!live) {
      toast("No active match to end", "info");
      return;
    }
    setEndTarget({
      match: live,
      courtLabel: courts.find((c) => c.id === live.court_number)?.label ?? `Court ${live.court_number}`,
    });
  }

  // handler identity refreshed each render; listener registered once
  const keyHandlerRef = useRef(() => {});
  keyHandlerRef.current = (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (pending || cheatsheetOpen || endTarget) return; // a dialog owns the keyboard
    if (e.key === "c") {
      e.preventDefault();
      setCheckinOpen(true);
    } else if (e.key === "s") {
      e.preventDefault();
      promoteNextSlate();
    } else if (e.key === "e") {
      e.preventDefault();
      endLongestMatch();
    } else if (e.key === "?") {
      e.preventDefault();
      setCheatsheetOpen((v) => !v);
    }
  };
  useEffect(() => {
    const onKey = (e) => keyHandlerRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // `c` opens the panel and lands focus in the search input; the panel shows a
  // skeleton until the player pool loads, so poll until the input mounts
  useEffect(() => {
    if (!checkinOpen) return;
    const id = setInterval(() => {
      const el = document.querySelector('[data-testid="checkin-search"]');
      if (el) {
        el.focus();
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, [checkinOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        session={session}
        sseData={sseData}
        draftedIds={draftedIds}
        onSmartMatch={handleSmartMatch}
        onEndSession={session ? handleEndSession : undefined}
        onCheatsheet={() => setCheatsheetOpen(true)}
      />
      {showNudge && (
        <div
          data-testid="idle-nudge"
          role="status"
          className="flex items-center justify-center gap-2 bg-wash-amber px-4 py-1.5 text-xs font-semibold text-amber animate-pulse"
        >
          {nudge.kind === "staged"
            ? `Court free for ${fmtDur(nudgeIdleSecs)} — a slate is waiting on deck`
            : `Court free for ${fmtDur(nudgeIdleSecs)} — 4+ players waiting, nothing slated`}
        </div>
      )}
      {!connected && (
        <div
          data-testid="sse-reconnecting"
          role="status"
          className="bg-muted px-4 py-1 text-center text-xs text-muted-foreground"
        >
          Reconnecting…
        </div>
      )}
      {(!session || session.started_at == null) && <SetupScreen draft={session} />}
      {session && session.started_at != null && (
        <div className="flex flex-1 items-start">
          {/* one scrolling column: Courts → On Deck → Queue at natural height */}
          <main className="flex min-w-0 flex-1 flex-col gap-4 p-4">
            <CourtsRow
              session={session}
              courts={courts}
              activeMatches={activeMatches}
              queue={queue}
              playSeconds={playSeconds}
              selection={selection}
              drafts={drafts}
              draftedIds={draftedIds}
              onStartMatch={requestStartMatch}
              onDropPlayer={handleDropOnCourt}
              onDropSlot={handleDropOnSlot}
              onClearSlot={clearSlot}
              onClearDraft={clearDraft}
              serverTime={sseData.serverTime ?? Math.floor(Date.now() / 1000)}
            />
            <OnDeckStrip
              key={session.id}
              slatedMatches={slatedMatches}
              queue={queue}
              draftedIds={draftedIds}
              onEditDraftChange={setSlateDraftIds}
              onBuilderDraftChange={setBuilderDraftIds}
              onSmartFill={handleSmartFill}
              sessionId={session.id}
              courts={courts}
              activeMatches={activeMatches}
              open={deckOpen}
              onToggleOpen={() => setDeckOpen((o) => !o)}
            />
            <QueueGrid
              session={session}
              queue={queue}
              waitSeconds={waitSeconds}
              playSeconds={playSeconds}
              selection={selection}
              draftedIds={draftedIds}
              onSelectionChange={setSelection}
              onReorder={handleReorder}
              playersVersion={playersVersion}
              onPlayersChanged={() => setPlayersVersion((v) => v + 1)}
              checkinOpen={checkinOpen}
              onCheckinOpenChange={setCheckinOpen}
            />
          </main>
          {/* fixed stats sidebar: own scroll, never scrolls with the page */}
          <aside className="sticky top-14 h-[calc(100vh-3.5rem)] w-72 shrink-0 overflow-y-auto border-l border-border bg-card">
            <StatsSidebar stats={stats} session={session} />
          </aside>
        </div>
      )}
      {endTarget && (
        <EndMatchModal
          match={endTarget.match}
          courtLabel={endTarget.courtLabel}
          onClose={() => setEndTarget(null)}
        />
      )}
      <ShortcutCheatsheet open={cheatsheetOpen} onOpenChange={setCheatsheetOpen} />
      {pending && (
        <StartMatchConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !pendingBusy) setPending(null);
          }}
          matches={pending.matches}
          slate={pending.slate}
          title={pending.kind === "smart" ? "Add these lineups to On Deck?" : undefined}
          confirmText={pending.kind === "smart" ? "Add to On Deck" : undefined}
          busy={pendingBusy}
          onConfirm={confirmPending}
        />
      )}
    </div>
  );
}

// v1.3 route switch: the live view keeps every hook subscription (SSE, timers,
// shortcuts) to itself; history views render without them. LiveView is the
// pre-v1.3 App body, unchanged.
export default function App() {
  const route = useHashRoute();
  if (route.name === "history") return <HistoryPage />;
  if (route.name === "session") return <SessionDetailPage id={route.id} />;
  if (route.name === "player") return <CareerPage id={route.id} />;
  return <LiveView />;
}

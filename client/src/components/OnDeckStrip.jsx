import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
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
import { drag, valid } from "@/lib/dnd";
import { nextFreeCourt } from "@/lib/eta";
import { balanceHint, cn, fmtClock, freeCourts, shortSkill, TIER_CLASS } from "@/lib/utils";
import { abortMatch, cancelSlate, moveSlate, slateMatch, startSlateOnCourt, updateSlate } from "../api.js";

/** Slot order mirrors the slate payload: Team A = 0,1 · Team B = 2,3. */
const SLOT_KEYS = ["team1_p1", "team1_p2", "team2_p1", "team2_p2"];
const SLOT_NAME_KEYS = ["team1_p1_name", "team1_p2_name", "team2_p1_name", "team2_p2_name"];

const NOOP = () => {};

// draft .btn-icon glyphs: 11px chevrons (stroke 2.4) for slate reorder
const Chevron = ({ dir }) => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={dir === "up" ? "M6 14l6-6 6 6" : "M6 10l6 6 6-6"} />
  </svg>
);

// draft 12px sparkle for the Smart add buttons
const Spark = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7L12 3z" />
  </svg>
);

// draft verdict pill (queuec-live-redesign-draft.html .verdict): wash fill +
// deep ink, keyed off balanceHint's label — the same three contract texts.
const VERDICT_PILL = {
  Even: "bg-wash-green text-green-deep",
  "Slight edge": "bg-wash-amber text-amber",
  Lopsided: "bg-wash-red text-destructive",
};
const verdictPill = (hint) => cn("rounded-full px-2.5 py-0.5 text-xs font-bold", VERDICT_PILL[hint?.label]);

/** One lineup slot — drop target for a waiting player, clearable once filled. */
function SlateSlot({
  idx,
  entryId,
  name,
  draftedIds,
  draft,
  onDropSlot,
  onClearSlot,
  slotPrefix = "slate-slot",
  clearPrefix = "slate-slot-clear",
}) {
  const [over, setOver] = useState(false);
  const payload = drag.current; // read live: drop can run before the dragover re-render flushes
  const filled = entryId != null;
  // status === 'waiting': the PATCH route rejects resting substitutions, so a
  // resting drag must read as invalid (red ring) instead of landing a 400.
  const droppable = (p) =>
    valid("slot", p) && p.status === "waiting" && !draftedIds.has(p.entryId) && !draft.includes(p.entryId);
  const canDrop = !filled && !!payload && droppable(payload);

  return (
    <div
      data-drop="slate-slot"
      data-slot-idx={idx}
      data-testid={`${slotPrefix}-${idx}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        // stopPropagation: the slot consumes the drop, never a parent zone
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const p = drag.current;
        if (filled || !p) return;
        if (droppable(p)) onDropSlot(idx, p.entryId);
      }}
      className={cn(
        "grid min-h-[38px] place-items-center rounded-md border-[1.5px] px-2.5 py-1.5 text-center text-[13px] transition-colors",
        filled
          ? "border-solid border-border bg-card font-semibold text-foreground shadow-sm dark:bg-secondary"
          : "border-dashed border-foreground/15 bg-transparent font-medium text-muted-foreground",
        over && canDrop && "border-primary bg-drop-target!",
        over && payload && !canDrop && "border-drop-invalid-border bg-drop-invalid!",
      )}
    >
      {filled ? (
        <span className="flex items-center gap-1.5">
          <span className="truncate">{name}</span>
          <button
            type="button"
            data-testid={`${clearPrefix}-${idx}`}
            aria-label={`Remove ${name} from slate`}
            onClick={() => onClearSlot(idx)}
            className="grid size-5 shrink-0 place-items-center rounded-md bg-secondary text-xs font-bold leading-none text-muted-foreground transition-colors hover:text-destructive"
          >
            ×
          </button>
        </span>
      ) : (
        "Drop…"
      )}
    </div>
  );
}

/** Compact 2×2 matrix (CourtCard .slots pattern): Team A = 0,1 · Team B = 2,3. */
function SlateMatrix({ draft, draftedIds, nameById, onDropSlot, onClearSlot, slotPrefix, clearPrefix }) {
  const column = (idxs) => (
    <div className="flex flex-col gap-2">
      {idxs.map((i) => (
        <SlateSlot
          key={i}
          idx={i}
          entryId={draft[i]}
          name={draft[i] != null ? (nameById.get(draft[i]) ?? "?") : null}
          draftedIds={draftedIds}
          draft={draft}
          onDropSlot={onDropSlot}
          onClearSlot={onClearSlot}
          slotPrefix={slotPrefix}
          clearPrefix={clearPrefix}
        />
      ))}
    </div>
  );

  return (
    <div className="grid grid-cols-2 gap-2">
      {column([0, 1])}
      {column([2, 3])}
    </div>
  );
}

function sideOf(row, side) {
  const p = side === 1 ? ["team1_p1", "team1_p2"] : ["team2_p1", "team2_p2"];
  return p
    .map((k) => (row[k] != null ? { name: row[`${k}_name`] ?? "?", skill_level: row[`${k}_skill`] } : null))
    .filter(Boolean);
}

function SidePlayers({ players }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {players.length ? (
        players.map((p, i) => (
          <span
            key={i}
            className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[13px] font-semibold dark:bg-secondary"
          >
            <span className="truncate">{p.name}</span>
            {p.skill_level && (
              <span className={cn("tier ml-auto shrink-0", TIER_CLASS[p.skill_level])}>
                {shortSkill(p.skill_level)}
              </span>
            )}
          </span>
        ))
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}

/** Approximate time until the soonest active match is likely to finish → { label, secs } | null. */

/** Free courts, same rule as the server (automatch.js): enabled, not expired,
 *  active window open, and no live match sitting on the court. */
export default function OnDeckStrip({
  slatedMatches,
  queue = [],
  draftedIds = new Set(),
  onEditDraftChange = NOOP,
  onBuilderDraftChange = NOOP,
  onSmartFill = NOOP,
  sessionId,
  courts = [],
  activeMatches = [],
  open = true,
  onToggleOpen = NOOP,
}) {
  const toast = useToast();
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState([null, null, null, null]);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pendingCancelId, setPendingCancelId] = useState(null); // confirm dialog target
  const [pendingStartId, setPendingStartId] = useState(null); // start-now dialog target
  const [starting, setStarting] = useState(false);
  const [building, setBuilding] = useState(false); // builder panel open
  const [newDraft, setNewDraft] = useState([null, null, null, null]);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const rows = Array.isArray(slatedMatches) ? slatedMatches : [];
  const queueRows = Array.isArray(queue) ? queue : [];

  // entryId → name for every player the strip can show: waiting/resting names
  // come from `queue` (substituted-in players aren't in slatedMatches rows),
  // the staged slate occupants from their own *_name fields. The two sources
  // can't overlap — slated/staged entries are excluded from queue, waiting
  // ones are excluded from slatedMatches — so merging is conflict-free.
  const nameById = useMemo(() => {
    const map = new Map();
    for (const e of queueRows) {
      if (e?.id != null && e.name) map.set(e.id, e.name);
    }
    for (const r of rows) {
      SLOT_KEYS.forEach((k, i) => {
        if (r[k] != null && r[SLOT_NAME_KEYS[i]]) map.set(r[k], r[SLOT_NAME_KEYS[i]]);
      });
    }
    return map;
  }, [rows, queueRows]);

  // entryId → skill_level from the same two sources, for the builder's live
  // balance verdict (same balanceHint thresholds as the slated cards).
  const skillById = useMemo(() => {
    const map = new Map();
    for (const e of queueRows) if (e?.id != null && e.skill_level) map.set(e.id, e.skill_level);
    for (const r of rows)
      SLOT_KEYS.forEach((k) => {
        if (r[k] != null && r[`${k}_skill`]) map.set(r[k], r[`${k}_skill`]);
      });
    return map;
  }, [rows, queueRows]);

  // Live verdict for the staged lineup — feedback the moment the 4 slots fill
  // (Smart add or manual), before anything is added to On Deck.
  const draftHint = useMemo(() => {
    if (newDraft.filter(Boolean).length !== 4) return null;
    const side = (ids) => ids.map((id) => ({ skill_level: skillById.get(id) }));
    return balanceHint({ team1: side(newDraft.slice(0, 2)), team2: side(newDraft.slice(2, 4)) });
  }, [newDraft, skillById]);

  // Ids that may legally sit in the edit draft — the PATCH route's rule in
  // client form: one of this slate's current four (rearrangement) or a queue
  // entry still waiting (substitution). Resting/playing/staged → unavailable.
  const availableFor = (row) => {
    const ok = new Set(SLOT_KEYS.map((k) => row[k]).filter((v) => v != null));
    for (const e of queueRows) if (e?.status === "waiting") ok.add(e.id);
    return ok;
  };

  // A slate can vanish under the editor (promoted to a court, cancelled elsewhere)
  useEffect(() => {
    if (editingId != null && !rows.some((r) => r.id === editingId)) {
      setEditingId(null);
      setEditDraft([null, null, null, null]);
    }
    // same for the cancel/start-confirm targets: close silently if the slate vanished
    if (pendingCancelId != null && !rows.some((r) => r.id === pendingCancelId)) {
      setPendingCancelId(null);
    }
    if (pendingStartId != null && !rows.some((r) => r.id === pendingStartId)) {
      setPendingStartId(null);
    }
  }, [rows, editingId, pendingCancelId, pendingStartId]);

  // Stale-draft pruning: a slot can outlive its entry's availability (started
  // elsewhere, rested, slated into another match). Null it out — the Save-time
  // check catches the same race at click time, pruning keeps the matrix honest
  // between SSE ticks. Identity-stable when nothing needs pruning.
  useEffect(() => {
    if (editingId == null) return;
    const row = rows.find((r) => r.id === editingId);
    if (!row) return; // the vanish effect above clears the editor
    const ok = availableFor(row);
    setEditDraft((prev) => {
      const next = prev.map((id) => (id != null && !ok.has(id) ? null : id));
      return next.every((v, i) => v === prev[i]) ? prev : next;
    });
    // biome-ignore lint/correctness/useExhaustiveDependencies: setEditDraft is a stable setState
  }, [rows, editingId, availableFor]);

  // Cross-zone exclusion: mirror the live edit draft into App so a court
  // draft can't hold the same entry. Fires on edit start and every draft
  // change; empty array on save success, cancel and exit.
  useEffect(() => {
    onEditDraftChange(editingId != null ? editDraft.filter(Boolean) : []);
  }, [editingId, editDraft, onEditDraftChange]);

  // Builder draft → App (drafted union), and stale pruning (entry no longer waiting)
  useEffect(() => {
    onBuilderDraftChange(newDraft.filter(Boolean));
  }, [newDraft, onBuilderDraftChange]);
  useEffect(() => {
    const waiting = new Set(queueRows.filter((e) => e?.status === "waiting").map((e) => e.id));
    setNewDraft((prev) => {
      const next = prev.map((id) => (id != null && !waiting.has(id) ? null : id));
      return next.every((v, i) => v === prev[i]) ? prev : next;
    });
  }, [queueRows]);
  useEffect(() => () => onBuilderDraftChange([]), [onBuilderDraftChange]);

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditDraft(SLOT_KEYS.map((k) => row[k] ?? null));
  };

  const exitEdit = () => {
    setEditingId(null);
    setEditDraft([null, null, null, null]);
  };

  const builderDrop = (idx, entryId) =>
    setNewDraft((prev) => {
      if (prev[idx] != null || prev.includes(entryId) || draftedIds.has(entryId)) return prev;
      return prev.map((v, i) => (i === idx ? entryId : v));
    });
  const builderClear = (idx) =>
    setNewDraft((prev) => (prev[idx] == null ? prev : prev.map((v, i) => (i === idx ? null : v))));

  // ✨ Smart Match: dry-run slate plan poured into the builder for review —
  // NO confirm dialog and NO slating here; the QM edits the slots and presses
  // "Add to on Deck". A player already claimed by another zone (court draft or
  // slate-editor draft) leaves that slot empty rather than double-claiming;
  // the builder's own previous contents are replaced wholesale.
  const [filling, setFilling] = useState(false);
  const filledCount = newDraft.filter(Boolean).length;
  async function runSmartFill() {
    if (filling) return;
    setFilling(true);
    try {
      // pre-placed picks are locked: the plan must build around them
      const ids = await onSmartFill(newDraft.filter(Boolean));
      if (ids) {
        setBuilding(true);
        const placed = new Set(newDraft.filter(Boolean));
        const other = new Set([...draftedIds].filter((id) => !newDraft.includes(id)));
        const poured = [...newDraft];
        let k = 0;
        for (let i = 0; i < poured.length; i++) {
          if (poured[i] != null) continue; // locked pick keeps its slot
          while (k < ids.length && (placed.has(ids[k]) || other.has(ids[k]))) k++;
          if (k < ids.length) poured[i] = ids[k++];
        }
        setNewDraft(poured);
      }
    } finally {
      setFilling(false);
    }
  }

  async function handleAdd() {
    if (adding) return;
    if (newDraft.filter(Boolean).length !== 4) {
      toast("A lineup needs exactly 4 players", "error");
      return;
    }
    setAdding(true);
    try {
      const { slate } = await slateMatch({
        session_id: sessionId,
        team1_p1: newDraft[0],
        team1_p2: newDraft[1],
        team2_p1: newDraft[2],
        team2_p2: newDraft[3],
      });
      toast("Added to On Deck", "success", slate ? { undo: () => cancelSlate(slate.id) } : undefined);
      setNewDraft([null, null, null, null]);
    } catch (err) {
      toast(err?.data?.error ?? "Could not add to On Deck", "error"); // keep the builder
    } finally {
      setAdding(false);
    }
  }

  async function handleMove(row, dir) {
    if (moving) return;
    setMoving(true);
    try {
      await moveSlate(row.id, dir);
    } catch (err) {
      toast(err?.data?.error ?? "Could not reorder", "error");
    } finally {
      setMoving(false);
    }
  }

  const dropSlot = (idx, entryId) =>
    setEditDraft((prev) => {
      if (prev[idx] != null || prev.includes(entryId) || draftedIds.has(entryId)) return prev;
      return prev.map((v, i) => (i === idx ? entryId : v));
    });

  const clearSlot = (idx) =>
    setEditDraft((prev) => (prev[idx] == null ? prev : prev.map((v, i) => (i === idx ? null : v))));

  async function handleSave(row) {
    if (saving) return; // in-flight guard: no double PATCH / double toast
    if (editDraft.filter(Boolean).length !== 4) {
      toast("A slate needs exactly 4 players", "error");
      return;
    }
    // Stale guard: a slot can reference a player who became unavailable since
    // the last SSE tick — fail locally before the PATCH 400s.
    const ok = availableFor(row);
    if (editDraft.some((id) => !ok.has(id))) {
      toast("A player in this lineup is no longer available", "error");
      return;
    }
    setSaving(true);
    try {
      await updateSlate(row.id, {
        team1_p1: editDraft[0],
        team1_p2: editDraft[1],
        team2_p1: editDraft[2],
        team2_p2: editDraft[3],
      });
      toast("Slated lineup updated", "success");
      exitEdit();
    } catch (err) {
      toast(err?.data?.error ?? "Could not update slate", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(row) {
    if (cancelling) return; // in-flight guard: no double DELETE / double 404 toast
    setCancelling(true);
    try {
      await cancelSlate(row.id);
      toast("Slated match cancelled — players returned to waiting", "info");
    } catch (err) {
      toast(err?.data?.error ?? "Could not cancel slate", "error");
    } finally {
      setCancelling(false);
    }
  }

  async function handleStartNow(row, court) {
    if (starting) return; // in-flight guard: no double POST / double toast
    setStarting(true);
    try {
      const { match } = await startSlateOnCourt(row.id, court.id);
      const t1 = [row.team1_p1_name, row.team1_p2_name].filter(Boolean).join(" & ");
      const t2 = [row.team2_p1_name, row.team2_p2_name].filter(Boolean).join(" & ");
      toast(`Lineup started on ${court.label} — ${t1} vs ${t2}`, "success", {
        undo: () => {
          abortMatch(match.id).catch((err) => {
            if (err?.status === 404 || err?.status === 409) {
              toast("Already ended — nothing to undo", "info");
              return false; // handled its own failure — don't clobber with "Undone"
            }
          });
        },
      });
      setPendingStartId(null);
    } catch (err) {
      toast(err?.data?.error ?? "Could not start the lineup", "error"); // keep the dialog open
    } finally {
      setStarting(false);
    }
  }

  const eta = rows.length ? nextFreeCourt(courts, activeMatches, now) : null;
  const free = useMemo(() => freeCourts(courts, activeMatches, now), [courts, activeMatches, now]);
  const filled = newDraft.filter(Boolean).length;

  const builder = (
    <div
      data-testid="ondeck-builder"
      className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-card p-4 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14.5px] font-bold tracking-tight text-foreground">Next up — building</span>
        {draftHint && (
          <span data-testid="ondeck-draft-balance" className={verdictPill(draftHint)}>
            {draftHint.label}
          </span>
        )}
      </div>
      <SlateMatrix
        draft={newDraft}
        draftedIds={draftedIds}
        nameById={nameById}
        onDropSlot={builderDrop}
        onClearSlot={builderClear}
        slotPrefix="ondeck-new-slot"
        clearPrefix="ondeck-new-clear"
      />
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto min-w-0 text-xs text-muted-foreground">
          {filled === 4
            ? "Ready — check the sides, then add"
            : "Drag 4 waiting players, or Smart add fills from the queue"}
        </p>
        {filled > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full"
            onClick={() => setNewDraft([null, null, null, null])}
          >
            Clear
          </Button>
        )}
        <Button
          size="sm"
          className="rounded-full"
          data-testid="ondeck-add"
          disabled={filled !== 4 || adding}
          onClick={handleAdd}
        >
          Add to On Deck
        </Button>
      </div>
    </div>
  );

  const collapsedHeader = (
    <header className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
      <h2 className="text-base font-bold tracking-[-0.015em] text-foreground">
        On deck
        <span
          data-testid="on-deck-count"
          className="ml-2 inline-flex min-w-6 items-center justify-center rounded-md bg-secondary px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums text-muted-foreground"
        >
          {rows.length}
        </span>
      </h2>
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {rows.length ? `${rows.length} lined up · hidden` : "nothing lined up"}
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="rounded-full"
        data-testid="ondeck-smart-add"
        disabled={filling || filledCount === 4}
        onClick={runSmartFill}
      >
        <Spark /> Smart add
      </Button>
    </header>
  );

  const expandedHeader = (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 className="text-base font-bold tracking-[-0.015em] text-foreground">
        On deck
        <span
          data-testid="on-deck-count"
          className="ml-2 inline-flex min-w-6 items-center justify-center rounded-md bg-secondary px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums text-muted-foreground"
        >
          {rows.length}
        </span>
      </h2>
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {rows.length} lined up · QM announces top to bottom
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="rounded-full"
        data-testid="ondeck-smart-add"
        disabled={filling || filledCount === 4}
        onClick={runSmartFill}
      >
        <Spark /> Smart add
      </Button>
      <Button
        size="sm"
        variant={building ? "secondary" : "default"}
        className="rounded-full"
        data-testid="ondeck-builder-toggle"
        onClick={() => setBuilding((b) => !b)}
      >
        {building ? "Close builder" : "＋ Build lineup"}
      </Button>
    </header>
  );

  const collapseBtn = (
    /* collapse toggle: chevron + aria-expanded; open/closed is plain local state */
    <button
      type="button"
      data-testid="ondeck-collapse"
      aria-expanded={open}
      aria-label={open ? "Collapse On Deck" : "Expand On Deck"}
      onClick={onToggleOpen}
      className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <span
        aria-hidden="true"
        className="inline-block transition-transform duration-200"
        style={{ transform: open ? "rotate(90deg)" : "rotate(-90deg)" }}
      >
        ▸
      </span>
    </button>
  );

  return (
    <section
      data-testid="on-deck-strip"
      className={cn("flex shrink-0 flex-col", open ? "gap-3" : "gap-1 py-1")}
    >
      {/* collapsed: chevron inline with the header so the slim bar stays one row */}
      {open ? (
        <>
          {collapseBtn}
          {expandedHeader}
        </>
      ) : (
        <div className="flex items-center gap-2">
          {collapseBtn}
          {collapsedHeader}
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="ondeck-body"
            data-testid="ondeck-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex min-h-0 flex-col gap-3 overflow-hidden"
          >
            {building && builder}

            {!rows.length && (
              <div
                data-testid="on-deck-empty"
                className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-dashed border-border bg-card px-4 py-3"
              >
                <p className="text-sm font-bold tracking-tight">Nothing on deck</p>
                <p className="text-xs text-muted-foreground">
                  Line up the next match so it starts the moment a court frees up — Smart add or build a
                  lineup.
                </p>
              </div>
            )}

            <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-3">
              {rows.map((row, i) => {
                const editing = editingId === row.id;
                const pos = i + 1;
                const t1 = sideOf(row, 1);
                const t2 = sideOf(row, 2);
                const hint = balanceHint({ team1: t1, team2: t2 });
                return (
                  <div
                    key={row.id}
                    data-testid={`slate-row-${row.id}`}
                    className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-card p-4 shadow-card"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        data-testid={`on-deck-pos-${pos}`}
                        className="truncate text-[14.5px] font-bold tracking-tight text-foreground"
                      >
                        Slate {pos}
                        {pos === 1 ? " · up next" : ""}
                      </span>
                      {/* quiet neutral tag — present in display AND edit mode */}
                      <span
                        data-testid="on-deck-tag"
                        className="inline-flex shrink-0 items-center rounded bg-secondary px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        On deck
                      </span>
                      {row.slate_seq != null && (
                        <span className="shrink-0 font-mono text-2xs font-semibold tabular-nums text-muted-foreground">
                          slated #{row.slate_seq}
                        </span>
                      )}
                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          data-testid={`slate-up-${row.id}`}
                          aria-label="Move up"
                          disabled={i === 0 || moving}
                          onClick={() => handleMove(row, "up")}
                        >
                          <Chevron dir="up" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          data-testid={`slate-down-${row.id}`}
                          aria-label="Move down"
                          disabled={i === rows.length - 1 || moving}
                          onClick={() => handleMove(row, "down")}
                        >
                          <Chevron dir="down" />
                        </Button>
                      </div>
                    </div>

                    {editing ? (
                      <SlateMatrix
                        draft={editDraft}
                        draftedIds={draftedIds}
                        nameById={nameById}
                        onDropSlot={dropSlot}
                        onClearSlot={clearSlot}
                      />
                    ) : (
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <SidePlayers players={t1} />
                        <span className="text-[11px] font-bold tracking-[0.14em] text-muted-foreground/70">
                          VS
                        </span>
                        <SidePlayers players={t2} />
                      </div>
                    )}

                    {pos === 1 && eta && !editing && (
                      <p data-testid="on-deck-eta" className="text-xs text-muted-foreground">
                        next free court:{" "}
                        <span className="font-mono font-semibold tabular-nums text-foreground">
                          {eta.label} in ~{fmtClock(eta.secs)}
                        </span>
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {!editing && hint && (
                        <span data-testid="on-deck-balance" className={cn("mr-auto", verdictPill(hint))}>
                          {hint.label}
                        </span>
                      )}
                      {editing ? (
                        <>
                          <Button
                            size="sm"
                            className="rounded-full"
                            data-testid="slate-save"
                            disabled={saving}
                            onClick={() => handleSave(row)}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full"
                            data-testid="slate-cancel-edit"
                            onClick={exitEdit}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto rounded-full"
                            data-testid={`slate-edit-${row.id}`}
                            onClick={() => startEdit(row)}
                          >
                            ✎ Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            data-testid={`slate-start-${row.id}`}
                            disabled={free.length === 0}
                            title={
                              free.length === 0 ? "No free court" : "Start this lineup on a free court now"
                            }
                            onClick={() => setPendingStartId(row.id)}
                          >
                            ▶ Start now
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full text-muted-foreground hover:text-destructive"
                            data-testid={`slate-cancel-${row.id}`}
                            disabled={cancelling}
                            onClick={() => setPendingCancelId(row.id)}
                          >
                            ✕ Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cancel-confirm gate: destructive, so the ✕ only arms the dialog.
          Esc/backdrop (onOpenChange false) = abort. One dialog strip-wide. */}
      <Dialog
        open={pendingCancelId != null}
        onOpenChange={(open) => {
          if (!open) setPendingCancelId(null);
        }}
      >
        <DialogContent className="sm:max-w-xs" data-testid="ondeck-cancel-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span aria-hidden="true">✕</span>
              Cancel this lineup?
            </DialogTitle>
            <DialogDescription>Players return to the queue.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="ondeck-cancel-abort"
              onClick={() => setPendingCancelId(null)}
            >
              Keep
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              data-testid="ondeck-cancel-confirm"
              disabled={cancelling}
              onClick={async () => {
                const row = rows.find((r) => r.id === pendingCancelId);
                setPendingCancelId(null);
                if (row) await handleCancel(row);
              }}
            >
              Cancel lineup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start-now dialog: clicking a free court IS the confirm (it starts
          immediately). Esc/backdrop = abort. One dialog strip-wide. */}
      <Dialog
        open={pendingStartId != null}
        onOpenChange={(open) => {
          if (!open) setPendingStartId(null);
        }}
      >
        <DialogContent className="sm:max-w-xs" data-testid="ondeck-start-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span aria-hidden="true">▶</span>
              Start this lineup now?
            </DialogTitle>
            <DialogDescription>Pick a free court — players leave the queue.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            {free.length === 0 ? (
              <p className="text-sm text-muted-foreground">No free court right now.</p>
            ) : (
              free.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  disabled={starting}
                  data-testid={`slate-start-court-${c.id}`}
                  onClick={() => {
                    const row = rows.find((r) => r.id === pendingStartId);
                    if (row) handleStartNow(row, c);
                  }}
                >
                  {c.label}
                </Button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="slate-start-abort"
              onClick={() => setPendingStartId(null)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

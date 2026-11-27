import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EMPTY_DRAFT } from "@/lib/dnd";
import { cn, fmtWall } from "@/lib/utils";
import CourtCard from "./CourtCard.jsx";
import CourtsEditDialog from "./CourtsEditDialog.jsx";

function isLive(court, serverTime) {
  if (!court.enabled) return false;
  if (court.active_from != null && serverTime < court.active_from) return false;
  if (court.active_until != null && serverTime >= court.active_until) return false;
  // Independent countdown expiry: court removed from the active available pool
  // once remaining_ms <= 0, UNLESS a match is actively in progress (handled
  // gracefully in CourtCard via `isExpiring` — the card shows a Last Game badge
  // and remains visible until the active match ends).
  if (court.expires_at != null && serverTime >= court.expires_at) return false;
  return true;
}

export default function CourtsRow({
  session,
  courts,
  serverTime,
  activeMatches,
  queue,
  playSeconds,
  selection,
  drafts = {},
  draftedIds = new Set(),
  onStartMatch,
  onStartDraft,
  onDropPlayer,
  onDropSlot,
  onClearSlot,
  onClearDraft,
}) {
  const [editing, setEditing] = useState(false);
  // Expired courts stay on screen (pulsing red + "Extend +1 Hour"); an expired
  // court with a match in progress is the Last Game case — both need the card.
  // A staggered court waiting for its opens_at offset renders as "Opens in Xm".
  const liveCourts = courts.filter((c) => {
    if (!c.enabled) return false;
    if (isLive(c, serverTime)) return true;
    if (c.active_from != null && serverTime < c.active_from) return true;
    return c.expires_at != null && serverTime >= c.expires_at;
  });
  const canStartSelection = selection?.length === 2 || selection?.length === 4;

  // draft sec-h: "Courts" + a running count — 1 live · 1 open · 1 opens 8:00 PM
  const isRunning = (c) => activeMatches.some((m) => m.court_number === c.id);
  const liveN = liveCourts.filter(isRunning).length;
  const openN = liveCourts.filter((c) => isLive(c, serverTime) && !isRunning(c)).length;
  const late = liveCourts.filter((c) => c.active_from != null && serverTime < c.active_from);
  const expiredN = liveCourts.filter((c) => c.expires_at != null && serverTime >= c.expires_at).length;
  const sub = [
    liveN && `${liveN} live`,
    openN && `${openN} open`,
    late.length && `${late.length} opens ${fmtWall(Math.min(...late.map((c) => c.active_from)))}`,
    expiredN && `${expiredN} expired`,
  ]
    .filter(Boolean)
    .join(" · ");

  // the header (and its Edit button) stays even with every court off — that's
  // exactly when the QM needs to turn one back on
  if (!courts.length) return null;

  // ponytail: >9 courts wrap to a 3rd column; the page scroll takes the overflow
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-0.5">
        <h2 className="text-base font-bold tracking-[-0.015em] text-foreground">Courts</h2>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        <Button
          variant="ghost"
          size="xs"
          data-testid="courts-edit"
          className="ml-auto self-center rounded-full text-muted-foreground"
          onClick={() => setEditing(true)}
        >
          Edit courts
        </Button>
      </div>
      {editing && <CourtsEditDialog session={session} courts={courts} onClose={() => setEditing(false)} />}
      <div
        className={cn(
          "grid gap-3",
          liveCourts.length <= 4 ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3",
        )}
      >
        {liveCourts.map((court) => {
          const draft = drafts[court.id] ?? EMPTY_DRAFT;
          const filled = draft.filter(Boolean);
          // drag-flow (draft) wins over click-flow (selection) when the draft can
          // start a match on its own (2 → singles, 4 → doubles); a half-built
          // draft (1 or 3) never silently discards a startable selection
          const useDraft = filled.length === 2 || filled.length === 4;
          const startPlayers = useDraft ? filled : selection;
          return (
            <CourtCard
              key={court.id}
              court={court}
              match={activeMatches.find((m) => m.court_number === court.id) ?? null}
              queue={queue}
              playSeconds={playSeconds}
              pointsToWin={session?.points_to_win}
              canStart={useDraft || canStartSelection}
              // a lineup drafted on the card is already on screen, so its Start is
              // one tap; a queue selection isn't, so it still asks first
              onStartClick={() =>
                useDraft ? onStartDraft(court.id, filled) : onStartMatch(court.id, startPlayers, "selection")
              }
              onStartSingles={() => onStartDraft(court.id, [filled[0], filled[1]])}
              onDropPlayer={onDropPlayer}
              canDropPlayer={(entryId) => !draftedIds.has(entryId) && filled.length < 4}
              draft={draft}
              draftedIds={draftedIds}
              onDropSlot={(slotIdx, entryId) => onDropSlot(court.id, slotIdx, entryId)}
              onClearSlot={(slotIdx) => onClearSlot(court.id, slotIdx)}
              onClearDraft={() => onClearDraft(court.id)}
              serverTime={serverTime}
            />
          );
        })}
      </div>
    </div>
  );
}

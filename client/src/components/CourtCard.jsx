import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { drag, rearrange, useDragSource, valid } from "@/lib/dnd";
import { cn, fmtClock, fmtWall, lastCallMins, shortSkill, TIER_CLASS } from "@/lib/utils";
import { extendCourt, updateMatchTeams } from "../api.js";
import ConfirmEndDialog from "./ConfirmEndDialog.jsx";
import EndMatchModal from "./EndMatchModal.jsx";
import SubstituteDialog from "./SubstituteDialog.jsx";

function playerName(queue, entryId) {
  return queue.find((e) => e.id === entryId)?.name ?? "?";
}

function playerSkill(queue, entryId) {
  return queue.find((e) => e.id === entryId)?.skill_level;
}

function TeamPlayer({ entryId, name, skill }) {
  const dragProps = useDragSource(() => ({ kind: "player", entryId, status: "playing" }));
  // draft .chip: one card per player, tier badge riding on the right
  return (
    <div
      {...dragProps}
      onDragStart={(e) => {
        e.stopPropagation();
        dragProps.onDragStart(e);
      }}
      className="flex min-w-0 cursor-grab items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[13px] font-semibold text-foreground shadow-sm transition-colors dark:bg-secondary"
    >
      <span className="truncate">{name}</span>
      {skill && (
        <span className={cn("tier ml-auto shrink-0", TIER_CLASS[skill] ?? TIER_CLASS.intermediate)}>
          {shortSkill(skill)}
        </span>
      )}
    </div>
  );
}

function TeamPanel({ side, entryIds, queue, matchId, match }) {
  const dragProps = useDragSource(() => ({ kind: "team", matchId, side }));
  const [over, setOver] = useState(false);
  const toast = useToast();
  const sideOf = (id) =>
    [match.team1_p1, match.team1_p2].includes(id)
      ? 1
      : [match.team2_p1, match.team2_p2].includes(id)
        ? 2
        : null;
  const p = drag.current;
  const fromSide = p?.kind === "player" ? sideOf(p.entryId) : null;
  const canDrop =
    !!p &&
    (p.kind === "team"
      ? valid("team") && p.matchId === matchId && p.side !== side
      : fromSide != null && fromSide !== side);

  return (
    <div
      {...dragProps}
      data-drop={`team-${side}-m${matchId}`}
      data-team-side={side}
      data-match-id={matchId}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const q = drag.current;
        if (!q) return;
        if (q.kind === "team") {
          if (valid("team") && q.matchId === matchId && q.side !== side) {
            updateMatchTeams(match.id, rearrange(match, q.side, side)).catch((err) =>
              toast(err?.data?.error ?? "Could not update teams", "error"),
            );
          }
        } else if (q.kind === "player") {
          const from = sideOf(q.entryId);
          if (from != null && from !== side) {
            updateMatchTeams(match.id, rearrange(match, from, side, q.entryId)).catch((err) =>
              toast(err?.data?.error ?? "Could not update teams", "error"),
            );
          }
        }
      }}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg transition-colors",
        over && canDrop && "bg-drop-target ring-2 ring-drop-target-border",
        over && drag.current && !canDrop && "bg-drop-invalid ring-2 ring-drop-invalid-border",
      )}
    >
      {entryIds.filter(Boolean).map((id) => (
        <TeamPlayer key={id} entryId={id} name={playerName(queue, id)} skill={playerSkill(queue, id)} />
      ))}
    </div>
  );
}

/** One lineup slot — drop target for a waiting/resting player, clearable once filled. */
function Slot({ courtId, idx, entryId, name, draftedIds = new Set(), draft = [], onDropSlot, onClearSlot }) {
  const [over, setOver] = useState(false);
  const payload = drag.current; // read live: drop can run before a dragover re-render flushes
  const filled = entryId != null;
  // a player already drafted anywhere (here or another court) can't be dropped again
  const droppable = (p) => valid("slot", p) && !draftedIds.has(p.entryId) && !draft.includes(p.entryId);
  const canDrop = !filled && !!payload && droppable(payload);

  return (
    <div
      data-drop="slot"
      data-court-id={courtId}
      data-slot-idx={idx}
      data-testid={`slot-${idx}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        // stopPropagation: this drop is consumed by the slot, not the court-level zone
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
            data-testid={`slot-clear-${idx}`}
            aria-label={`Clear ${name} from lineup`}
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

/** 2×2 lineup matrix (draft .matrix — no header chrome): Team A = 0,1 · Team B = 2,3. */
function SlotsMatrix({ courtId, draft, draftedIds = new Set(), queue, onDropSlot, onClearSlot }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[0, 1, 2, 3].map((i) => (
        <Slot
          key={i}
          courtId={courtId}
          idx={i}
          entryId={draft[i]}
          name={draft[i] ? playerName(queue, draft[i]) : null}
          draftedIds={draftedIds}
          draft={draft}
          onDropSlot={onDropSlot}
          onClearSlot={onClearSlot}
        />
      ))}
    </div>
  );
}

/** Draft .opens-strip: a not-yet-open court is an amber strip, not a card —
 *  no drop zone, no start, joins the rotation on its own when active_from hits. */
function OpensStrip({ court, opensInSecs }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 self-start rounded-lg border border-amber/25 bg-wash-amber px-4 py-3 shadow-card">
      <span className="text-[14.5px] font-bold tracking-tight text-foreground">{court.label}</span>
      <span data-testid="opens-in-note" className="min-w-0 text-xs text-muted-foreground">
        opens {fmtWall(court.active_from)} — joins the rotation automatically
      </span>
      <span
        data-testid="opens-in-badge"
        className="ml-auto shrink-0 font-mono text-xs font-bold tabular-nums text-amber"
      >
        in {fmtClock(opensInSecs)}
      </span>
    </div>
  );
}

export default function CourtCard({
  court,
  match,
  queue,
  playSeconds,
  serverTime,
  onStartClick,
  onStartSingles,
  canStart,
  onDropPlayer,
  canDropPlayer,
  draft = [],
  draftedIds = new Set(),
  onDropSlot,
  onClearSlot,
  onClearDraft,
}) {
  const [showEnd, setShowEnd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [over, setOver] = useState(false);
  const toast = useToast();
  const isActive = !!match;
  const secs = isActive ? (playSeconds.get(match.id) ?? 0) : 0;
  // player names for the end-flow dialogs (match rows carry entry ids only)
  const nameOf = (id) => queue.find((e) => e.id === id)?.name;
  const joinTeam = (ids) => ids.filter(Boolean).map(nameOf).join(" & ");
  const teamNames = isActive
    ? { team1: joinTeam([match.team1_p1, match.team1_p2]), team2: joinTeam([match.team2_p1, match.team2_p2]) }
    : null;

  // A match can vanish mid-flow (ended on another client, slate promotion) —
  // without this the stale flags would auto-open the dialog for the NEXT match
  useEffect(() => {
    if (!isActive) {
      setShowEnd(false);
      setShowConfirm(false);
    }
  }, [isActive]);

  // Independent countdown expiration logic (remaining_ms = expires_at - now())
  const now = serverTime ?? Math.floor(Date.now() / 1000);
  const hasTimer = court.expires_at != null;
  const remainingSecs = hasTimer ? Math.max(0, court.expires_at - now) : null;
  const isExpired = hasTimer && remainingSecs <= 0;
  const isExpiring = isExpired && isActive; // timer hit zero mid-game — Last Game
  // Staggered start: court not open yet — no drops, no starts until active_from
  const opensInSecs = court.active_from != null ? Math.max(0, court.active_from - now) : null;
  const isNotOpen = opensInSecs != null && opensInSecs > 0;

  const draftFilled = draft.filter(Boolean);
  const canStartSingles = !isActive && draftFilled.length === 2; // any two slots → singles

  // live check: drop may run before the dragover re-render flushes (batched), so never snapshot it.
  // Resting players are welcome too — a lineup slot takes them straight out of rest.
  const dropAllowed = () => {
    const p = drag.current;
    const isPlayer = p?.kind === "player" && (p.status === "waiting" || p.status === "resting");
    return isPlayer && canDropPlayer(p.entryId);
  };
  const canAcceptNewMatch = !isExpired && !isNotOpen;

  async function handleExtend() {
    try {
      await extendCourt(court.id, 60);
      toast("Court extended by 60 min", "success");
    } catch (err) {
      toast(err?.data?.error ?? "Could not extend court", "error");
    }
  }

  // not-open courts are the draft's amber strip, not a card — no drop, no start
  if (isNotOpen && !isActive) {
    return <OpensStrip court={court} opensInSecs={opensInSecs} />;
  }

  return (
    <Card
      data-drop={`court-${court.id}`}
      className={cn(
        "flex flex-col gap-3 py-3.5 shadow-card",
        isExpiring && "border-amber/40 bg-wash-amber/40 ring-amber/40",
        isExpired && !isActive && "animate-redpulse ring-destructive/40",
        isActive &&
          !isExpiring &&
          "border-court-live-border bg-gradient-to-b from-court-live to-court-live-2 ring-court-live-border",
      )}
    >
      {/* grid-cols wins outright (base has no unconditional grid-cols); items-center! is important so it beats base items-start regardless of emission order */}
      <CardHeader className="grid-cols-[minmax(0,1fr)_auto] items-center! gap-2 pb-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {isActive && !isExpiring && (
            <span data-testid="live-badge" className="live-dot shrink-0" aria-hidden="true" />
          )}
          <span className="text-[14.5px] font-bold tracking-tight text-foreground">{court.label}</span>
          {isExpiring && (
            <Badge
              className="rounded-full border-0 bg-wash-amber text-[11px] font-bold uppercase tracking-wide text-amber"
              data-testid="expiring-last-game-badge"
            >
              ⏳ Last Game
            </Badge>
          )}
          {!isActive && lastCallMins(court, now) != null && (
            <span
              data-testid="last-call-badge"
              className="text-[11px] font-bold uppercase tracking-wide text-amber"
            >
              Last call · {lastCallMins(court, now)}m left
            </span>
          )}
          {isExpired && !isActive && (
            <span
              data-testid="expired-badge"
              className="text-[11px] font-bold uppercase tracking-wide text-destructive"
            >
              EXPIRED
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isActive ? (
            <span
              data-testid="court-elapsed"
              className="font-mono text-2xl font-bold tracking-tight text-green-deep tabular-nums"
            >
              {fmtClock(secs)}
            </span>
          ) : (
            hasTimer && (
              <span
                className={cn(
                  "font-mono text-xs font-semibold tabular-nums",
                  isExpired
                    ? "text-destructive"
                    : remainingSecs < 900
                      ? "text-amber"
                      : "text-muted-foreground",
                )}
                data-testid="court-countdown"
              >
                rental {isExpired ? "ended" : "to"} {fmtWall(court.expires_at)}
              </span>
            )
          )}
        </div>
      </CardHeader>

      {isActive && (
        <CardContent className="flex flex-col gap-3 px-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TeamPanel
              side={1}
              entryIds={[match.team1_p1, match.team1_p2]}
              queue={queue}
              matchId={match.id}
              match={match}
            />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
              VS
            </span>
            <TeamPanel
              side={2}
              entryIds={[match.team2_p1, match.team2_p2]}
              queue={queue}
              matchId={match.id}
              match={match}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="mr-auto min-w-0 text-xs text-muted-foreground">
              {isExpiring ? (
                "rental ended — last game"
              ) : (
                <>
                  {match.format}
                  {hasTimer && (
                    <>
                      {" · rental ends "}
                      <span
                        data-testid="court-countdown"
                        className={cn(
                          "font-mono font-semibold tabular-nums",
                          remainingSecs < 900 ? "text-amber" : "text-foreground",
                        )}
                      >
                        {fmtWall(court.expires_at)}
                      </span>
                    </>
                  )}
                </>
              )}
            </p>
            {isExpired && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                data-testid="btn-extend-court"
                onClick={handleExtend}
              >
                Extend Court (+1hr)?
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              data-testid="btn-substitute"
              onClick={() => setShowSub(true)}
            >
              Sub
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setShowConfirm(true)}>
              End match
            </Button>
          </div>
        </CardContent>
      )}

      {!isActive && (
        <CardContent
          data-drop={`court-${court.id}`}
          onDragOver={(e) => {
            if (canAcceptNewMatch) {
              e.preventDefault();
              setOver(true);
            }
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (canAcceptNewMatch && dropAllowed()) onDropPlayer(court.id, drag.current.entryId);
          }}
          className={cn(
            "flex flex-1 flex-col gap-3 rounded-md",
            over && canAcceptNewMatch && dropAllowed() && "bg-drop-target ring-2 ring-drop-target-border",
            over &&
              canAcceptNewMatch &&
              drag.current &&
              !dropAllowed() &&
              "bg-drop-invalid ring-2 ring-drop-invalid-border",
          )}
        >
          {isExpired ? (
            <>
              <div className="flex items-center justify-center rounded-md border border-destructive/25 bg-wash-red px-3 py-6 text-center">
                <span className="text-xs font-bold text-destructive">
                  ⚠ Rental time has run out — court removed from the available pool
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="mr-auto text-xs text-muted-foreground">rental time has run out</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  data-testid="btn-extend-court"
                  onClick={handleExtend}
                >
                  Extend Court (+1hr)?
                </Button>
              </div>
            </>
          ) : (
            <>
              <SlotsMatrix
                courtId={court.id}
                draft={draft}
                draftedIds={draftedIds}
                queue={queue}
                onDropSlot={onDropSlot}
                onClearSlot={onClearSlot}
              />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="mr-auto min-w-0 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">
                    {canStart
                      ? "Drop players here"
                      : draftFilled.length === 3
                        ? "3 of 4 — one more opens Start"
                        : "Select 2 or 4 players"}
                  </span>
                  {!canStart && draftFilled.length !== 3 && " · drag from the queue, or click to select"}
                </p>
                {draftFilled.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full"
                    data-testid="btn-clear-draft"
                    onClick={onClearDraft}
                  >
                    Clear
                  </Button>
                )}
                {canStartSingles && (
                  <Button
                    size="sm"
                    className="rounded-full"
                    data-testid="btn-start-singles"
                    onClick={onStartSingles}
                  >
                    Start Singles
                  </Button>
                )}
                <Button
                  size="sm"
                  className="rounded-full"
                  data-testid="btn-start-match"
                  disabled={!canStart}
                  onClick={() => onStartClick()}
                >
                  Start match
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}

      <ConfirmEndDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        teamNames={teamNames}
        onConfirm={(winner) => {
          setShowConfirm(false);
          setShowEnd(winner ?? true);
        }}
      />
      {showEnd && match && (
        <EndMatchModal
          match={match}
          courtLabel={court.label}
          teamNames={teamNames}
          winner={showEnd === "team1" || showEnd === "team2" ? showEnd : null}
          onClose={() => setShowEnd(false)}
        />
      )}
      {showSub && match && (
        <SubstituteDialog
          match={match}
          queue={queue}
          draftedIds={draftedIds}
          onClose={() => setShowSub(false)}
        />
      )}
    </Card>
  );
}

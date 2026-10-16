import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { cn, SKILL_TIERS, TIER_CLASS, titleCaseSkill } from "@/lib/utils";
import { checkinPlayer, createPlayer } from "../api.js";

export function SkillChip({ level }) {
  return (
    <span className={cn("tier", TIER_CLASS[level] ?? TIER_CLASS.intermediate)}>{titleCaseSkill(level)}</span>
  );
}

// Unified Search-and-Add Combobox: 1-click check-in for pool matches,
// register-and-check-in for brand-new names. Shared by SetupScreen and the
// live check-in popover in QueueGrid.
// Pre-session mode (no `session`): nothing is checked in yet — picking a match or
// registering a new player calls `onPick(player)` so the setup screen can mark
// the player selected; `selectedIds` plays the role of the queue for duplicates.
// `inputTestid`/`placeholder`/`hint`/`maxMatches` only decorate the embedding
// surface (live popover) — setup keeps its defaults.
// `requireConfirm` (live check-in): gate the add behind an "Add <name> to the
// pool?" dialog — register-new confirms before the create+checkin pair fires.
export default function PlayerSearchAdd({
  session,
  queue = [],
  players,
  onPlayersChanged,
  onCheckedIn,
  selectedIds = [],
  onPick,
  inputTestid,
  placeholder,
  hint,
  maxMatches = Infinity,
  requireConfirm = false,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [newPlayerSkill, setNewPlayerSkill] = useState("intermediate");
  const [registering, setRegistering] = useState(false);
  // pending confirm: { playerId } for an existing registrant, or
  // { name, skill } for register-new (player not created until confirmed)
  const [pending, setPending] = useState(null);
  const toast = useToast();

  // Normalized search & duplicate checks
  const pre = !session;
  const inQueue = new Set(pre ? selectedIds : queue.map((e) => e.player_id));
  const pool = players.filter((p) => !inQueue.has(p.id));
  const normQuery = searchQuery.trim().toLowerCase();
  const activeDuplicate = normQuery
    ? pre
      ? players.find((p) => inQueue.has(p.id) && p.name.trim().toLowerCase() === normQuery)
      : queue.find((e) => e.name.trim().toLowerCase() === normQuery)
    : null;
  const exactPoolMatch = normQuery ? pool.find((p) => p.name.trim().toLowerCase() === normQuery) : null;
  // count from the full pool, render only the first maxMatches — the label
  // must not lie when matches exceed the cap
  const matchingAll = normQuery ? pool.filter((p) => p.name.toLowerCase().includes(normQuery)) : [];
  const matchingPool = matchingAll.slice(0, maxMatches);

  async function handleQuickCheckIn(playerId) {
    if (pre) {
      const found = players.find((p) => p.id === playerId);
      setSearchQuery("");
      if (found) onPick?.(found);
      return;
    }
    if (requireConfirm) {
      const found = players.find((p) => p.id === playerId);
      if (found) setPending({ playerId, name: found.name });
      return;
    }
    doCheckIn(playerId);
  }

  async function doCheckIn(playerId, created = null) {
    try {
      await checkinPlayer(session.id, playerId);
    } catch (err) {
      toast(err?.data?.error ?? "Could not check in", "error");
      return;
    }
    setSearchQuery("");
    // a just-registered player isn't in the (stale) pool yet — pass them through
    onCheckedIn?.(players.find((p) => p.id === playerId) ?? created);
  }

  // The confirm gate's Add: create first for register-new, then check in.
  async function confirmPending() {
    if (!pending) return;
    setRegistering(true);
    try {
      let playerId = pending.playerId;
      let created = null;
      if (!playerId) {
        const { player } = await createPlayer({ name: pending.name, skill_level: pending.skill });
        playerId = player.id;
        created = player;
        onPlayersChanged?.();
      }
      await doCheckIn(playerId, created);
      onPlayersChanged?.();
    } catch (err) {
      toast(err?.data?.error ?? "Could not register player", "error");
      // refresh pool
      onPlayersChanged?.();
    } finally {
      setRegistering(false);
      setPending(null);
    }
  }

  async function handleRegisterAndCheckIn(e) {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed || activeDuplicate || exactPoolMatch) return;
    if (!pre && requireConfirm) {
      setPending({ name: trimmed, skill: newPlayerSkill });
      return;
    }
    setRegistering(true);
    try {
      const { player } = await createPlayer({ name: trimmed, skill_level: newPlayerSkill });
      if (pre) onPick?.(player);
      else await checkinPlayer(session.id, player.id);
      setSearchQuery("");
      onPlayersChanged?.();
      if (!pre) onCheckedIn?.(player);
    } catch (err) {
      toast(err?.data?.error ?? "Could not register player", "error");
      // refresh pool
      onPlayersChanged?.();
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="search-add-combobox">
      <Input
        type="text"
        data-testid={inputTestid}
        placeholder={
          placeholder ??
          (pre
            ? "Search player to select, or type a new name to register..."
            : "Search player to check in, or type a new name to register...")
        }
        aria-label="Search or add player"
        className="rounded-full bg-card"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      {!normQuery && hint && (
        <div className="text-2xs text-muted-foreground" data-testid="checkin-hint">
          {hint}
        </div>
      )}
      {normQuery && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-2 text-xs">
          {activeDuplicate && (
            <div
              className="flex items-center justify-between text-destructive"
              data-testid="duplicate-session-error"
            >
              <span>
                Player &ldquo;{activeDuplicate.name}&rdquo; is already{" "}
                {pre ? "selected" : "active in this session"}.
              </span>
              <Button size="xs" className="rounded-full" disabled>
                Add Player
              </Button>
            </div>
          )}

          {matchingPool.length > 0 && (
            <div className="flex flex-col gap-1" data-testid="combobox-matches">
              <span className="text-2xs uppercase tracking-wider text-muted-foreground">
                {pre ? "1-Click Select" : "1-Click Check-In"} ({matchingAll.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {matchingPool.map((p) => {
                  const isExact = exactPoolMatch?.id === p.id;
                  return (
                    <Button
                      key={p.id}
                      variant={isExact ? "default" : "outline"}
                      size="xs"
                      className="rounded-full"
                      onClick={() => handleQuickCheckIn(p.id)}
                    >
                      {p.name}
                      <SkillChip level={p.skill_level} />
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {!activeDuplicate && !exactPoolMatch && (
            <form
              onSubmit={handleRegisterAndCheckIn}
              className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2"
              data-testid="register-new-player-prompt"
            >
              <span className="text-foreground">
                Register <strong>&ldquo;{searchQuery.trim()}&rdquo;</strong> as New Player:
              </span>
              <select
                aria-label="New player skill level"
                className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                value={newPlayerSkill}
                onChange={(e) => setNewPlayerSkill(e.target.value)}
              >
                {SKILL_TIERS.map((s) => (
                  <option key={s} value={s}>
                    {titleCaseSkill(s)}
                  </option>
                ))}
              </select>
              <Button type="submit" size="xs" className="rounded-full" disabled={registering}>
                {registering ? "..." : "Add Player"}
              </Button>
            </form>
          )}
        </div>
      )}

      {/* confirm gate (requireConfirm, live check-in only) */}
      <Dialog
        open={!!pending}
        onOpenChange={(v) => {
          if (!v) setPending(null);
        }}
      >
        <DialogContent className="sm:max-w-xs" data-testid="checkin-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Add {pending?.name} to the pool?</DialogTitle>
            <DialogDescription>They will join the session queue as waiting.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              data-testid="checkin-confirm-cancel"
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-full"
              autoFocus
              disabled={registering}
              data-testid="checkin-confirm-add"
              onClick={confirmPending}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

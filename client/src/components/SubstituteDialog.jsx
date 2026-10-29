import { useState } from "react";
import { substitute } from "@/api";
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

// v1.6 mid-match substitution: a waiting player takes one seat; the player
// coming off goes to Rest. The finished game counts for whoever ends it.
export default function SubstituteDialog({ match, queue, draftedIds, onClose }) {
  const toast = useToast();
  const nameOf = (id) => queue.find((e) => e.id === id)?.name ?? "—";
  const seats = [match.team1_p1, match.team1_p2, match.team2_p1, match.team2_p2].filter(Boolean);
  const bench = queue.filter((e) => e.status === "waiting" && !draftedIds?.has(e.id));
  const [out, setOut] = useState(seats[0]);
  const [inn, setInn] = useState(bench[0]?.id ?? null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await substitute(match.id, out, inn);
      toast(`${nameOf(inn)} in for ${nameOf(out)}`, "success");
      onClose();
    } catch (err) {
      toast(err?.data?.error ?? "Could not substitute", "error");
      setBusy(false);
    }
  }

  const select = "h-9 w-full rounded-md border border-border bg-card px-2 text-sm";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xs shadow-lift" data-testid="substitute-dialog">
        <DialogHeader>
          <DialogTitle>Substitute a player</DialogTitle>
          <DialogDescription>The player coming off goes to Rest; the game carries on.</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
          Coming off
          <select
            data-testid="sub-out"
            className={select}
            value={out}
            onChange={(e) => setOut(Number(e.target.value))}
          >
            {seats.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
          Coming on
          {bench.length ? (
            <select
              data-testid="sub-in"
              className={select}
              value={inn ?? ""}
              onChange={(e) => setInn(Number(e.target.value))}
            >
              {bench.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-foreground">Nobody is waiting.</span>
          )}
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button data-testid="sub-confirm" disabled={busy || inn == null} onClick={confirm}>
            Substitute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

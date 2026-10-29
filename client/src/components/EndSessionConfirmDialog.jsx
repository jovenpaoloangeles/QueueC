import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirm gate for the header 'End Session' button — the session is destroyed,
 * so it must never end on a single mis-click. Parent owns `open` state;
 * onConfirm() fires only when the user commits. Esc/backdrop = cancel.
 */
export default function EndSessionConfirmDialog({ open, onOpenChange, onConfirm, onCourt = 0, onDeck = 0 }) {
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs shadow-lift" data-testid="end-session-confirm-dialog">
        <DialogHeader>
          <DialogTitle>End this session?</DialogTitle>
          <DialogDescription>
            The session and its courts will be closed. Players return to the pool.
          </DialogDescription>
          {onCourt + onDeck > 0 && (
            <p
              data-testid="end-session-unfinished"
              className="rounded-md bg-wash-amber px-3 py-2 text-[13px] font-medium text-amber"
            >
              {[
                onCourt && `${plural(onCourt, "game")} still on court`,
                onDeck && `${plural(onDeck, "lineup")} on deck`,
              ]
                .filter(Boolean)
                .join(" and ")}{" "}
              will be discarded.{onCourt > 0 && " Cancel and end those games first to keep their scores."}
            </p>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            data-testid="end-session-cancel"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="rounded-full"
            data-testid="end-session-confirm"
            onClick={onConfirm}
          >
            End Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

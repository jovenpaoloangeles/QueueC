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
 * Step 1 of the End Match flow: a dumb confirm gate.
 * Parent owns `open` state; onConfirm() is called when the user commits.
 */
export default function ConfirmEndDialog({ open, onOpenChange, onConfirm, teamsLine }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs shadow-lift">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">⚑</span>
            Conclude live match?
          </DialogTitle>
          <DialogDescription>Record final score, shuttle usage and match rating.</DialogDescription>
          {teamsLine && (
            <p data-testid="confirm-end-teams" className="text-sm font-semibold text-foreground">
              {teamsLine}
            </p>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            data-testid="confirm-end-cancel"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {/* variant="destructive" already renders the draft's .btn-danger look
              (wash fill + red ink) — className color overrides would lose the
              cascade anyway since cn() is a plain joiner, not tailwind-merge */}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="rounded-full"
            data-testid="confirm-end-end"
            onClick={onConfirm}
          >
            End Match
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
export default function ConfirmEndDialog({ open, onOpenChange, onConfirm, teamNames }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xs shadow-lift"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onConfirm();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">⚑</span>
            Conclude live match?
          </DialogTitle>
          <DialogDescription>Record final score, shuttle usage and match rating.</DialogDescription>
          {teamNames && (
            <div data-testid="confirm-end-teams" className="flex flex-col gap-2 pt-1">
              <p className="text-2xs uppercase tracking-wider text-muted-foreground">Who won?</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 rounded-full"
                  data-testid="confirm-end-winner1"
                  onClick={() => onConfirm("team1")}
                >
                  {teamNames.team1}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 rounded-full"
                  data-testid="confirm-end-winner2"
                  onClick={() => onConfirm("team2")}
                >
                  {teamNames.team2}
                </Button>
              </div>
            </div>
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
            autoFocus
            onClick={onConfirm}
          >
            End Match
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

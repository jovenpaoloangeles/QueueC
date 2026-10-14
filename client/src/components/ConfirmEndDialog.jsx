import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * Step 1 of the End Match flow: a dumb confirm gate.
 * Parent owns `open` state; onConfirm() is called when the user commits.
 */
export default function ConfirmEndDialog({ open, onOpenChange, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">⚑</span>
            Conclude live match?
          </DialogTitle>
          <DialogDescription>Record final score, shuttle usage and match rating.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" data-testid="confirm-end-cancel" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" size="sm" data-testid="confirm-end-end" onClick={onConfirm}>
            End Match
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * Confirm gate for the header 'End Session' button — the session is destroyed,
 * so it must never end on a single mis-click. Parent owns `open` state;
 * onConfirm() fires only when the user commits. Esc/backdrop = cancel.
 */
export default function EndSessionConfirmDialog({ open, onOpenChange, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs shadow-lift" data-testid="end-session-confirm-dialog">
        <DialogHeader>
          <DialogTitle>End this session?</DialogTitle>
          <DialogDescription>
            The session and its courts will be closed. Players return to the pool.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" className="rounded-full" data-testid="end-session-cancel" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" size="sm" className="rounded-full" data-testid="end-session-confirm" onClick={onConfirm}>
            End Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

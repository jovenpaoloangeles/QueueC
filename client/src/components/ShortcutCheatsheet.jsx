import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const KEYS = [
  ["c", "Open check-in (search focused)"],
  ["s", "Promote next slate to a free court"],
  ["e", "End the longest-running game"],
  ["Enter", "Confirm the open dialog"],
  ["Esc", "Cancel / close"],
  ["?", "This cheatsheet"],
];

export default function ShortcutCheatsheet({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="cheatsheet-dialog">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Ignored while typing in a field.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1.5 text-sm">
          {KEYS.map(([key, desc]) => (
            <li key={key} className="flex items-center gap-3">
              <kbd className="min-w-14 rounded-md border border-border bg-secondary px-2 py-0.5 text-center font-mono text-xs font-bold">
                {key}
              </kbd>
              <span className="text-muted-foreground">{desc}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

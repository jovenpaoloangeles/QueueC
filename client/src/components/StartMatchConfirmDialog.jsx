import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn, SKILL_BADGE, balanceHint } from '@/lib/utils'

export { balanceHint }

const names = team => team.map(p => p.name).join(' & ')

function Side({ team }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="font-medium">{names(team)}</span>
      {team.map((p, i) => p.skill_level && (
        <span key={i} className={cn('rounded px-1 py-0.5 text-[10px] leading-none', SKILL_BADGE[p.skill_level])}>
          {p.skill_level.replace(/_/g, ' ')}
        </span>
      ))}
    </span>
  )
}

function Row({ m, testid }) {
  const hint = balanceHint(m)
  return (
    <li data-testid={testid} className="flex flex-col gap-0.5 rounded border border-border px-2 py-1.5 text-xs">
      <div className="flex items-baseline gap-1">
        {m.courtLabel && <span className="font-semibold">{m.courtLabel} ·</span>}
        <Side team={m.team1} />
        <span className="text-muted-foreground">vs</span>
        <Side team={m.team2} />
      </div>
      <div className="flex gap-2 text-[11px] text-muted-foreground">
        <span>{m.format === 'singles' ? 'Singles' : 'Doubles'}</span>
        {hint && <span data-testid="start-confirm-balance" className={hint.tone}>{hint.label}</span>}
      </div>
    </li>
  )
}

/**
 * Confirm gate before any match starts. Parent owns `open`.
 * matches: [{courtLabel, team1:[{name,skill_level}], team2:[...], format}]; slate: same shape (no courtLabel).
 */
export default function StartMatchConfirmDialog({ open, onOpenChange, title, confirmText, matches = [], slate = [], onConfirm, busy = false }) {
  const n = matches.length
  const confirmLabel = n > 1 ? `Start ${n} matches` : n === 1 ? 'Start' : 'Slate lineup'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="start-confirm-dialog"
        onKeyDown={e => {
          if (e.key === 'Enter' && !busy) { e.preventDefault(); onConfirm() }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title ?? (n > 1 ? 'Start these matches?' : n === 1 ? 'Start this match?' : 'Slate next lineup?')}</DialogTitle>
          <DialogDescription>Review the lineup before it goes live.</DialogDescription>
        </DialogHeader>
        {n > 0 && (
          <ul className="flex flex-col gap-1.5" data-testid="start-confirm-matches">
            {matches.map((m, i) => <Row key={i} m={m} testid="start-confirm-row" />)}
          </ul>
        )}
        {slate.length > 0 && (
          <div className="flex flex-col gap-1.5" data-testid="start-confirm-slate">
            <p className="text-xs font-semibold text-muted-foreground">Next on deck</p>
            <ul className="flex flex-col gap-1.5">
              {slate.map((m, i) => <Row key={i} m={m} testid="start-confirm-slate-row" />)}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" data-testid="start-confirm-cancel" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" autoFocus data-testid="start-confirm-yes" disabled={busy} onClick={onConfirm}>
            {confirmText ?? confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

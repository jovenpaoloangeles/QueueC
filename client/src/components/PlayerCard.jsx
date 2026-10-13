import { cn, fmtClock, fmtMins, SKILL_BADGE } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export default function PlayerCard({ entry, waitSecs, selectionIndex, onClick }) {
  const isSelected = selectionIndex !== undefined && selectionIndex !== -1
  const skillClass = SKILL_BADGE[entry.skill_level] ?? SKILL_BADGE.intermediate

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded border p-1.5 cursor-pointer flex justify-between items-center select-none transition-colors',
        isSelected
          ? 'bg-accent/10 border-accent border-2'
          : 'bg-card border-border'
      )}
    >
      <div className="flex items-center gap-1.5">
        {isSelected && (
          <span className="bg-accent text-white text-[7px] size-3.5 rounded-sm flex items-center justify-center font-bold">
            {selectionIndex + 1}
          </span>
        )}
        <span className={cn('text-[11px]', isSelected ? 'text-blue-200 font-semibold' : 'text-muted-foreground')}>
          {entry.name}
        </span>
        <Badge className={cn('text-[7px] px-1 py-0 h-auto rounded-sm border-0', skillClass)}>
          {entry.skill_level.replace('_', ' ')}
        </Badge>
      </div>
      <div className="text-right">
        <div className="text-[9px] text-yellow-400">⏳ {fmtClock(waitSecs ?? 0)}</div>
        <div className="text-[8px] text-muted-foreground/30">🏸 {fmtMins(entry.total_seconds_played ?? 0)}</div>
      </div>
    </div>
  )
}

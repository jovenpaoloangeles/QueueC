import { Button } from '@/components/ui/button'

export default function RestingTray({ entries, onReturn }) {
  return (
    <div
      data-drop="resting"
      className="shrink-0 rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-3"
    >
      <div className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Resting</div>
      {entries.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">Drop a player here to bench them</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {entries.map(e => (
            <Button key={e.id} variant="outline" size="sm" onClick={() => onReturn(e.id)}>
              {e.name} ↩
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

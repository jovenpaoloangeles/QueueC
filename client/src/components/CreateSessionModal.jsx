import { useState } from 'react'
import { createSession } from '../api.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

function toUnix(dateStr, timeStr) {
  // timeStr: HH:MM (24h text input)
  return Math.floor(new Date(`${dateStr}T${timeStr}`).getTime() / 1000)
}

const today = new Date().toISOString().split('T')[0]

const DURATION_OPTIONS = [
  { value: '', label: 'Session window (no countdown)' },
  { value: '60', label: '1 Hour (60 mins)' },
  { value: '90', label: '1.5 Hours (90 mins)' },
  { value: '120', label: '2 Hours (120 mins)' },
  { value: '150', label: '2.5 Hours (150 mins)' },
  { value: '180', label: '3 Hours (180 mins)' },
  { value: '240', label: '4 Hours (240 mins)' },
  { value: 'custom', label: 'Custom…' },
]

function syncCourtRows(prevRows, count) {
  const n = Math.max(0, Math.min(10, Number(count) || 0))
  const next = prevRows.slice(0, n)
  while (next.length < n) {
    const idx = next.length + 1
    next.push({ label: `Court ${idx}`, duration_minutes: '', custom_minutes: 180 })
  }
  return next
}

export default function CreateSessionModal({ onClose }) {
  const [form, setForm] = useState({ name: 'Evening Session', date: today, start: '18:00', end: '21:00', courts: 2 })
  const [courtConfigs, setCourtConfigs] = useState(() => syncCourtRows([], 2))
  const [loading, setLoading] = useState(false)

  function handleCourtCountChange(val) {
    setForm(f => ({ ...f, courts: val }))
    setCourtConfigs(prev => syncCourtRows(prev, val))
  }

  function updateCourtConfig(idx, patch) {
    setCourtConfigs(prev => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
  }

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    const count = Number(form.courts)
    const courtsPayload = syncCourtRows(courtConfigs, count).map((c, idx) => ({
      label: c.label?.trim() || `Court ${idx + 1}`,
      duration_minutes: c.duration_minutes === 'custom'
        ? (c.custom_minutes === '' ? null : Number(c.custom_minutes))
        : (c.duration_minutes === '' ? null : Number(c.duration_minutes)),
    }))
    await createSession({
      name: form.name,
      scheduled_start: toUnix(form.date, form.start),
      scheduled_end: toUnix(form.date, form.end),
      court_count: count,
      courts: courtsPayload,
    })
    // intentionally no onClose() here — App closes reactively via SSE
    setLoading(false)
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Session</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3 text-xs">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="csm-name">Name</Label>
            <Input id="csm-name" autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="csm-date">Date</Label>
            <Input id="csm-date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="csm-start">Start</Label>
              <Input id="csm-start" type="time" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} required />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="csm-end">End</Label>
              <Input id="csm-end" type="time" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} required />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="csm-courts">Courts</Label>
            <Input
              id="csm-courts"
              type="number"
              min="1"
              max="10"
              value={form.courts}
              onChange={e => handleCourtCountChange(e.target.value)}
              required
            />
          </div>

          {courtConfigs.length > 0 && (
            <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-md border border-border bg-muted/20 p-2" data-testid="dynamic-court-rows">
              <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                Per-Court Configuration
              </span>
              {courtConfigs.map((cfg, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    tabIndex={-1}
                    aria-label={`Court ${idx + 1} label`}
                    className="w-28 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                    value={cfg.label}
                    onChange={e => updateCourtConfig(idx, { label: e.target.value })}
                  />
                  <span
                    className="flex-1 text-right font-mono text-2xs text-muted-foreground"
                    aria-label={`Court ${idx + 1} session window`}
                  >
                    {form.start} → {form.end}
                  </span>
                  <select
                    tabIndex={-1}
                    aria-label={`Court ${idx + 1} duration`}
                    className="w-44 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                    value={cfg.duration_minutes}
                    onChange={e => updateCourtConfig(idx, { duration_minutes: e.target.value })}
                  >
                    {DURATION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {cfg.duration_minutes === 'custom' && (
                    <input
                      type="number"
                      tabIndex={-1}
                      aria-label={`Court ${idx + 1} custom minutes`}
                      className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                      step="15"
                      min="15"
                      value={cfg.custom_minutes}
                      onChange={e => updateCourtConfig(idx, { custom_minutes: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 justify-end mt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? '...' : 'Create Session'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

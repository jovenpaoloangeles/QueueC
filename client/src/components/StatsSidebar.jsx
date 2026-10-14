import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { createPlayer } from '../api.js'
import { cn, fmtClock, SKILL_TIERS } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'



export default function StatsSidebar({ stats, onPlayerAdded }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', skill_level: 'intermediate' })
  const [saving, setSaving] = useState(false)

  async function addPlayer(e) {
    e.preventDefault()
    setSaving(true)
    await createPlayer(form)
    setForm({ name: '', skill_level: 'intermediate' })
    setSaving(false)
    setShowAdd(false)
    onPlayerAdded?.()
  }

  const tiles = [
    { label: 'Players', value: stats?.player_count ?? 0 },
    { label: 'Matches', value: stats?.match_count ?? 0 },
    { label: 'Avg Wait', value: fmtClock(stats?.avg_wait_seconds) },
    { label: 'Wins', value: stats?.leaderboard?.[0]?.wins ?? 0 },
  ]

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <div className="grid grid-cols-2 gap-3">
        {tiles.map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-muted/40 px-3 py-3">
            <div className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className="mt-1 font-mono text-xl tabular-nums text-foreground">{s.value}</div>
          </div>
        ))}
      </div>

      {stats?.leaderboard?.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            <Trophy className="size-3.5" />
            Wins Today
          </div>
          {stats.leaderboard.map((p, i) => (
            <div
              key={p.player_id}
              className={cn(
                'flex items-center justify-between py-0.5 text-xs',
                i === 0 ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              <span>{i + 1}. {p.name}</span>
              <span className="font-mono tabular-nums">{p.wins}W</span>
            </div>
          ))}
        </div>
      )}

      <div>
        <Button variant="outline" size="xs" onClick={() => setShowAdd(v => !v)}>
          + Add Player
        </Button>

        {showAdd && (
          <form onSubmit={addPlayer} className="mt-3">
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel htmlFor="add-player-name">Name</FieldLabel>
                <Input
                  id="add-player-name"
                  placeholder="Name"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({...f, name: e.target.value}))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="add-player-skill">Skill</FieldLabel>
                <Select value={form.skill_level} onValueChange={v => setForm(f => ({...f, skill_level: v}))}>
                  <SelectTrigger id="add-player-skill" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SKILL_TIERS.map(s => (
                      <SelectItem key={s} value={s}>{s.replace('_',' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Button type="submit" size="xs" disabled={saving}>
                {saving ? '...' : 'Add'}
              </Button>
            </FieldGroup>
          </form>
        )}
      </div>
    </div>
  )
}
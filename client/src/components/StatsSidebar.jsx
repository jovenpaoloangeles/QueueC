import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { createPlayer } from '../api.js'
import { cn, fmtClock, SKILL_TIERS } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/Toast'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'



export default function StatsSidebar({ stats, onPlayerAdded }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', skill_level: 'intermediate' })
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  async function addPlayer(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await createPlayer(form)
      setForm({ name: '', skill_level: 'intermediate' })
      setShowAdd(false)
      onPlayerAdded?.()
    } catch (err) {
      toast(err?.data?.error ?? 'Could not add player', 'error')
    } finally {
      setSaving(false)
    }
  }

  const board = stats?.leaderboard ?? []
  const tiles = [
    { label: 'Players', value: stats?.player_count ?? 0 },
    { label: 'Matches', value: stats?.match_count ?? 0 },
    { label: 'Avg Wait', value: fmtClock(stats?.avg_wait_seconds) },
    { label: 'New Shuttles', value: stats?.shuttles?.new ?? 0 },
    { label: 'Used Shuttles', value: stats?.shuttles?.used ?? 0 },
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

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          <Trophy className="size-3.5" />
          Leaderboard
        </div>
        {board.length === 0 ? (
          <div data-testid="leaderboard-empty" className="text-xs text-muted-foreground">No games yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table data-testid="leaderboard-table" className="w-full text-xs">
              <thead>
                <tr className="text-2xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-1 pr-1 text-left font-medium">Rank</th>
                  <th className="py-1 pr-1 text-left font-medium">Player</th>
                  <th className="py-1 pr-1 text-right font-medium">GP</th>
                  <th className="py-1 pr-1 text-right font-medium">W/L</th>
                  <th className="py-1 pr-1 text-right font-medium">Win %</th>
                  <th className="py-1 text-right font-medium">+/-</th>
                </tr>
              </thead>
              <tbody>
                {board.map((p, i) => {
                  const d = p.point_diff ?? 0
                  return (
                    <tr key={p.player_id} data-testid="leaderboard-row" className={i === 0 ? 'text-foreground' : 'text-muted-foreground'}>
                      <td className="py-1 pr-1"><span data-testid="leaderboard-rank">{i + 1}</span></td>
                      <td className="py-1 pr-1">
                        <span data-testid="leaderboard-name">{p.name}</span>{' '}
                        <span className="text-2xs text-muted-foreground">{p.wins}W</span>
                      </td>
                      <td className="py-1 pr-1 text-right font-mono tabular-nums">{p.games}</td>
                      <td className="py-1 pr-1 text-right font-mono tabular-nums">{`${p.wins}/${p.losses}`}</td>
                      <td className="py-1 pr-1 text-right font-mono tabular-nums">{`${Math.round(p.win_rate ?? 0)}%`}</td>
                      <td className={cn('py-1 text-right font-mono tabular-nums', d > 0 ? 'text-emerald-500' : d < 0 ? 'text-red-500' : 'text-muted-foreground')}>
                        {d > 0 ? `+${d}` : `${d}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
import { useState } from 'react'
import { createPlayer } from '../api.js'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const SKILL_LEVELS = ['newbie', 'beginner', 'intermediate', 'upper_intermediate', 'advanced']

function fmtWait(s) {
  if (!s) return '0m'
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`
}

function StatCell({ label, value, valueClass }) {
  return (
    <Card>
      <CardContent className="p-2 text-center">
        <div className="text-[7px] text-muted-foreground/30 uppercase tracking-widest">{label}</div>
        <div className={`text-lg font-bold leading-tight ${valueClass ?? 'text-foreground'}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

export default function StatsSidebar({ stats }) {
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
  }

  return (
    <div className="p-2 text-[10px] flex flex-col gap-1">
      <div className="text-[7px] text-muted-foreground/20 uppercase tracking-widest mb-0.5">Session</div>

      <StatCell label="Players" value={stats?.player_count ?? 0} />
      <StatCell label="Matches" value={stats?.match_count ?? 0} />
      <StatCell label="Avg Wait" value={fmtWait(stats?.avg_wait_seconds)} valueClass="text-yellow-400" />

      {stats?.leaderboard?.length > 0 && (
        <Card>
          <CardContent className="p-2">
            <div className="text-[7px] text-muted-foreground/20 uppercase tracking-widest mb-1">Wins Today</div>
            {stats.leaderboard.map((p, i) => (
              <div key={p.player_id} className={`text-[9px] mb-0.5 ${i === 0 ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                {['🥇','🥈','🥉','4.','5.'][i]} {p.name} · {p.wins}W
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Button
        variant="outline"
        size="xs"
        className="mt-auto"
        onClick={() => setShowAdd(v => !v)}
      >
        + Add Player
      </Button>

      {showAdd && (
        <form onSubmit={addPlayer} className="flex flex-col gap-1.5">
          <div className="flex flex-col gap-1">
            <Label className="text-[9px]">Name</Label>
            <Input
              placeholder="Name"
              required
              value={form.name}
              onChange={e => setForm(f => ({...f, name: e.target.value}))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[9px]">Skill</Label>
            <Select value={form.skill_level} onValueChange={v => setForm(f => ({...f, skill_level: v}))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SKILL_LEVELS.map(s => (
                  <SelectItem key={s} value={s}>{s.replace('_',' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" size="xs" disabled={saving}>
            {saving ? '...' : 'Add'}
          </Button>
        </form>
      )}
    </div>
  )
}

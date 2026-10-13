import { useState } from 'react'
import { endMatch } from '../api.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function EndMatchModal({ match, onClose }) {
  const [scores, setScores] = useState({ team1: match.team1_score ?? 0, team2: match.team2_score ?? 0 })
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    await endMatch(match.id, { team1_score: Number(scores.team1), team2_score: Number(scores.team2) })
    onClose()
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>End Match — Court {match.court_number}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-end gap-3 justify-center">
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xs uppercase tracking-wider text-muted-foreground">Team 1</span>
              <Input
                type="number" min="0" max="99"
                value={scores.team1}
                onChange={e => setScores(s => ({...s, team1: e.target.value}))}
                className="w-24 h-12 text-2xl font-mono tabular-nums text-center"
              />
            </div>
            <span className="pb-3 text-muted-foreground/40">–</span>
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xs uppercase tracking-wider text-muted-foreground">Team 2</span>
              <Input
                type="number" min="0" max="99"
                value={scores.team2}
                onChange={e => setScores(s => ({...s, team2: e.target.value}))}
                className="w-24 h-12 text-2xl font-mono tabular-nums text-center"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? '...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

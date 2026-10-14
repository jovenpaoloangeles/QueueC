import { useState } from 'react'
import { endMatch } from '../api.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { useToast } from '@/components/Toast'
import { cn } from '@/lib/utils'

/** Step 2 of the End Match flow: final score, shuttle usage and match rating. */
export default function EndMatchModal({ match, onClose }) {
  const [scores, setScores] = useState({ team1: match.team1_score ?? 0, team2: match.team2_score ?? 0 })
  const [shuttles, setShuttles] = useState({
    newShuttles: match.new_shuttles ?? 0,
    usedShuttles: match.used_shuttles ?? 0,
  })
  const [rating, setRating] = useState(5)
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await endMatch(match.id, {
        team1_score: Number(scores.team1),
        team2_score: Number(scores.team2),
        new_shuttles: Number(shuttles.newShuttles),
        used_shuttles: Number(shuttles.usedShuttles),
        rating,
      })
      onClose()
    } catch (err) {
      toast(err?.data?.error ?? 'Could not end match', 'error')
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>End Match — Court {match.court_number}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <div className="flex items-end gap-3 justify-center">
              <Field orientation="horizontal" className="w-auto flex-col items-center gap-1">
                <FieldLabel htmlFor="end-match-team1" className="text-2xs uppercase tracking-wider text-muted-foreground">
                  Team 1
                </FieldLabel>
                <Input
                  id="end-match-team1"
                  autoFocus
                  type="number" min="0" max="99"
                  value={scores.team1}
                  onChange={e => setScores(s => ({...s, team1: e.target.value}))}
                  className="w-24 h-12 text-2xl font-mono tabular-nums text-center"
                />
              </Field>
              <span className="pb-3 text-muted-foreground/40">–</span>
              <Field orientation="horizontal" className="w-auto flex-col items-center gap-1">
                <FieldLabel htmlFor="end-match-team2" className="text-2xs uppercase tracking-wider text-muted-foreground">
                  Team 2
                </FieldLabel>
                <Input
                  id="end-match-team2"
                  type="number" min="0" max="99"
                  value={scores.team2}
                  onChange={e => setScores(s => ({...s, team2: e.target.value}))}
                  className="w-24 h-12 text-2xl font-mono tabular-nums text-center"
                />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel className="text-2xs uppercase tracking-wider text-muted-foreground">Shuttle Usage</FieldLabel>
            <div className="flex gap-3">
              <Field className="flex-1">
                <FieldLabel htmlFor="end-match-new" className="text-2xs text-muted-foreground">New Shuttles</FieldLabel>
                <Input
                  id="end-match-new"
                  data-testid="final-new"
                  type="number" min="0"
                  value={shuttles.newShuttles}
                  onChange={e => setShuttles(s => ({...s, newShuttles: e.target.value}))}
                  className="h-9 font-mono tabular-nums"
                />
              </Field>
              <Field className="flex-1">
                <FieldLabel htmlFor="end-match-used" className="text-2xs text-muted-foreground">Used Shuttles</FieldLabel>
                <Input
                  id="end-match-used"
                  data-testid="final-used"
                  type="number" min="0"
                  value={shuttles.usedShuttles}
                  onChange={e => setShuttles(s => ({...s, usedShuttles: e.target.value}))}
                  className="h-9 font-mono tabular-nums"
                />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel className="text-2xs uppercase tracking-wider text-muted-foreground">
              Match Quality Rating (1-5)
            </FieldLabel>
            <div className="flex items-center gap-1" data-rating={rating} data-testid="rating-row">
              {[1, 2, 3, 4, 5].map(i => (
                <button
                  key={i}
                  type="button"
                  data-testid={`rating-star-${i}`}
                  aria-label={`${i} star${i > 1 ? 's' : ''}`}
                  aria-pressed={rating === i}
                  onClick={() => setRating(i)}
                  className={cn(
                    'px-0.5 text-xl leading-none transition-colors',
                    i <= rating ? 'text-amber-400' : 'text-muted-foreground/40 hover:text-amber-300'
                  )}
                >
                  ★
                </button>
              ))}
            </div>
          </FieldGroup>

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

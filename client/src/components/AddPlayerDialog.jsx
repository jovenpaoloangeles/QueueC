import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/Toast'
import { getPlayers } from '../api.js'
import PlayerSearchAdd from './PlayerSearchAdd.jsx'

// Live-session "Add Player" dialog: same search-and-add combobox as setup,
// wrapped for the header button. Queue/stats arrive via SSE after check-in.
export default function AddPlayerDialog({ session, queue, onClose, onPlayersChanged }) {
  const toast = useToast()
  const [players, setPlayers] = useState([])
  const [fetchError, setFetchError] = useState(false)

  const loadPlayers = useCallback(
    () => getPlayers()
      .then(d => { setPlayers(d.players); setFetchError(false) })
      .catch(() => setFetchError(true)),
    []
  )

  useEffect(() => { loadPlayers() }, [loadPlayers])

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="add-player-dialog">
        <DialogHeader>
          <DialogTitle>Add Player to Session</DialogTitle>
        </DialogHeader>
        {fetchError && (
          <div className="flex items-center gap-2" data-testid="players-fetch-error">
            <span className="text-xs text-muted-foreground">Couldn&apos;t load players.</span>
            <Button variant="outline" size="xs" onClick={loadPlayers}>Retry</Button>
          </div>
        )}
        <PlayerSearchAdd
          session={session}
          queue={queue}
          players={players}
          onPlayersChanged={() => {
            loadPlayers()
            onPlayersChanged?.()
          }}
          onCheckedIn={p => {
            toast(`Checked in: ${p.name}`, 'success')
            onClose()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

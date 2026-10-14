import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/Toast'
import { getPlayers } from '../api.js'
import PlayerSearchAdd from './PlayerSearchAdd.jsx'

// Live-session "Add Player" dialog: same search-and-add combobox as setup,
// wrapped for the header button. Queue/stats arrive via SSE after check-in.
export default function AddPlayerDialog({ session, queue, onClose }) {
  const toast = useToast()
  const [players, setPlayers] = useState([])

  const loadPlayers = useCallback(
    () => getPlayers().then(d => setPlayers(d.players)).catch(() => {}),
    []
  )

  useEffect(() => { loadPlayers() }, [loadPlayers])

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="add-player-dialog">
        <DialogHeader>
          <DialogTitle>Add Player to Session</DialogTitle>
        </DialogHeader>
        <PlayerSearchAdd
          session={session}
          queue={queue}
          players={players}
          onPlayersChanged={loadPlayers}
          onCheckedIn={p => {
            toast(`Checked in: ${p.name}`, 'success')
            onClose()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

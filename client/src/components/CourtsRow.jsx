import CourtCard from './CourtCard.jsx'

export default function CourtsRow({ session, activeMatches, queue, playSeconds, selection, onStartMatch }) {
  const courts = Array.from({ length: session.court_count }, (_, i) => i + 1)
  const canStart = selection?.length === 2 || selection?.length === 4

  return (
    <div className="flex gap-2 p-3 border-b border-border flex-wrap">
      {courts.map(n => (
        <CourtCard
          key={n}
          courtNumber={n}
          match={activeMatches.find(m => m.court_number === n) ?? null}
          queue={queue}
          playSeconds={playSeconds}
          canStart={canStart}
          onStartClick={courtNum => onStartMatch(courtNum, selection)}
        />
      ))}
    </div>
  )
}

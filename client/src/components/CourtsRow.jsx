import CourtCard from './CourtCard.jsx'

export default function CourtsRow({ session, activeMatches, queue, playSeconds, selection, onStartMatch }) {
  const courts = Array.from({ length: session.court_count }, (_, i) => i + 1)
  const canStart = selection?.length === 2 || selection?.length === 4

  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #1e293b', flexWrap: 'wrap' }}>
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

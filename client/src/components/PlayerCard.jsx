const SKILL_COLORS = {
  newbie: ['#1c1917', '#a8a29e'],
  beginner: ['#164e63', '#67e8f9'],
  intermediate: ['#312e81', '#a5b4fc'],
  upper_intermediate: ['#1a2e05', '#86efac'],
  advanced: ['#064e3b', '#6ee7b7'],
}

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = s % 60
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

export default function PlayerCard({ entry, waitSecs, selectionIndex, onClick }) {
  const isSelected = selectionIndex !== undefined && selectionIndex !== -1
  const [bg, color] = SKILL_COLORS[entry.skill_level] ?? SKILL_COLORS.intermediate

  return (
    <div
      onClick={onClick}
      style={{
        background: isSelected ? '#0c1a2e' : '#0f172a',
        border: `${isSelected ? 2 : 1}px solid ${isSelected ? '#1d4ed8' : '#1e293b'}`,
        borderRadius: 4,
        padding: '6px 8px',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        userSelect: 'none',
        transition: 'border-color 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {isSelected && (
          <span style={{ background: '#1d4ed8', color: '#fff', fontSize: 7, width: 14, height: 14, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
            {selectionIndex + 1}
          </span>
        )}
        <span style={{ color: isSelected ? '#bfdbfe' : '#94a3b8', fontSize: 11, fontWeight: isSelected ? 600 : 400 }}>
          {entry.name}
        </span>
        <span style={{ background: bg, color, fontSize: 7, padding: '0 3px', borderRadius: 2 }}>
          {entry.skill_level.replace('_', ' ')}
        </span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ color: '#fbbf24', fontSize: 9 }}>⏳ {fmtTime(waitSecs ?? 0)}</div>
        <div style={{ color: '#334155', fontSize: 8 }}>🏸 {Math.floor((entry.total_seconds_played ?? 0) / 60)}m</div>
      </div>
    </div>
  )
}

import { Trophy } from 'lucide-react'
import { cn, fmtClock } from '@/lib/utils'

export default function StatsSidebar({ stats }) {
  const board = stats?.leaderboard ?? []
  const tiles = [
    { label: 'Players', value: stats?.player_count ?? 0 },
    { label: 'Matches', value: stats?.match_count ?? 0 },
    { label: 'Avg Wait', value: fmtClock(stats?.avg_wait_seconds) },
    { label: 'New Shuttles', value: stats?.shuttles?.new ?? 0 },
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
                  <th scope="col" className="py-1 pr-1 text-left font-medium">Rank</th>
                  <th scope="col" className="py-1 pr-1 text-left font-medium">Player</th>
                  <th scope="col" className="py-1 pr-1 text-right font-medium">GP</th>
                  <th scope="col" className="py-1 pr-1 text-right font-medium">W/L</th>
                  <th scope="col" className="py-1 pr-1 text-right font-medium">Win %</th>
                  <th scope="col" className="py-1 text-right font-medium">+/-</th>
                </tr>
              </thead>
              <tbody>
                {board.map((p, i) => {
                  const d = p.point_diff ?? 0
                  return (
                    <tr key={p.player_id} data-testid="leaderboard-row" className={i === 0 ? 'text-foreground' : 'text-muted-foreground'}>
                      <td className="py-1 pr-1"><span data-testid="leaderboard-rank">{i + 1}</span></td>
                      <td className="py-1 pr-1">
                        <span data-testid="leaderboard-name" title={p.name} className="inline-block max-w-[7rem] truncate align-bottom">{p.name}</span>{' '}
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
    </div>
  )
}

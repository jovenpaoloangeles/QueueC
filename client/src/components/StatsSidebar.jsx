import { cn, fmtClock } from '@/lib/utils'

// redesign-draft sidebar: stats card (3-up mono figures + shuttle row) above the
// leaderboard card. Value/label order and paddings mirror .stat/.shuttle-row/.lb.
export default function StatsSidebar({ stats }) {
  const board = stats?.leaderboard ?? []
  const tiles = [
    { label: 'Players', value: stats?.player_count ?? 0 },
    { label: 'Matches', value: stats?.match_count ?? 0 },
    { label: 'Avg Wait', value: fmtClock(stats?.avg_wait_seconds) },
  ]

  return (
    <div className="flex flex-col gap-3.5 px-4 py-5">
      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Session numbers">
        <div className="grid grid-cols-3 divide-x divide-border pb-2 pt-2.5">
          {tiles.map(s => (
            <div key={s.label} className="px-4 py-2.5">
              <div className="font-mono text-[21px] font-bold leading-none tracking-[-0.02em] tabular-nums text-foreground">{s.value}</div>
              <div className="mt-px text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2.5 border-t border-border px-[18px] pb-4 pt-3">
          <span className="text-[12.5px] text-muted-foreground">New Shuttles</span>
          <span className="ml-auto font-mono text-[13px] font-bold tabular-nums text-foreground">{stats?.shuttles?.new ?? 0}</span>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Leaderboard">
        <h2 className="px-[18px] pb-1.5 pt-3.5 text-[15px] font-bold tracking-tight text-foreground">Leaderboard</h2>
        <div className="px-2 pb-3">
          {board.length === 0 ? (
            <div data-testid="leaderboard-empty" className="px-2 pb-1 text-xs text-muted-foreground">No games yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table data-testid="leaderboard-table" className="w-full border-collapse">
                <thead>
                  <tr className="text-[11px] tracking-[0.03em] text-muted-foreground">
                    <th scope="col" className="pb-[7px] pl-2 pr-1 pt-1.5 text-left font-semibold">Rank</th>
                    <th scope="col" className="pb-[7px] pr-1 pt-1.5 text-left font-semibold">Player</th>
                    <th scope="col" className="pb-[7px] pr-1 pt-1.5 text-right font-semibold">GP</th>
                    <th scope="col" className="pb-[7px] pr-1 pt-1.5 text-right font-semibold">W/L</th>
                    <th scope="col" className="pb-[7px] pr-1 pt-1.5 text-right font-semibold">Win %</th>
                    <th scope="col" className="pb-[7px] pt-1.5 text-right font-semibold">+/-</th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((p, i) => {
                    const d = p.point_diff ?? 0
                    return (
                      <tr key={p.player_id} data-testid="leaderboard-row" className={cn('border-t border-border first:border-t-0', i === 0 && 'bg-wash-green')}>
                        <td className="py-1.5 pl-2 pr-1 text-left">
                          <span data-testid="leaderboard-rank" className={cn('font-mono text-xs tabular-nums', i < 3 ? 'font-bold text-green-deep' : 'font-semibold text-muted-foreground')}>{i + 1}</span>
                        </td>
                        <td className="py-1.5 pr-1 text-left">
                          <span data-testid="leaderboard-name" title={p.name} className="inline-block max-w-[7rem] truncate align-middle text-[13px] font-semibold text-foreground">{p.name}</span>{' '}
                          <span className="rounded-full bg-wash-green px-1.5 py-0.5 text-[10px] font-semibold leading-none text-green-deep">{p.wins}W</span>
                        </td>
                        <td className="py-1.5 pr-1 text-right font-mono text-xs font-semibold tabular-nums text-foreground/80">{p.games}</td>
                        <td className="py-1.5 pr-1 text-right font-mono text-xs font-semibold tabular-nums text-foreground/80">{`${p.wins}/${p.losses}`}</td>
                        <td className="py-1.5 pr-1 text-right font-mono text-xs font-semibold tabular-nums text-foreground/80">{`${Math.round(p.win_rate ?? 0)}%`}</td>
                        <td className={cn('py-1.5 text-right font-mono text-xs font-bold tabular-nums', d > 0 ? 'text-green-deep' : d < 0 ? 'text-destructive' : 'text-muted-foreground')}>
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
      </section>
    </div>
  )
}

import { useEffect, useState } from "react";
import { getLeaderboard, updateShuttles } from "@/api";
import { Button } from "@/components/ui/button";
import { cn, fmtClock } from "@/lib/utils";
import { useToast } from "./Toast.jsx";

// v1.4 leaderboard windows: session comes with stats; month/all-time fetch
// GET /leaderboard?since= (local month start / 0), refetched on every stats push.
const WINDOWS = [
  { id: "session", label: "Session" },
  { id: "month", label: "Month" },
  { id: "all", label: "All-time" },
];
const monthStart = () => {
  const d = new Date();
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000);
};

// redesign-draft sidebar: stats card (3-up mono figures + shuttle row) above the
// leaderboard card. Value/label order and paddings mirror .stat/.shuttle-row/.lb.
export default function StatsSidebar({ stats, session }) {
  const toast = useToast();
  const [win, setWin] = useState("session");
  const [windowBoard, setWindowBoard] = useState(null);
  useEffect(() => {
    if (win === "session" || !stats) return;
    let cancelled = false;
    getLeaderboard(win === "month" ? monthStart() : 0)
      .then((d) => !cancelled && setWindowBoard(d.leaderboard))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [win, stats]);
  const board = (win === "session" ? stats?.leaderboard : windowBoard) ?? [];
  const addShuttle = async () => {
    try {
      await updateShuttles(session.id, 1);
    } catch (err) {
      toast(err?.data?.error ?? "Could not add shuttle", "error");
    }
  };
  const tiles = [
    { label: "Players", value: stats?.player_count ?? 0 },
    { label: "Matches", value: stats?.match_count ?? 0 },
    { label: "Avg Wait", value: fmtClock(stats?.avg_wait_seconds) },
  ];

  return (
    <div className="flex flex-col gap-3.5 px-4 py-5">
      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Session numbers">
        <div className="grid grid-cols-3 divide-x divide-border pb-2 pt-2.5">
          {tiles.map((s) => (
            <div key={s.label} className="px-4 py-2.5">
              <div className="font-mono text-[21px] font-bold leading-none tracking-[-0.02em] tabular-nums text-foreground">
                {s.value}
              </div>
              <div className="mt-px text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2.5 border-t border-border px-[18px] pb-4 pt-3">
          <span className="text-[12.5px] text-muted-foreground">
            Shuttles used{" "}
            <b
              className="font-mono text-[13px] font-bold tabular-nums text-foreground"
              data-testid="shuttles-used"
            >
              {stats?.shuttles?.total ?? 0}
            </b>
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto rounded-full"
            data-testid="shuttle-add"
            disabled={!session}
            onClick={addShuttle}
          >
            + New shuttle
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Leaderboard">
        <div className="flex items-center justify-between gap-2 px-[18px] pb-1.5 pt-3.5">
          <h2 className="text-[15px] font-bold tracking-tight text-foreground">Leaderboard</h2>
          <div className="flex items-center rounded-[9px] bg-secondary p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                data-testid={`leaderboard-window-${w.id}`}
                aria-pressed={win === w.id}
                onClick={() => {
                  setWindowBoard(null);
                  setWin(w.id);
                }}
                className={cn(
                  "rounded-[7px] px-2 py-1 text-[11px] transition-colors duration-150",
                  win === w.id
                    ? "bg-card font-semibold text-foreground shadow-sm"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-2 pb-3">
          {board.length === 0 ? (
            <div data-testid="leaderboard-empty" className="px-2 pb-1 text-xs text-muted-foreground">
              No games yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table data-testid="leaderboard-table" className="w-full border-collapse">
                <thead>
                  <tr className="text-[11px] tracking-[0.03em] text-muted-foreground">
                    <th scope="col" className="pb-[7px] pl-2 pr-1 pt-1.5 text-left font-semibold">
                      Rank
                    </th>
                    <th scope="col" className="pb-[7px] pr-1 pt-1.5 text-left font-semibold">
                      Player
                    </th>
                    <th scope="col" className="pb-[7px] pr-1 pt-1.5 text-right font-semibold">
                      GP
                    </th>
                    <th scope="col" className="pb-[7px] pr-1 pt-1.5 text-right font-semibold">
                      W/L
                    </th>
                    <th scope="col" className="pb-[7px] pr-1 pt-1.5 text-right font-semibold">
                      Win %
                    </th>
                    <th scope="col" className="pb-[7px] pt-1.5 text-right font-semibold">
                      +/-
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((p, i) => {
                    const d = p.point_diff ?? 0;
                    return (
                      <tr
                        key={p.player_id}
                        data-testid="leaderboard-row"
                        className={cn("border-t border-border first:border-t-0", i === 0 && "bg-wash-green")}
                      >
                        <td className="py-1.5 pl-2 pr-1 text-left">
                          <span
                            data-testid="leaderboard-rank"
                            className={cn(
                              "font-mono text-xs tabular-nums",
                              i < 3 ? "font-bold text-green-deep" : "font-semibold text-muted-foreground",
                            )}
                          >
                            {i + 1}
                          </span>
                        </td>
                        <td className="py-1.5 pr-1 text-left">
                          <span
                            data-testid="leaderboard-name"
                            title={p.name}
                            className="inline-block max-w-[7rem] truncate align-middle text-[13px] font-semibold text-foreground"
                          >
                            {p.name}
                          </span>{" "}
                          <span className="rounded-full bg-wash-green px-1.5 py-0.5 text-[10px] font-semibold leading-none text-green-deep">
                            {p.wins}W
                          </span>
                        </td>
                        <td className="py-1.5 pr-1 text-right font-mono text-xs font-semibold tabular-nums text-foreground/80">
                          {p.played}
                        </td>
                        <td className="py-1.5 pr-1 text-right font-mono text-xs font-semibold tabular-nums text-foreground/80">{`${p.wins}/${p.losses}`}</td>
                        <td className="py-1.5 pr-1 text-right font-mono text-xs font-semibold tabular-nums text-foreground/80">{`${Math.round(p.win_rate ?? 0)}%`}</td>
                        <td
                          className={cn(
                            "py-1.5 text-right font-mono text-xs font-bold tabular-nums",
                            d > 0 ? "text-green-deep" : d < 0 ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {d > 0 ? `+${d}` : `${d}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

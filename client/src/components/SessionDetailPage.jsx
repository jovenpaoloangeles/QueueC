import { useEffect, useState } from "react";
import { abortMatch, addAttendance, getPlayers, getSessionDetail, removeEntry } from "@/api";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CorrectMatchDialog from "./CorrectMatchDialog.jsx";
import HistoryShell from "./HistoryShell.jsx";

// v1.3 session detail: the ended-session view of GET /sessions/:id/detail —
// final leaderboard, games log, shuttle totals, attendance. Live sessions
// refetch on a 10s interval so a just-ended match shows up without a reload.
const fmtTime = (ts) =>
  ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

export default function SessionDetailPage({ id }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(false);
  const [liveTick, setLiveTick] = useState(0);
  // corrections: {match} for the edit dialog; entry id pending remove confirmation
  const [editTarget, setEditTarget] = useState(null);
  const [removeEntryId, setRemoveEntryId] = useState(null);
  const [deleteMatchTarget, setDeleteMatchTarget] = useState(null);
  const [addPlayerId, setAddPlayerId] = useState(null);
  const [players, setPlayers] = useState([]);
  const toast = useToast();

  const refetch = () => setLiveTick((n) => n + 1);

  async function handleDeleteMatch() {
    try {
      await abortMatch(deleteMatchTarget.id);
      toast("Match deleted — stats recomputed", "success");
      setDeleteMatchTarget(null);
      refetch();
    } catch (err) {
      toast(err?.data?.error ?? "Could not delete match", "error");
    }
  }

  async function handleRemoveAttendance(entryId) {
    try {
      await removeEntry(entryId);
      toast("Removed from attendance", "success");
      refetch();
    } catch (err) {
      toast(err?.data?.error ?? "Could not remove entry", "error");
    }
  }

  async function handleAddAttendance(playerId) {
    try {
      await addAttendance(id, playerId);
      toast("Added to attendance", "success");
      refetch();
    } catch (err) {
      toast(err?.data?.error ?? "Could not add player", "error");
    }
  }

  useEffect(() => {
    let cancelled = false;
    getSessionDetail(id)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setLive(d.session.ended_at == null);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id, liveTick]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setLiveTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, [live]);

  // pool for the "add a missed player" select
  useEffect(() => {
    getPlayers()
      .then((d) => setPlayers(d.players))
      .catch(() => {});
  }, []);

  if (error)
    return (
      <HistoryShell title="Session">
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-destructive shadow-card">
          {error}
        </div>
      </HistoryShell>
    );
  if (!detail)
    return (
      <HistoryShell title="Session">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </HistoryShell>
    );

  const { session, leaderboard, games, attendance, shuttles } = detail;
  const availablePlayers = players.filter(
    (p) => !attendance.some((a) => a.player_id === p.id),
  );

  return (
    <HistoryShell title={session.name}>
      <div className="flex flex-col gap-4">
        {/* live badge when the session is still running */}
        {live && (
          <div className="rounded-lg border border-amber/40 bg-wash-amber px-4 py-2 text-[12.5px] font-semibold text-amber">
            Session in progress — this page refreshes every 10s
          </div>
        )}

        {/* final leaderboard — sidebar table idiom */}
        <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Final leaderboard">
          <h2 className="border-b border-border px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Leaderboard
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[12.5px] text-muted-foreground">
                <th className="px-4 py-2 font-medium">Player</th>
                <th className="px-2 py-2 font-medium">W/L</th>
                <th className="px-2 py-2 font-medium">Win %</th>
                <th className="px-2 py-2 font-medium">Pt Diff</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r) => (
                <tr key={r.player_id} data-testid="detail-lb-row" className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <a href={`#/players/${r.player_id}`} className="font-medium text-foreground hover:text-primary">
                      {r.name}
                    </a>
                  </td>
                  <td className="px-2 py-2 font-mono font-bold tabular-nums">
                    {r.wins}/{r.losses}
                  </td>
                  <td className="px-2 py-2 font-mono tabular-nums text-muted-foreground">{r.win_rate}%</td>
                  <td className="px-2 py-2 font-mono tabular-nums text-muted-foreground">
                    {r.point_diff > 0 ? "+" : ""}
                    {r.point_diff}
                  </td>
                </tr>
              ))}
              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No games played.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* games log */}
        <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Games log">
          <h2 className="border-b border-border px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Games
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[12.5px] text-muted-foreground">
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-2 py-2 font-medium">Court</th>
                <th className="px-2 py-2 font-medium">Matchup</th>
                <th className="px-2 py-2 font-medium">Score</th>
                <th className="px-2 py-2 font-medium">Shuttles</th>
                <th className="px-2 py-2 font-medium">Rating</th>
                <th className="px-2 py-2 font-medium" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id} data-testid="detail-game-row" className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-[13px] tabular-nums text-muted-foreground">
                    {fmtTime(g.started_at)}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{g.court_number ?? "—"}</td>
                  <td className="px-2 py-2">
                    {g.team1.map((p) => p.name).join(" & ")} vs {g.team2.map((p) => p.name).join(" & ")}
                  </td>
                  <td className="px-2 py-2 font-mono font-bold tabular-nums">
                    {g.team1_score}–{g.team2_score}
                  </td>
                  <td className="px-2 py-2 font-mono tabular-nums text-muted-foreground">{g.new_shuttles}</td>
                  <td className="px-2 py-2 font-mono tabular-nums text-muted-foreground">{g.rating ?? "—"}</td>
                  <td className="px-2 py-2 text-right">
                    {g.state === "active" && g.ended_at != null && (
                      <span className="inline-flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid="detail-edit-match"
                          onClick={() => setEditTarget(g)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-wash-red hover:text-destructive"
                          onClick={() => setDeleteMatchTarget(g)}
                        >
                          Delete
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {games.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    No games played.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* shuttle totals */}
        <section className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-card" aria-label="Shuttle totals">
          <span className="text-muted-foreground">
            Shuttles <b className="font-mono font-bold text-foreground" data-testid="detail-shuttles">{shuttles.total}</b>
          </span>
          <span className="text-[12.5px] text-muted-foreground">
            ({shuttles.new} new + {shuttles.extra} extra)
          </span>
        </section>

        {/* attendance */}
        <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Attendance">
          <h2 className="border-b border-border px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Attendance
          </h2>
          <ul className="divide-y divide-border">
            {attendance.map((a) => (
              <li key={a.entry_id} data-testid="detail-attendance-row" className="flex items-center justify-between px-4 py-2 text-sm">
                <a href={`#/players/${a.player_id}`} className="font-medium text-foreground hover:text-primary">
                  {a.name}
                  <span className="ml-2 text-[12.5px] text-muted-foreground">{a.status}</span>
                </a>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="attendance-remove"
                  className="text-destructive hover:bg-wash-red hover:text-destructive"
                  onClick={() => setRemoveEntryId(a.entry_id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          {/* add a missed player: everyone in the pool not already checked in */}
          <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
            <select
              data-testid="attendance-add-select"
              aria-label="Add a missed player"
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
              value={addPlayerId ?? ""}
              onChange={(e) => setAddPlayerId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Add a missed player…</option>
              {availablePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
</option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              data-testid="attendance-add-button"
              disabled={!addPlayerId}
              onClick={() => {
                handleAddAttendance(addPlayerId);
                setAddPlayerId(null);
              }}
            >
              Add
            </Button>
          </div>
        </section>
      </div>
      {editTarget && (
        <CorrectMatchDialog
          match={editTarget}
          attendance={attendance}
          onDone={refetch}
          onClose={() => setEditTarget(null)}
        />
      )}
      {removeEntryId != null && (
        <Dialog open onOpenChange={(open) => !open && setRemoveEntryId(null)}>
          <DialogContent className="sm:max-w-xs shadow-lift">
            <DialogHeader>
              <DialogTitle>Remove from attendance?</DialogTitle>
              <DialogDescription>
                A checked-in player who never played can be removed; their stats are untouched.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRemoveEntryId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                data-testid="attendance-remove-confirm"
                onClick={() => {
                  const eid = removeEntryId;
                  setRemoveEntryId(null);
                  handleRemoveAttendance(eid);
                }}
              >
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {deleteMatchTarget && (
        <Dialog open onOpenChange={(open) => !open && setDeleteMatchTarget(null)}>
          <DialogContent className="sm:max-w-xs shadow-lift">
            <DialogHeader>
              <DialogTitle>Delete this match? Stats update immediately.</DialogTitle>
              <DialogDescription>
                The game log row goes away and every ex-player's totals are recomputed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteMatchTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDeleteMatch()}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </HistoryShell>
  );
}

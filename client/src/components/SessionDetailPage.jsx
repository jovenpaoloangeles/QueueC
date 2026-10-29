import { useEffect, useState } from "react";
import {
  abortMatch,
  addAttendance,
  getPlayers,
  getSessionDetail,
  removeEntry,
  setFees,
  setPaid,
} from "@/api";
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
import downloadExport from "@/lib/download";
import { buildRecap, highlightGroups } from "@/lib/recap";
import { cn, fmtClock } from "@/lib/utils";
import CorrectMatchDialog from "./CorrectMatchDialog.jsx";
import HistoryShell from "./HistoryShell.jsx";

// v1.3 session detail: the ended-session view of GET /sessions/:id/detail —
// final leaderboard, games log, shuttle totals, attendance. Live sessions
// refetch on a 10s interval so a just-ended match shows up without a reload.
const fmtTime = (ts) =>
  ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

const peso = (n) => `₱${n.toLocaleString()}`;

// v1.6 payments: fee inputs save on blur (uncontrolled, so the live 10s
// refetch never clobbers a half-typed number); paid toggles save immediately.
function PaymentsSection({ sessionId, payments, onChange }) {
  const toast = useToast();
  const save = (body) =>
    setFees(sessionId, body)
      .then(onChange)
      .catch((err) => toast(err?.data?.error ?? "Could not save fees", "error"));
  const amount = (field) => (e) => {
    const v = Math.max(0, Math.round(Number(e.target.value) || 0));
    if (v !== payments[field]) save({ [field]: v });
  };
  return (
    <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Payments">
      <h2 className="border-b border-border px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        Payments
      </h2>
      <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3 text-sm">
        <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
          Court fee (total)
          <input
            type="number"
            min="0"
            inputMode="numeric"
            data-testid="fee-court"
            defaultValue={payments.court_fee || ""}
            placeholder="0"
            onBlur={amount("court_fee")}
            className="h-8 w-28 rounded-md border border-border bg-card px-2 font-mono text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
          Per shuttle
          <input
            type="number"
            min="0"
            inputMode="numeric"
            data-testid="fee-shuttle"
            defaultValue={payments.shuttle_price || ""}
            placeholder="0"
            onBlur={amount("shuttle_price")}
            className="h-8 w-24 rounded-md border border-border bg-card px-2 font-mono text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
          Split
          <select
            data-testid="fee-split"
            value={payments.split}
            onChange={(e) => save({ fee_split: e.target.value })}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground"
          >
            <option value="equal">Everything evenly</option>
            <option value="per_game">Court evenly, shuttles by games played</option>
          </select>
        </label>
        <span data-testid="fee-collected" className="ml-auto self-center font-mono text-sm tabular-nums">
          {peso(payments.collected)} / {peso(payments.total)} collected
        </span>
      </div>
      <ul className="divide-y divide-border">
        {payments.rows.map((r) => (
          <li
            key={r.entry_id}
            data-testid="payment-row"
            className="flex items-center gap-3 px-4 py-2 text-sm"
          >
            <span className={cn("flex-1 font-medium", r.paid && "text-muted-foreground line-through")}>
              {r.name}
            </span>
            <span className="font-mono tabular-nums">{peso(r.share)}</span>
            <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <input
                type="checkbox"
                data-testid="payment-paid"
                checked={r.paid}
                onChange={(e) =>
                  setPaid(r.entry_id, e.target.checked)
                    .then(onChange)
                    .catch(() => toast("Could not update", "error"))
                }
              />
              Paid
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
  const [recap, setRecap] = useState(null);
  const toast = useToast();

  const refetch = () => setLiveTick((n) => n + 1);

  async function handleDeleteMatch() {
    try {
      await abortMatch(deleteMatchTarget.id, true); // history page: explicit ended-match delete
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: liveTick is a 10s refetch trigger, not a value the effect reads
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

  const { session, leaderboard, games, attendance, shuttles, fairness, highlights, payments } = detail;
  const groups = highlightGroups(highlights);
  const gamesBy = new Map(leaderboard.map((r) => [r.player_id, r.played]));
  const availablePlayers = players.filter((p) => !attendance.some((a) => a.player_id === p.id));

  return (
    <HistoryShell title={session.name}>
      <div className="flex flex-col gap-4">
        {/* live badge when the session is still running */}
        {live && (
          <div className="rounded-lg border border-amber/40 bg-wash-amber px-4 py-2 text-[12.5px] font-semibold text-amber">
            Session in progress — this page refreshes every 10s
          </div>
        )}

        {/* exports */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            data-testid="export-csv"
            onClick={() => downloadExport(`/sessions/${id}/export`)}
          >
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="export-json"
            onClick={() => downloadExport(`/sessions/${id}/export?format=json`)}
          >
            Export JSON
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="share-recap"
            onClick={() => setRecap(buildRecap(detail))}
          >
            Share recap
          </Button>
        </div>

        <PaymentsSection sessionId={id} payments={payments} onChange={refetch} />

        {/* final leaderboard — sidebar table idiom */}
        <section
          className="rounded-lg border border-border bg-card shadow-card"
          aria-label="Final leaderboard"
        >
          <h2 className="border-b border-border px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Leaderboard
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[12.5px] text-muted-foreground">
                <th className="px-4 py-2 font-medium">Player</th>
                <th className="px-2 py-2 font-medium">GP</th>
                <th className="px-2 py-2 font-medium">W/L</th>
                <th className="px-2 py-2 font-medium">Win %</th>
                <th className="px-2 py-2 font-medium">Pt Diff</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r) => (
                <tr
                  key={r.player_id}
                  data-testid="detail-lb-row"
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-2">
                    <a
                      href={`#/players/${r.player_id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {r.name}
                    </a>
                  </td>
                  <td className="px-2 py-2 font-mono tabular-nums text-muted-foreground">{r.played}</td>
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
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No games played.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* v1.4 highlights: one row per type, names as links */}
        {groups.length > 0 && (
          <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Highlights">
            <h2 className="border-b border-border px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Highlights
            </h2>
            <ul className="divide-y divide-border">
              {groups.map((g) => (
                <li key={g.label} data-testid="detail-highlight" className="flex gap-3 px-4 py-2 text-sm">
                  <span className="w-44 shrink-0 text-muted-foreground">{g.label}</span>
                  <span>
                    {g.list.map((h, i) => (
                      <span key={h.player_id}>
                        {i > 0 && ", "}
                        <a
                          href={`#/players/${h.player_id}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {h.name}
                        </a>{" "}
                        <span className="font-mono tabular-nums text-muted-foreground">
                          ({h.game ? `#${h.game}` : h.streak})
                        </span>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* v1.4 fairness: court-time distribution and net wait */}
        <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Fairness">
          <h2 className="border-b border-border px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Fairness
          </h2>
          <div
            data-testid="detail-fairness"
            className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4"
          >
            {[
              ["Fewest games", fairness.games.min],
              ["Median games", fairness.games.median],
              ["Most games", fairness.games.max],
              ["Avg wait", fmtClock(fairness.avg_wait_seconds)],
            ].map(([label, value]) => (
              <div key={label} className="px-4 py-3">
                <div className="text-[12.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="font-mono text-lg font-bold tabular-nums">{value}</div>
              </div>
            ))}
          </div>
          {fairness.most_bumped.length > 0 && (
            <div className="border-t border-border px-4 py-2.5 text-sm">
              <span className="text-[12.5px] text-muted-foreground">Longest waits: </span>
              {fairness.most_bumped.map((p, i) => (
                <span key={p.player_id} data-testid="detail-bumped">
                  {i > 0 && ", "}
                  <a
                    href={`#/players/${p.player_id}`}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {p.name}
                  </a>{" "}
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {fmtClock(p.longest_wait_seconds)}
                  </span>
                </span>
              ))}
            </div>
          )}
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
                  <td className="px-2 py-2 font-mono tabular-nums text-muted-foreground">
                    {g.rating ?? "—"}
                  </td>
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
        <section
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-card"
          aria-label="Shuttle totals"
        >
          <span className="text-muted-foreground">
            Shuttles{" "}
            <b className="font-mono font-bold text-foreground" data-testid="detail-shuttles">
              {shuttles.total}
            </b>
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
              <li
                key={a.entry_id}
                data-testid="detail-attendance-row"
                className="flex items-center justify-between px-4 py-2 text-sm"
              >
                <a
                  href={`#/players/${a.player_id}`}
                  className="font-medium text-foreground hover:text-primary"
                >
                  {a.name}
                  <span className="ml-2 text-[12.5px] text-muted-foreground">
                    {live
                      ? a.status
                      : `${gamesBy.get(a.player_id) ?? 0} game${gamesBy.get(a.player_id) === 1 ? "" : "s"}`}
                  </span>
                </a>
                {/* the server refuses anyone with match history — fix the match instead */}
                {!gamesBy.get(a.player_id) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid="attendance-remove"
                    className="text-destructive hover:bg-wash-red hover:text-destructive"
                    onClick={() => setRemoveEntryId(a.entry_id)}
                  >
                    Remove
                  </Button>
                )}
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
      {recap != null && (
        <Dialog open onOpenChange={(open) => !open && setRecap(null)}>
          <DialogContent className="sm:max-w-sm shadow-lift">
            <DialogHeader>
              <DialogTitle>Session recap</DialogTitle>
              <DialogDescription>Paste it into the group chat.</DialogDescription>
            </DialogHeader>
            <textarea
              readOnly
              data-testid="recap-text"
              aria-label="Recap text"
              value={recap}
              rows={recap.split("\n").length}
              onFocus={(e) => e.target.select()}
              className="w-full resize-none rounded-md border border-border bg-card p-2 font-mono text-[13px]"
            />
            <DialogFooter>
              {navigator.share && (
                <Button variant="ghost" onClick={() => navigator.share({ text: recap }).catch(() => {})}>
                  Share…
                </Button>
              )}
              <Button
                data-testid="recap-copy"
                onClick={() =>
                  // clipboard needs a secure context; plain-http LAN installs select-and-copy by hand
                  navigator.clipboard
                    ?.writeText(recap)
                    .then(() => toast("Recap copied", "success"))
                    .catch(() => toast("Copy failed — select the text and copy it", "error")) ??
                  toast("Select the text and copy it", "error")
                }
              >
                Copy
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
              <Button variant="destructive" onClick={() => handleDeleteMatch()}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </HistoryShell>
  );
}

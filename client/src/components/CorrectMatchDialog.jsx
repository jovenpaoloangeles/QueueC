import { useState } from "react";
import { correctMatch } from "@/api";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// v1.3 correction dialog: edit an ended match's scores, shuttles, rating and
// lineups. Player selects are populated from the session's attendance (queue
// entries — the same ids the API's slot fields take).
export default function CorrectMatchDialog({ match, attendance, onDone, onClose }) {
  const slots = match.format === "singles"
    ? ["team1_p1", "team2_p1"]
    : ["team1_p1", "team1_p2", "team2_p1", "team2_p2"];
  const slotLabel = {
    team1_p1: "Team 1 · P1",
    team1_p2: "Team 1 · P2",
    team2_p1: "Team 2 · P1",
    team2_p2: "Team 2 · P2",
  };
  const seatEntry = (side, idx) => {
    const arr = side === 1 ? match.team1 : match.team2;
    return arr[idx]?.entry_id ?? null;
  };
  const [scores, setScores] = useState({
    team1: match.team1_score ?? 0,
    team2: match.team2_score ?? 0,
  });
  const [shuttles, setShuttles] = useState(match.new_shuttles ?? 1);
  const [rating, setRating] = useState(match.rating ?? 5);
  const [players, setPlayers] = useState(() =>
    Object.fromEntries(slots.map((s, i) => [s, seatEntry(s.startsWith("team1") ? 1 : 2, s === "team1_p2" || s === "team2_p2" ? 1 : 0)])),
  );
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const toInt = (v, min, max) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return min;
    return Math.min(Math.max(n, min), max);
  };

  const seatName = (entryId) => attendance.find((a) => a.entry_id === entryId)?.name ?? "—";

  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await correctMatch(match.id, {
        team1_score: toInt(scores.team1, 0, 99),
        team2_score: toInt(scores.team2, 0, 99),
        new_shuttles: toInt(shuttles, 0, 999),
        rating: toInt(rating, 1, 5),
        players: slots.map((s) => players[s]).filter((v) => v != null),
      });
      onDone();
      onClose();
    } catch (err) {
      toast(err?.data?.error ?? "Could not correct match", "error");
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm shadow-lift">
        <DialogHeader>
          <DialogTitle>Correct match</DialogTitle>
          <DialogDescription>
            Fix scores, shuttles, rating or the lineup. Stats update immediately.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-end gap-3 justify-center">
            <Field className="w-auto flex-col items-center gap-1">
              <FieldLabel htmlFor="correct-team1" className="text-2xs uppercase tracking-wider text-muted-foreground">
                Team 1 · {match.team1.map((p) => p.name).join(" & ")}
              </FieldLabel>
              <Input
                id="correct-team1"
                type="number"
                min="0"
                max="99"
                value={scores.team1}
                onChange={(e) => setScores((s) => ({ ...s, team1: e.target.value }))}
                className="w-20 h-11 rounded-md border-border bg-card text-xl font-mono font-semibold tabular-nums text-center"
              />
            </Field>
            <span className="pb-3 text-muted-foreground/40">–</span>
            <Field className="w-auto flex-col items-center gap-1">
              <FieldLabel htmlFor="correct-team2" className="text-2xs uppercase tracking-wider text-muted-foreground">
                Team 2 · {match.team2.map((p) => p.name).join(" & ")}
              </FieldLabel>
              <Input
                id="correct-team2"
                type="number"
                min="0"
                max="99"
                value={scores.team2}
                onChange={(e) => setScores((s) => ({ ...s, team2: e.target.value }))}
                className="w-20 h-11 rounded-md border-border bg-card text-xl font-mono font-semibold tabular-nums text-center"
              />
            </Field>
          </div>
          <div className="flex gap-3">
            <Field className="flex-1">
              <FieldLabel htmlFor="correct-shuttles" className="text-2xs uppercase tracking-wider text-muted-foreground">
                New shuttles
              </FieldLabel>
              <Input
                id="correct-shuttles"
                type="number"
                min="0"
                max="999"
                value={shuttles}
                onChange={(e) => setShuttles(e.target.value)}
              />
            </Field>
            <Field className="flex-1">
              <FieldLabel htmlFor="correct-rating" className="text-2xs uppercase tracking-wider text-muted-foreground">
                Rating (1–5)
              </FieldLabel>
              <Input
                id="correct-rating"
                type="number"
                min="1"
                max="5"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {slots.map((s) => (
              <Field key={s}>
                <FieldLabel className="text-2xs uppercase tracking-wider text-muted-foreground">
                  {slotLabel[s]}
                </FieldLabel>
                <Select
                  value={players[s] != null ? String(players[s]) : ""}
                  onValueChange={(v) => setPlayers((p) => ({ ...p, [s]: Number(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={seatName(players[s])} />
                  </SelectTrigger>
                  <SelectContent>
                    {attendance.map((a) => (
                      <SelectItem key={a.entry_id} value={String(a.entry_id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" data-testid="correct-match-confirm" disabled={loading}>
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

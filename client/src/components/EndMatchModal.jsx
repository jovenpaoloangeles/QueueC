import { useState } from "react";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { endMatch } from "../api.js";

/** Step 2 of the End Match flow: final score, shuttle usage and match rating. */
export default function EndMatchModal({ match, courtLabel, teamNames, onClose }) {
  const [scores, setScores] = useState({ team1: match.team1_score ?? 0, team2: match.team2_score ?? 0 });
  const [shuttles, setShuttles] = useState({
    newShuttles: match.new_shuttles ?? 1,
  });
  const [rating, setRating] = useState(5);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  // typed values bypass input min/max — clamp here so -5 or a blank field never reach the API
  const toInt = (v, max) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return 0;
    return Math.min(Math.max(n, 0), max);
  };

  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await endMatch(match.id, {
        team1_score: toInt(scores.team1, 99),
        team2_score: toInt(scores.team2, 99),
        new_shuttles: toInt(shuttles.newShuttles, 999),
        rating: toInt(rating, 5),
      });
      onClose();
    } catch (err) {
      toast(err?.data?.error ?? "Could not end match", "error");
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xs shadow-lift">
        <DialogHeader>
          <DialogTitle>End Match — {courtLabel ?? `Court ${match.court_number}`}</DialogTitle>
          <DialogDescription>Record the final score, shuttle usage and a 1-5 rating.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <div className="flex items-end gap-3 justify-center">
              <Field orientation="horizontal" className="w-auto flex-col items-center gap-1">
                <FieldLabel
                  htmlFor="end-match-team1"
                  className="text-2xs uppercase tracking-wider text-muted-foreground"
                >
                  Team 1{teamNames?.team1 ? ` · ${teamNames.team1}` : ""}
                </FieldLabel>
                <Input
                  id="end-match-team1"
                  autoFocus
                  type="number"
                  min="0"
                  max="99"
                  value={scores.team1}
                  onChange={(e) => setScores((s) => ({ ...s, team1: e.target.value }))}
                  className="w-24 h-12 rounded-md border-border bg-card text-2xl font-mono font-semibold tabular-nums text-center"
                />
              </Field>
              <span className="pb-3 text-muted-foreground/40">–</span>
              <Field orientation="horizontal" className="w-auto flex-col items-center gap-1">
                <FieldLabel
                  htmlFor="end-match-team2"
                  className="text-2xs uppercase tracking-wider text-muted-foreground"
                >
                  Team 2{teamNames?.team2 ? ` · ${teamNames.team2}` : ""}
                </FieldLabel>
                <Input
                  id="end-match-team2"
                  type="number"
                  min="0"
                  max="99"
                  value={scores.team2}
                  onChange={(e) => setScores((s) => ({ ...s, team2: e.target.value }))}
                  className="w-24 h-12 rounded-md border-border bg-card text-2xl font-mono font-semibold tabular-nums text-center"
                />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel className="text-2xs uppercase tracking-wider text-muted-foreground">
              Shuttle Usage
            </FieldLabel>
            <Field className="flex-1">
              <FieldLabel htmlFor="end-match-new" className="text-2xs text-muted-foreground">
                New Shuttles
              </FieldLabel>
              <Input
                id="end-match-new"
                data-testid="final-new"
                type="number"
                min="0"
                value={shuttles.newShuttles}
                onChange={(e) => setShuttles((s) => ({ ...s, newShuttles: e.target.value }))}
                className="h-9 rounded-md border-border bg-card font-mono font-semibold tabular-nums"
              />
            </Field>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel className="text-2xs uppercase tracking-wider text-muted-foreground">
              Match Quality Rating (1-5)
            </FieldLabel>
            <div
              role="radiogroup"
              aria-label="Match Quality Rating"
              className="flex items-center gap-1"
              data-rating={rating}
              data-testid="rating-row"
            >
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  data-testid={`rating-star-${i}`}
                  aria-label={`${i} star${i > 1 ? "s" : ""}`}
                  aria-checked={rating === i}
                  tabIndex={rating === i ? 0 : -1}
                  onClick={() => setRating(i)}
                  className={cn(
                    "px-0.5 text-xl leading-none transition-colors duration-150",
                    i <= rating ? "text-amber" : "text-foreground/20 hover:text-amber/60",
                  )}
                >
                  ★
                </button>
              ))}
            </div>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="rounded-full" disabled={loading}>
              {loading ? "..." : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

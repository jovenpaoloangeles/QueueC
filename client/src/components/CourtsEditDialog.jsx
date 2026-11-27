import { useState } from "react";
import { addCourt, deleteCourt, updateCourt } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "./Toast.jsx";

// Live fix-up for a setup mistake: every court's name, open time, closing time
// and on/off, plus add/remove — without ending the session. Times are clock
// times on the session's day; a blank open = open now, a blank close = no
// rental timer.
const pad = (n) => String(n).padStart(2, "0");
function hhmm(ts) {
  if (ts == null) return "";
  const d = new Date(ts * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const rowOf = (c) => ({
  id: c.id,
  label: c.label ?? "",
  opens: hhmm(c.active_from),
  closes: hhmm(c.expires_at),
  enabled: !!c.enabled,
  remove: false,
});

export default function CourtsEditDialog({ session, courts, onClose }) {
  const toast = useToast();
  const [rows, setRows] = useState(() => courts.map(rowOf));
  const [saving, setSaving] = useState(false);
  const patchRow = (i, patch) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // "HH:MM" → epoch seconds on the session's day
  // ponytail: same-day only — a session crossing midnight needs a date on the close time
  const day = new Date(session.started_at != null ? session.started_at * 1000 : Date.now());
  function toTs(v) {
    if (!v) return null;
    const [h, m] = v.split(":").map(Number);
    const d = new Date(day);
    d.setHours(h, m, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }

  const kept = rows.filter((r) => !r.remove);
  const badRow = kept.find((r) => r.opens && r.closes && toTs(r.closes) <= toTs(r.opens));
  const error =
    kept.length === 0
      ? "Keep at least one court"
      : badRow
        ? `${badRow.label || "A court"} closes before it opens`
        : null;

  async function save() {
    if (error || saving) return;
    setSaving(true);
    try {
      for (const [i, r] of rows.entries()) {
        const fields = { label: r.label.trim(), active_from: toTs(r.opens), expires_at: toTs(r.closes) };
        if (r.id == null) {
          if (r.remove) continue;
          const { court } = await addCourt(session.id, {
            ...fields,
            label: fields.label || `Court ${i + 1}`,
          });
          if (!r.enabled) await updateCourt(court.id, { enabled: 0 });
          continue;
        }
        const orig = courts.find((c) => c.id === r.id);
        if (r.remove) {
          await deleteCourt(r.id).catch((err) => {
            throw new Error(
              err?.status === 409
                ? `${orig.label} has games on it — turn it off instead`
                : "Could not remove court",
            );
          });
          continue;
        }
        const was = rowOf(orig);
        const patch = {};
        if (fields.label && fields.label !== orig.label) patch.label = fields.label;
        if (r.opens !== was.opens) patch.active_from = fields.active_from;
        if (r.closes !== was.closes) patch.expires_at = fields.expires_at;
        if (r.enabled !== was.enabled) patch.enabled = r.enabled ? 1 : 0;
        if (Object.keys(patch).length) await updateCourt(r.id, patch);
      }
      toast("Courts updated", "success");
      onClose();
    } catch (err) {
      toast(err?.data?.error ?? err?.message ?? "Could not save courts", "error");
    } finally {
      setSaving(false);
    }
  }

  const cell = "h-8 rounded-md border-border bg-card px-2 text-sm";
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="shadow-lift sm:max-w-xl" data-testid="courts-edit-dialog">
        <DialogHeader>
          <DialogTitle>Edit courts</DialogTitle>
          <DialogDescription>
            Fix names and hours without restarting. Blank “opens” = open now; blank “closes” = no timer. A
            game in progress keeps playing.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_7.75rem_7.75rem_auto_auto] items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Court</span>
            <span>Opens</span>
            <span>Closes</span>
            <span>On</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div
              key={r.id ?? `new-${i}`}
              data-testid="courts-edit-row"
              className={`grid grid-cols-[1fr_7.75rem_7.75rem_auto_auto] items-center gap-2 ${r.remove ? "opacity-40" : ""}`}
            >
              <Input
                aria-label="Court name"
                className={cell}
                value={r.label}
                disabled={r.remove}
                onChange={(e) => patchRow(i, { label: e.target.value })}
              />
              <Input
                type="time"
                aria-label="Opens at"
                data-testid="courts-edit-opens"
                className={cell}
                value={r.opens}
                disabled={r.remove}
                onChange={(e) => patchRow(i, { opens: e.target.value })}
              />
              <Input
                type="time"
                aria-label="Closes at"
                data-testid="courts-edit-closes"
                className={cell}
                value={r.closes}
                disabled={r.remove}
                onChange={(e) => patchRow(i, { closes: e.target.value })}
              />
              <input
                type="checkbox"
                aria-label="Court on"
                data-testid="courts-edit-on"
                className="size-4 accent-primary"
                checked={r.enabled}
                disabled={r.remove}
                onChange={(e) => patchRow(i, { enabled: e.target.checked })}
              />
              <Button
                variant="ghost"
                size="xs"
                data-testid="courts-edit-remove"
                className="rounded-full text-muted-foreground hover:text-destructive"
                onClick={() =>
                  r.id == null
                    ? setRows((rs) => rs.filter((_, idx) => idx !== i))
                    : patchRow(i, { remove: !r.remove })
                }
              >
                {r.remove ? "Keep" : "Remove"}
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            data-testid="courts-edit-add"
            className="self-start rounded-full"
            onClick={() =>
              setRows((rs) => [
                ...rs,
                {
                  id: null,
                  label: `Court ${rs.length + 1}`,
                  opens: "",
                  closes: "",
                  enabled: true,
                  remove: false,
                },
              ])
            }
          >
            + Add court
          </Button>
          {error && (
            <p className="text-xs text-destructive" data-testid="courts-edit-error">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button data-testid="courts-edit-save" disabled={!!error || saving} onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

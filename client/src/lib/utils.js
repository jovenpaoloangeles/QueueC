export { cn } from "cn";

/** Net queue wait in seconds: time since check-in minus time already spent
 *  playing (the server adds total_seconds_played on match end). Rest does not
 *  pause the clock (reversed in R7) — it resets only via played-time accounting. */
export function netWait(now, entry) {
  return Math.max(0, now - (entry.checked_in_at ?? now) - (entry.total_seconds_played ?? 0));
}

/** Duration in seconds → mm:ss. */
export function fmtClock(s) {
  const total = Math.max(0, Math.floor(s ?? 0));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Duration in seconds → h:mm:ss, for clocks that can exceed an hour. */
export function fmtDur(s) {
  const total = Math.max(0, Math.floor(s ?? 0));
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Duration in seconds → whole minutes, for "12m played". */
export function fmtMins(s) {
  return `${Math.floor(Math.max(0, s ?? 0) / 60)}m`;
}

/** Epoch seconds → "8:44 PM" wall clock (draft copy style: rental ends …). */
export function fmtWall(ts) {
  if (ts == null) return "";
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Default session name: `ASTIRISK (15-Oct-2026)` — locale-independent. */
export function fmtSessionName(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  return `ASTIRISK (${dd}-${MONTHS[date.getMonth()]}-${date.getFullYear()})`;
}

// 7-Tier Skill Taxonomy (plus legacy 'advanced' alias)
export const SKILL_TIERS = [
  "newbie",
  "beginner",
  "lower_intermediate",
  "intermediate",
  "upper_intermediate",
  "expert",
  "professional",
];

export const SKILL_WEIGHTS = {
  newbie: 100,
  beginner: 200,
  lower_intermediate: 300,
  intermediate: 400,
  upper_intermediate: 500,
  expert: 600,
  advanced: 600,
  professional: 700,
};

// skill level → redesign-draft tier badge class (index.css .tier recipe)
export const TIER_CLASS = {
  newbie: "t-newbie",
  beginner: "t-beginner",
  lower_intermediate: "t-lower",
  intermediate: "t-int",
  upper_intermediate: "t-upper",
  expert: "t-expert",
  advanced: "t-expert", // legacy alias
  professional: "t-expert",
};

const avgSkill = (team) => {
  const ws = team.map((p) => SKILL_WEIGHTS[p.skill_level]).filter((w) => w != null);
  return ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : null;
};

/** Average-skill gap between the two sides → human hint. m = { team1:[{skill_level}], team2:[...] }.
 *  Thresholds: ≤50 Even · ≤150 Slight edge · else Lopsided. null when skill data is missing. */
/** 'upper_intermediate' → 'Upper Intermediate'. Null-safe for missing skill data. */
export function titleCaseSkill(level) {
  return (level ?? "")
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Draft-tier labels (queuec-live-redesign-draft.html chips): 'Int', 'Upper Int',
 *  'Lower Int' — full titleCaseSkill doesn't fit beside a name in a court chip. */
export function shortSkill(level) {
  return (
    {
      newbie: "New",
      beginner: "Beg",
      lower_intermediate: "Lower Int",
      intermediate: "Int",
      upper_intermediate: "Upper Int",
      expert: "Expert",
      advanced: "Expert",
      professional: "Expert",
    }[level] ?? titleCaseSkill(level)
  );
}

export function balanceHint(m) {
  const a = avgSkill(m.team1),
    b = avgSkill(m.team2);
  if (a == null || b == null) return null;
  const d = Math.abs(a - b);
  if (d <= 50) return { label: "Even", tone: "text-green-deep" };
  if (d <= 150) return { label: "Slight edge", tone: "text-amber" };
  return { label: "Lopsided", tone: "text-destructive" };
}

/** A court with no live match and an open rental window right now. */
export function freeCourts(courts, activeMatches, now) {
  const busy = new Set((activeMatches ?? []).map((m) => m.court_number).filter((v) => v != null));
  return (courts ?? []).filter(
    (c) =>
      c.enabled &&
      (c.active_from == null || now >= c.active_from) &&
      (c.expires_at == null || now < c.expires_at) &&
      (c.active_until == null || now < c.active_until) &&
      !busy.has(c.id),
  );
}

// ponytail: fixed 2-minute threshold; per-venue config only if ever asked
export const IDLE_NUDGE_AFTER_SEC = 120;

/** Test/e2e override for the idle threshold (e2e sets window.__IDLE_NUDGE_SEC__). */
export function idleNudgeSec() {
  return (typeof window !== "undefined" && window.__IDLE_NUDGE_SEC__) || IDLE_NUDGE_AFTER_SEC;
}

/** Idle-court nudge: a free court going to waste. "staged" (slate waiting on
 *  deck) beats "waiting" (≥4 players queued with nothing slated); null = quiet. */
export function nudgeKind(courts, activeMatches, slateCount, waitingCount, now) {
  if (freeCourts(courts, activeMatches, now).length === 0) return null;
  if (slateCount > 0) return { kind: "staged" };
  if (waitingCount >= 4) return { kind: "waiting" };
  return null;
}

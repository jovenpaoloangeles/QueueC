# TODO

## Done
- [x] Single-screen session setup — `ASTIRISK (DD-Mmm-YYYY)` name default, whole-hour start select (06:00–23:00), per-court label + hours (0.5–12), alphabetical pool with select-all/tier filter, double-click inline name/skill edit, one Start Session button (create → check in → start); create-session modal flow removed
- [x] Court rental expiry — no Open toggle; expired court (idle or mid-match) offers **Extend Court (+1hr)?**, the live match keeps running under a Last Game badge, server extends from max(expires_at, now)
- [x] Resting tray drag-and-drop both ways (plus Rest/Wake buttons, shift-click)
- [x] Start confirmation — Start Match / Start Singles / 4th-slot drop on an idle court open a dialog; header Smart Match dry-runs a plan (`{dry_run:true}` → `{plan}`, executes exactly it, 409 on stale queue); slating onto an occupied court is immediate
- [x] On Deck always mounted — accent panel, numbered cards, skill-balance label, next-free-court ETA, manual builder (＋ Build lineup / Use selection / Add to On Deck), Smart add, multiple slates up to SLATE_CAP=3 counted across existing, ↑/↓ reorder; per-court 'Next match lineup' matrix kept
- [x] Slate / On Deck matches with auto-promotion; slate to next free court
- [x] Smart Match (`POST /sessions/:id/automatch`)
- [x] Shuttle counters; two-step end match with 1–5 star rating
- [x] Queue tabs (All/Wait/Rest), fairness ordering, rest/wake rules
- [x] Leaderboard (win rate, point differential)
- [x] 7-tier skills, toasts, dark theme
- [x] Parallel e2e (per-worker server + DB) — 203 tests / 28 specs

## Remaining ideas
- [ ] QR check-in
- [ ] Automated "you're up next" announcements/notifications
- [ ] Session fee management / billing models
- [ ] Late-arriver "expected" state; max-consecutive-games limit
- [ ] Session-end report/export and MMR updates

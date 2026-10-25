# TODO

## Done

- [x] Single-screen session setup — `ASTIRISK (DD-Mmm-YYYY)` name default, whole-hour start select (06:00–23:00), per-court label + hours (0.5–12), alphabetical pool with select-all/tier filter, double-click inline name/skill edit, one Start Session button (create → check in → start); create-session modal flow removed
- [x] Court rental expiry — no Open toggle; expired court (idle or mid-match) offers **Extend Court (+1hr)?**, the live match keeps running under a Last Game badge, server extends from max(expires_at, now)
- [x] Resting tray drag-and-drop both ways (plus Rest/Wake buttons, shift-click)
- [x] Start confirmation — Start Match / Start Singles / 4th-slot drop on an idle court open a dialog; header Smart Match dry-runs a plan (`{dry_run:true}` → `{plan}`, executes exactly it, 409 on stale queue)
- [x] On Deck always mounted — accent panel, numbered cards, skill-balance label, next-free-court ETA, manual builder with oversized slots (＋ Build lineup → Add to On Deck; nothing slates until that click), Smart add / builder ✨ Smart Match pour a slate-only dry-run plan into the builder for review, multiple slates up to SLATE_CAP=3 counted across existing, ↑/↓ reorder, cancel asks for confirmation (Keep / Cancel lineup); per-court 'Next match lineup' matrix removed — slating happens only via the builder
- [x] Slate / On Deck matches with auto-promotion; slate to next free court
- [x] Smart Match (`POST /sessions/:id/automatch`); queue selection always manual — Smart/Manual mode toggle removed (header Smart Match dry-run→confirm and the builder smart fill are the smart paths)
- [x] New-shuttles-only counting — Used stepper, final-modal Used field and sidebar Used tile removed (server columns/history untouched); two-step end match with 1–5 star rating
- [x] Skills render title-cased ('Upper Intermediate'); stored values unchanged
- [x] Header polish — session name as ASTIRISK over the date, Longest wait uses net wait (playing time excluded); End Session (and New Session) confirm before ending
- [x] Queue tabs (All/Wait/Rest), fairness ordering, rest/wake rules
- [x] Leaderboard (win rate, point differential)
- [x] 7-tier skills, toasts, dark theme
- [x] Parallel e2e (per-worker server + DB) — ~200 tests / 28 specs

## Remaining ideas

- [ ] QR check-in
- [ ] Automated "you're up next" announcements/notifications
- [ ] Session fee management / billing models
- [ ] Late-arriver "expected" state; max-consecutive-games limit
- [ ] Session-end report/export and MMR updates

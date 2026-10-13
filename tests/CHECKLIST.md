# QueueC UX Test Checklist

Track E2E and unit test implementation here. Check off each scenario as its test is written and passing.

---

## E2E Tests

### 01 · Landing — no active session
- [ ] 1.1 Page loads — `🏸 QueueC` heading visible
- [ ] 1.2 "No active session" badge in header
- [ ] 1.3 "Start New Session" CTA button visible
- [ ] 1.4 Courts and queue areas absent
- [ ] 1.5 "+ Session" button in header also opens modal
- [ ] 1.6 Page title / tab shows expected app name

### 02 · Create session modal
- [ ] 2.1 Click "+ Session" — modal opens with default field values pre-filled
- [ ] 2.2 Default session name is "Evening Session"
- [ ] 2.3 Default start/end times are pre-filled
- [ ] 2.4 Courts field defaults to 2
- [ ] 2.5 Cancel button closes modal without creating a session
- [ ] 2.6 ESC key closes modal without creating a session
- [ ] 2.7 Clicking backdrop closes modal
- [ ] 2.8 Submit with custom name — header shows custom name
- [ ] 2.9 Submit creates session with correct court_count
- [ ] 2.10 Modal closes automatically after successful create (via SSE)

### 03 · Session lifecycle
- [ ] 3.1 Setup screen appears after session creation
- [ ] 3.2 "Not started" badge visible in header
- [ ] 3.3 Start button disabled with 0 players checked in
- [ ] 3.4 Start button disabled with exactly 1 player checked in
- [ ] 3.5 Start button enabled with ≥2 players checked in
- [ ] 3.6 Clicking Start transitions to live view
- [ ] 3.7 Live view shows courts row and queue grid
- [ ] 3.8 Header shows elapsed timer badge (●) once session starts
- [ ] 3.9 Elapsed timer increments each second
- [ ] 3.10 Session name persists in header during live view

### 04 · Player check-in (setup screen)
- [ ] 4.1 Player pool loads — all 20 fixture players appear as chips
- [ ] 4.2 Each chip shows player name and skill badge
- [ ] 4.3 Check in one player — chip moves to queue list
- [ ] 4.4 Queue counter updates — "Queue · 1" increments
- [ ] 4.5 Checked-in player no longer appears in pool
- [ ] 4.6 Check in 8 players — all 8 in queue in check-in order
- [ ] 4.7 Pool shows "All registered players are in the queue" when pool empties
- [ ] 4.8 Player check-in via setup screen reflects in live queue after start

### 05 · Courts — setup screen
- [ ] 5.1 Default courts — 2 courts listed matching court_count
- [ ] 5.2 Court labels are "Court 1", "Court 2"
- [ ] 5.3 Add court — "+ Add Court" creates "Court 3"
- [ ] 5.4 Remove court — "Remove" deletes it immediately
- [ ] 5.5 Remove all courts — list shows "No courts yet."
- [ ] 5.6 Set active_from time — input persists without error
- [ ] 5.7 Set active_until time — input persists without error
- [ ] 5.8 Toggle "On" off — court disabled; persists on page reload
- [ ] 5.9 Disabled court in setup does not appear in live courts row
- [ ] 5.10 Re-enable court — court reappears in live courts row

### 06 · Queue grid — selection
- [ ] 6.1 Click player — selected; badge shows position number (1)
- [ ] 6.2 Select 2 — "2 selected → Singles" shown in queue header
- [ ] 6.3 Select 4 — "4 selected → Doubles" shown
- [ ] 6.4 5th click does nothing (selection stays at 4)
- [ ] 6.5 Click selected player — deselects; counter decrements
- [ ] 6.6 Selection persists while navigating between courts
- [ ] 6.7 Selection badges show correct sequential numbers (1, 2, 3, 4)

### 07 · Starting a match
- [ ] 7.1 "Start Match" button disabled on court when no players selected
- [ ] 7.2 Court hints "Select 2 or 4 players" when nothing selected
- [ ] 7.3 Court hints "Drop players here" when ≥2 selected
- [ ] 7.4 Singles start (2 players) via button — court shows 2 players
- [ ] 7.5 Doubles start (4 players) via button — court shows 4 players
- [ ] 7.6 Started players removed from waiting queue
- [ ] 7.7 Court shows match format badge (singles/doubles)
- [ ] 7.8 Court shows elapsed match timer from 0:00
- [ ] 7.9 Match timer increments each second
- [ ] 7.10 Drag 1 player to court — arms court, adds to selection
- [ ] 7.11 Armed court shows player names in pill
- [ ] 7.12 Armed court with 2 shows "Start Singles" button
- [ ] 7.13 Drag 4th player to armed court — match auto-starts
- [ ] 7.14 Drag playing player to court — rejected (invalid drop zone visual)
- [ ] 7.15 Drag resting player to court — rejected
- [ ] 7.16 Two courts can each have a match running simultaneously

### 08 · Ending a match
- [ ] 8.1 "End Match" button opens score modal
- [ ] 8.2 Modal title shows correct court label
- [ ] 8.3 Score inputs default to 0
- [ ] 8.4 Score inputs accept values 0–99
- [ ] 8.5 Confirm — players returned to queue as "waiting"
- [ ] 8.6 Returned players visible in queue grid
- [ ] 8.7 Court card returns to empty/idle state after confirm
- [ ] 8.8 Match count stat tile increments
- [ ] 8.9 `total_seconds_played` on player card updates (shows "X min played")
- [ ] 8.10 Cancel — modal closes; match remains running
- [ ] 8.11 Score 0–0 accepted (no validation block)
- [ ] 8.12 Team 1 win — winning team's players gain wins in leaderboard
- [ ] 8.13 Tie score — no leaderboard win recorded for either side

### 09 · Queue management — reorder & resting
- [ ] 9.1 Drag player A before player B — new order reflected in grid
- [ ] 9.2 SSE push (1s tick) does not reset manual reorder
- [ ] 9.3 Newly checked-in player appended to end of existing order
- [ ] 9.4 Shift-click — player moves to resting tray
- [ ] 9.5 Resting tray shows benched player chip
- [ ] 9.6 Resting player absent from waiting queue grid
- [ ] 9.7 Resting player absent from selection candidates
- [ ] 9.8 Click "Return" chip — player back in waiting queue
- [ ] 9.9 Drag player card to resting tray — benches them
- [ ] 9.10 Drag resting chip back to queue — returns them to waiting
- [ ] 9.11 Bench a selected player — removed from selection
- [ ] 9.12 Tray shows placeholder text "Drop a player here…" when empty

### 10 · Smart / Manual mode
- [ ] 10.1 Smart mode button active by default
- [ ] 10.2 Smart mode auto-populates selection on load (≥4 waiting players)
- [ ] 10.3 Smart mode re-suggests after a match ends and queue changes
- [ ] 10.4 Switch to Manual — selection cleared
- [ ] 10.5 Manual mode: clicks select freely up to 4
- [ ] 10.6 Switch back to Smart — selection auto-populated again

### 11 · Live check-in (during active session)
- [ ] 11.1 "+ Check In" button visible in queue header
- [ ] 11.2 Panel shows only players not currently in session
- [ ] 11.3 Checking in appends player to queue end
- [ ] 11.4 Panel closes after successful check-in
- [ ] 11.5 Player just checked in does not appear in panel again

### 12 · Live court controls
- [ ] 12.1 "Open" checkbox visible on each live court card
- [ ] 12.2 Uncheck "Open" — court card hidden from live view
- [ ] 12.3 Re-check "Open" — court card reappears
- [ ] 12.4 Disabling a court mid-match does not end the match
- [ ] 12.5 Drag player from court team 1 to team 2 — teams rearranged
- [ ] 12.6 Drag team 1 panel to team 2 — full team swap
- [ ] 12.7 Drag own-team player to own team — no change
- [ ] 12.8 Multiple courts: matches on two courts independent

### 13 · Stats sidebar
- [ ] 13.1 Player count tile matches number checked in
- [ ] 13.2 Match count tile starts at 0
- [ ] 13.3 Match count increments by 1 after each match ends
- [ ] 13.4 Avg wait tile shows "—" or 0 before any match ends
- [ ] 13.5 Avg wait shows a time string after first match ends
- [ ] 13.6 Leaderboard empty before any match ends
- [ ] 13.7 Winner of first match appears in leaderboard with 1 win
- [ ] 13.8 Player with most wins ranks first in leaderboard
- [ ] 13.9 "+ Add Player" link shows add-player form
- [ ] 13.10 Add player form has name field and skill-level select
- [ ] 13.11 Skill-level select has all 5 options
- [ ] 13.12 Submit add-player form — player appears in check-in pool
- [ ] 13.13 Added player persists across page reload

### 14 · Player card details
- [ ] 14.1 Player card shows name, skill badge, wait timer, minutes played
- [ ] 14.2 Wait timer increments each second for waiting players
- [ ] 14.3 Playing players absent from queue grid (not visible)
- [ ] 14.4 Selection number badge shows correct 1-based index
- [ ] 14.5 After returning from a match, "X min played" reflects match duration

### 15 · Header
- [ ] 15.1 Session name shown in header during active session
- [ ] 15.2 Scheduled time range (start–end) shown in header
- [ ] 15.3 Elapsed timer badge (●) visible after session starts
- [ ] 15.4 Elapsed timer not visible during setup (not-started)
- [ ] 15.5 "+ Session" button always visible in header

### 16 · Accessibility & keyboard
- [ ] 16.1 Create session form submits on Enter
- [ ] 16.2 End match form submits on Enter
- [ ] 16.3 All modal close buttons reachable by Tab
- [ ] 16.4 Score inputs navigable by Tab (Team 1 → Team 2)

### 17 · Responsiveness & layout
- [ ] 17.1 1-court session — single court card fills the courts band
- [ ] 17.2 2-court session — 2 columns in courts band
- [ ] 17.3 5-court session — 3-column grid in courts band
- [ ] 17.4 Stats sidebar scrollable when leaderboard is long
- [ ] 17.5 Queue grid scrollable when many players waiting

### 18 · Error states & edge cases
- [ ] 18.1 Page reload mid-session — session, queue, and matches restored via SSE
- [ ] 18.2 Server restart — SSE reconnects and state resumes
- [ ] 18.3 Starting match on disabled court not possible (no court card shown)
- [ ] 18.4 Empty queue — queue grid shows empty state message
- [ ] 18.5 All players playing — queue grid empty; resting tray empty
- [ ] 18.6 End session with active match — session ends; match state preserved in DB

---

## Unit Tests

### dnd.valid.test.js
- [ ] U1.1 `valid('court', waiting player)` → true
- [ ] U1.2 `valid('court', playing player)` → false
- [ ] U1.3 `valid('court', resting player)` → false
- [ ] U1.4 `valid('resting', waiting player)` → true
- [ ] U1.5 `valid('resting', playing player)` → false
- [ ] U1.6 `valid('queue', playing player)` → true
- [ ] U1.7 `valid('queue', waiting player)` → true
- [ ] U1.8 `valid('team', team payload)` → true
- [ ] U1.9 `valid('team', player payload)` → false
- [ ] U1.10 `valid('unknown-zone', anything)` → false
- [ ] U1.11 `valid(zone, null)` → false for all zones

### api.error.test.js
- [ ] U2.1 Non-ok 404 response throws `Error` with method + path + status
- [ ] U2.2 Non-ok 500 response throws `Error`
- [ ] U2.3 201 response (ok) resolves to parsed JSON
- [ ] U2.4 200 response resolves to parsed JSON

### timer.test.js (computeTimers logic)
- [ ] U3.1 Waiting player: wait = serverTime − checked_in_at − total_seconds_played
- [ ] U3.2 Playing player: not in waitSeconds map
- [ ] U3.3 Active match: play = serverTime − started_at
- [ ] U3.4 Negative result clamped to 0
- [ ] U3.5 Null/undefined queue and matches handled gracefully

---

## Coverage Summary

| Area | Scenarios | Done |
|------|-----------|------|
| Landing | 6 | 0 |
| Create session modal | 10 | 0 |
| Session lifecycle | 10 | 0 |
| Check-in (setup) | 8 | 0 |
| Courts (setup) | 10 | 0 |
| Queue selection | 7 | 0 |
| Match start | 16 | 0 |
| Match end | 13 | 0 |
| Queue reorder & resting | 12 | 0 |
| Smart / Manual mode | 6 | 0 |
| Live check-in | 5 | 0 |
| Live court controls | 8 | 0 |
| Stats sidebar | 13 | 0 |
| Player card details | 5 | 0 |
| Header | 5 | 0 |
| Accessibility & keyboard | 4 | 0 |
| Responsiveness & layout | 5 | 0 |
| Error states & edge cases | 6 | 0 |
| Unit: dnd.valid | 11 | 0 |
| Unit: api.error | 4 | 0 |
| Unit: timer | 5 | 0 |
| **Total** | **174** | **0** |

# QueueC UX Test Checklist

Track E2E and unit test implementation here. Check off each scenario as its test is written and passing.

---

## E2E Tests

### 01 · Landing — no active session
- [x] 1.1 Page loads — `🏸 QueueC` heading visible
- [x] 1.2 "No active session" badge in header
- [x] 1.3 "Start New Session" CTA button visible
- [x] 1.4 Courts and queue areas absent
- [x] 1.5 "+ Session" button in header also opens modal
- [x] 1.6 Page title / tab shows expected app name

### 02 · Create session modal
- [x] 2.1 Click "+ Session" — modal opens with default field values pre-filled
- [x] 2.2 Default session name is "Evening Session"
- [x] 2.3 Default start/end times are pre-filled
- [x] 2.4 Courts field defaults to 2
- [x] 2.5 Cancel button closes modal without creating a session
- [x] 2.6 ESC key closes modal without creating a session
- [x] 2.7 Clicking backdrop closes modal
- [x] 2.8 Submit with custom name — header shows custom name
- [x] 2.9 Submit creates session with correct court_count
- [x] 2.10 Modal closes automatically after successful create (via SSE)

### 03 · Session lifecycle
- [x] 3.1 Setup screen appears after session creation
- [x] 3.2 "Not started" badge visible in header
- [x] 3.3 Start button disabled with 0 players checked in
- [x] 3.4 Start button disabled with exactly 1 player checked in
- [x] 3.5 Start button enabled with ≥2 players checked in
- [x] 3.6 Clicking Start transitions to live view
- [x] 3.7 Live view shows courts row and queue grid
- [x] 3.8 Header shows elapsed timer badge (●) once session starts
- [x] 3.9 Elapsed timer increments each second
- [x] 3.10 Session name persists in header during live view

### 04 · Player check-in (setup screen)
- [x] 4.1 Player pool loads — all 20 fixture players appear as chips
- [x] 4.2 Each chip shows player name and skill badge
- [x] 4.3 Check in one player — chip moves to queue list
- [x] 4.4 Queue counter updates — "Queue · 1" increments
- [x] 4.5 Checked-in player no longer appears in pool
- [x] 4.6 Check in 8 players — all 8 in queue in check-in order
- [x] 4.7 Pool shows "All registered players are in the queue" when pool empties
- [x] 4.8 Player check-in via setup screen reflects in live queue after start

### 05 · Courts — setup screen
- [x] 5.1 Default courts — 2 courts listed matching court_count
- [x] 5.2 Court labels are "Court 1", "Court 2"
- [x] 5.3 Add court — "+ Add Court" creates "Court 3"
- [x] 5.4 Remove court — "Remove" deletes it immediately
- [x] 5.5 Remove all courts — list shows "No courts yet."
- [x] 5.6 Set active_from time — input persists without error
- [x] 5.7 Set active_until time — input persists without error
- [x] 5.8 Toggle "On" off — court disabled; persists on page reload
- [x] 5.9 Disabled court in setup does not appear in live courts row
- [x] 5.10 Re-enable court — court reappears in live courts row

### 06 · Queue grid — selection
- [x] 6.1 Click player — selected; badge shows position number (1)
- [x] 6.2 Select 2 — "2 selected → Singles" shown in queue header
- [x] 6.3 Select 4 — "4 selected → Doubles" shown
- [x] 6.4 5th click does nothing (selection stays at 4)
- [x] 6.5 Click selected player — deselects; counter decrements
- [x] 6.6 Selection persists while navigating between courts
- [x] 6.7 Selection badges show correct sequential numbers (1, 2, 3, 4)

### 07 · Starting a match
- [x] 7.1 "Start Match" button disabled on court when no players selected
- [x] 7.2 Court hints "Select 2 or 4 players" when nothing selected
- [x] 7.3 Court hints "Drop players here" when ≥2 selected
- [x] 7.4 Singles start (2 players) via button — court shows 2 players
- [x] 7.5 Doubles start (4 players) via button — court shows 4 players
- [x] 7.6 Started players removed from waiting queue
- [x] 7.7 Court shows match format badge (singles/doubles)
- [x] 7.8 Court shows elapsed match timer from 0:00
- [x] 7.9 Match timer increments each second
- [x] 7.10 Drag 1 player to court — arms court, adds to selection
- [x] 7.11 Armed court shows player names in pill
- [x] 7.12 Armed court with 2 shows "Start Singles" button
- [x] 7.13 Drag 4th player to armed court — match auto-starts
- [x] 7.14 Drag playing player to court — rejected (invalid drop zone visual)
- [x] 7.15 Drag resting player to court — rejected
- [x] 7.16 Two courts can each have a match running simultaneously

### 08 · Ending a match
- [x] 8.1 "End Match" button opens score modal
- [x] 8.2 Modal title shows correct court label
- [x] 8.3 Score inputs default to 0
- [x] 8.4 Score inputs accept values 0–99
- [x] 8.5 Confirm — players returned to queue as "waiting"
- [x] 8.6 Returned players visible in queue grid
- [x] 8.7 Court card returns to empty/idle state after confirm
- [x] 8.8 Match count stat tile increments
- [x] 8.9 `total_seconds_played` on player card updates (shows "X min played")
- [x] 8.10 Cancel — modal closes; match remains running
- [x] 8.11 Score 0–0 accepted (no validation block)
- [x] 8.12 Team 1 win — winning team's players gain wins in leaderboard
- [x] 8.13 Tie score — no leaderboard win recorded for either side

### 09 · Queue management — reorder & resting
- [x] 9.1 Drag player A before player B — new order reflected in grid
- [x] 9.2 SSE push (1s tick) does not reset manual reorder
- [x] 9.3 Newly checked-in player appended to end of existing order
- [x] 9.4 Shift-click — player moves to resting tray
- [x] 9.5 Resting tray shows benched player chip
- [x] 9.6 Resting player absent from waiting queue grid
- [x] 9.7 Resting player absent from selection candidates
- [x] 9.8 Click "Return" chip — player back in waiting queue
- [x] 9.9 Drag player card to resting tray — benches them
- [x] 9.10 Drag resting chip back to queue — returns them to waiting
- [x] 9.11 Bench a selected player — removed from selection
- [x] 9.12 Tray shows placeholder text "Drop a player here…" when empty

### 10 · Smart / Manual mode
- [x] 10.1 Smart mode button active by default
- [x] 10.2 Smart mode auto-populates selection on load (≥4 waiting players)
- [x] 10.3 Smart mode re-suggests after a match ends and queue changes
- [x] 10.4 Switch to Manual — selection cleared
- [x] 10.5 Manual mode: clicks select freely up to 4
- [x] 10.6 Switch back to Smart — selection auto-populated again

### 11 · Live check-in (during active session)
- [x] 11.1 "+ Check In" button visible in queue header
- [x] 11.2 Panel shows only players not currently in session
- [x] 11.3 Checking in appends player to queue end
- [x] 11.4 Panel closes after successful check-in
- [x] 11.5 Player just checked in does not appear in panel again

### 12 · Live court controls
- [x] 12.1 "Open" checkbox visible on each live court card
- [x] 12.2 Uncheck "Open" — court card hidden from live view
- [x] 12.3 Re-check "Open" — court card reappears
- [x] 12.4 Disabling a court mid-match does not end the match
- [x] 12.5 Drag player from court team 1 to team 2 — teams rearranged
- [x] 12.6 Drag team 1 panel to team 2 — full team swap
- [x] 12.7 Drag own-team player to own team — no change
- [x] 12.8 Multiple courts: matches on two courts independent

### 13 · Stats sidebar
- [x] 13.1 Player count tile matches number checked in
- [x] 13.2 Match count tile starts at 0
- [x] 13.3 Match count increments by 1 after each match ends
- [x] 13.4 Avg wait tile shows 00:00 (mm:ss) before any match ends
- [x] 13.5 Avg wait shows a time string after first match ends
- [x] 13.6 Leaderboard empty before any match ends
- [x] 13.7 Winner of first match appears in leaderboard with 1 win
- [x] 13.8 Player with most wins ranks first in leaderboard
- [x] 13.9 "+ Add Player" link shows add-player form
- [x] 13.10 Add player form has name field and skill-level select
- [x] 13.11 Skill-level select has all 5 options
- [x] 13.12 Submit add-player form — player appears in check-in pool
- [x] 13.13 Added player persists across page reload

### 14 · Player card details
- [x] 14.1 Player card shows name, skill badge, wait timer, minutes played
- [x] 14.2 Wait timer increments each second for waiting players
- [x] 14.3 Playing players absent from queue grid (not visible)
- [x] 14.4 Selection number badge shows correct 1-based index
- [x] 14.5 After returning from a match, "X min played" reflects match duration

### 15 · Header
- [x] 15.1 Session name shown in header during active session
- [x] 15.2 Scheduled time range (start–end) shown in header
- [x] 15.3 Elapsed timer badge (●) visible after session starts
- [x] 15.4 Elapsed timer not visible during setup (not-started)
- [x] 15.5 "+ Session" button always visible in header

### 16 · Accessibility & keyboard
- [x] 16.1 Create session form submits on Enter
- [x] 16.2 End match form submits on Enter
- [x] 16.3 All modal close buttons reachable by Tab
- [x] 16.4 Score inputs navigable by Tab (Team 1 → Team 2)

### 17 · Responsiveness & layout
- [x] 17.1 1-court session — single court card fills the courts band
- [x] 17.2 2-court session — 2 columns in courts band
- [x] 17.3 5-court session — 3-column grid in courts band
- [x] 17.4 Stats sidebar scrollable when leaderboard is long
- [x] 17.5 Queue grid scrollable when many players waiting

### 18 · Error states & edge cases
- [x] 18.1 Page reload mid-session — session, queue, and matches restored via SSE
- [x] 18.2 Server restart — SSE reconnects and state resumes
- [x] 18.3 Starting match on disabled court not possible (no court card shown)
- [x] 18.4 Empty queue — queue grid shows empty state message
- [x] 18.5 All players playing — queue grid empty; resting tray empty
- [x] 18.6 End session with active match — session ends; match state preserved in DB

### 19 · Queue master — real session scenarios
- [x] QM.1  Late player joins mid-match — check in via live panel, immediately visible in queue
- [x] QM.2  Player has to leave — set status 'left' via API; queue shrinks
- [x] QM.3  Smart mode with playing players — suggestion skips players already on court
- [x] QM.4  Queue master manually overrides smart suggestion — switches to Manual, picks different 4
- [x] QM.5  Court disabled while match running — match persists; court hidden; re-enable restores court with match
- [x] QM.6  End session with active match — session ends; header shows no active session
- [x] QM.7  Queue surge: 2 matches end simultaneously — all 8 players return to queue
- [x] QM.8  Reorder queue — drag player A above player B; order survives next SSE tick (1.5s wait)
- [x] QM.9  Full session cycle — create → check in 8 → start → run match → end match → end session → create new session
- [x] QM.10 Player benched then returned mid-match — returns to end of queue, not front

---

## Unit Tests

### dnd.valid.test.js
- [x] U1.1 `valid('court', waiting player)` → true
- [x] U1.2 `valid('court', playing player)` → false
- [x] U1.3 `valid('court', resting player)` → false
- [x] U1.4 `valid('resting', waiting player)` → true
- [x] U1.5 `valid('resting', playing player)` → false
- [x] U1.6 `valid('queue', playing player)` → true
- [x] U1.7 `valid('queue', waiting player)` → true
- [x] U1.8 `valid('team', team payload)` → true
- [x] U1.9 `valid('team', player payload)` → false
- [x] U1.10 `valid('unknown-zone', anything)` → false
- [x] U1.11 `valid(zone, null)` → false for all zones

### api.error.test.js
- [x] U2.1 Non-ok 404 response throws `Error` with method + path + status
- [x] U2.2 Non-ok 500 response throws `Error`
- [x] U2.3 201 response (ok) resolves to parsed JSON
- [x] U2.4 200 response resolves to parsed JSON

### timer.test.js (computeTimers logic)
- [x] U3.1 Waiting player: wait = serverTime − checked_in_at − total_seconds_played
- [x] U3.2 Playing player: not in waitSeconds map
- [x] U3.3 Active match: play = serverTime − started_at
- [x] U3.4 Negative result clamped to 0
- [x] U3.5 Null/undefined queue and matches handled gracefully

---

## Coverage Summary

| Area | Scenarios | Done |
|------|-----------|------|
| Landing | 6 | 6 |
| Create session modal | 10 | 10 |
| Session lifecycle | 10 | 10 |
| Check-in (setup) | 8 | 8 |
| Courts (setup) | 10 | 10 |
| Queue selection | 7 | 7 |
| Match start | 16 | 16 |
| Match end | 13 | 13 |
| Queue reorder & resting | 12 | 12 |
| Smart / Manual mode | 6 | 6 |
| Live check-in | 5 | 5 |
| Live court controls | 8 | 8 |
| Stats sidebar | 13 | 13 |
| Player card details | 5 | 5 |
| Header | 5 | 5 |
| Accessibility & keyboard | 4 | 4 |
| Responsiveness & layout | 5 | 5 |
| Error states & edge cases | 6 | 6 |
| Queue master scenarios | 10 | 10 |
| Unit: dnd.valid | 11 | 11 |
| Unit: api.error | 4 | 4 |
| Unit: timer | 5 | 5 |
| **Total** | **184** | **184** |

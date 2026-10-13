# QueueC UX Test Checklist

Track E2E and unit test implementation here. Check off each scenario as its test is written and passing.

---

## E2E Tests

### 01 · Landing — no active session
- [ ] 1.1 Page loads — `🏸 QueueC` heading visible
- [ ] 1.2 "No active session" badge in header
- [ ] 1.3 "Start New Session" CTA button visible
- [ ] 1.4 Courts and queue areas absent

### 02 · Session lifecycle
- [ ] 2.1 Click "+ Session" — Create Session modal opens
- [ ] 2.2 Submit form — setup screen appears; header shows session name
- [ ] 2.3 Setup screen — "Not started" badge shown
- [ ] 2.4 Start button disabled with 0 players
- [ ] 2.5 Start button disabled with 1 player
- [ ] 2.6 Start session — after ≥2 check-ins, transitions to live view
- [ ] 2.7 Live view — header shows elapsed timer (●)
- [ ] 2.8 End session — header returns to "No active session"

### 03 · Player check-in (setup screen)
- [ ] 3.1 Player pool loads — fixture players appear as chips
- [ ] 3.2 Check in one player — moves from pool to queue list
- [ ] 3.3 Queue counter updates — "Queue · 1" increments
- [ ] 3.4 Checked-in player no longer in pool
- [ ] 3.5 Skill badge visible on chip
- [ ] 3.6 Check in 8 players — all 8 appear in queue in order

### 04 · Courts — setup screen
- [ ] 4.1 Default courts — session with 2 courts lists 2 courts
- [ ] 4.2 Add court — "+ Add Court" creates Court 3
- [ ] 4.3 Remove court — "Remove" deletes it from list
- [ ] 4.4 Set active_from — time input updates without error
- [ ] 4.5 Toggle off — uncheck "On" disables court

### 05 · Starting a match
- [ ] 5.1 Select 2 players — "2 selected → Singles" shown
- [ ] 5.2 Select 4 players — "4 selected → Doubles" shown
- [ ] 5.3 5th select blocked — selecting a 5th player does nothing
- [ ] 5.4 Start via button — court card shows players and timer
- [ ] 5.5 Start via drag (1 player) — drag to court adds to selection
- [ ] 5.6 Auto-start at 4 via drag — 4th drag-to-court starts match
- [ ] 5.7 Started players removed from waiting queue
- [ ] 5.8 Court shows elapsed match timer
- [ ] 5.9 Deselect — clicking selected player removes from selection

### 06 · Ending a match
- [ ] 6.1 "End Match" button opens score modal
- [ ] 6.2 Score inputs accept numeric input
- [ ] 6.3 Confirm — players return to queue as waiting
- [ ] 6.4 Court returns to empty/idle state
- [ ] 6.5 Match count increments in stats sidebar
- [ ] 6.6 Cancel — match keeps running
- [ ] 6.7 Score 0–0 accepted

### 07 · Queue management
- [ ] 7.1 Drag reorder — order reflects in grid
- [ ] 7.2 SSE push preserves manual reorder
- [ ] 7.3 Shift-click benches player to resting tray
- [ ] 7.4 Resting tray shows benched player
- [ ] 7.5 "Return" restores player to waiting queue
- [ ] 7.6 Benching a selected player removes from selection
- [ ] 7.7 Smart mode auto-populates selection
- [ ] 7.8 Manual mode clears selection
- [ ] 7.9 "+ Check In" shows unqueued players; checking in appends to queue
- [ ] 7.10 Check-in panel closes after successful check-in

### 08 · Live court management
- [ ] 8.1 Disabled court hidden in live view
- [ ] 8.2 Only enabled courts shown (2 courts, 1 disabled → 1 card)
- [ ] 8.3 Drag player within court swaps to other team
- [ ] 8.4 Drag team panel swaps entire teams

### 09 · Stats sidebar
- [ ] 9.1 Player count tile correct after check-ins
- [ ] 9.2 Match count tile increments after match ends
- [ ] 9.3 Avg wait shows time value after first match ends
- [ ] 9.4 Winner appears in leaderboard
- [ ] 9.5 "+ Add Player" form appears on click
- [ ] 9.6 New player appears in check-in pool

### 10 · Player management
- [ ] 10.1 All 5 skill-level badges render correctly
- [ ] 10.2 Duplicate check-in not possible (player removed from pool)
- [ ] 10.3 Added player persists across page refresh

---

## Unit Tests

### dnd.valid.test.js
- [ ] U1.1 `valid('court', waiting player)` → true
- [ ] U1.2 `valid('court', playing player)` → false
- [ ] U1.3 `valid('court', resting player)` → false
- [ ] U1.4 `valid('resting', waiting player)` → true
- [ ] U1.5 `valid('resting', playing player)` → false
- [ ] U1.6 `valid('queue', playing player)` → true
- [ ] U1.7 `valid('team', team payload)` → true
- [ ] U1.8 `valid('team', player payload)` → false
- [ ] U1.9 `valid('unknown-zone', anything)` → false

### api.error.test.js
- [ ] U2.1 Non-ok response throws `Error` with method + path + status
- [ ] U2.2 201 response resolves to parsed JSON

---

## Coverage Summary

| Area | Scenarios | Done |
|------|-----------|------|
| Landing | 4 | 0 |
| Session lifecycle | 8 | 0 |
| Check-in (setup) | 6 | 0 |
| Courts (setup) | 5 | 0 |
| Match start | 9 | 0 |
| Match end | 7 | 0 |
| Queue management | 10 | 0 |
| Live courts | 4 | 0 |
| Stats sidebar | 6 | 0 |
| Player management | 3 | 0 |
| Unit: dnd.valid | 9 | 0 |
| Unit: api.error | 2 | 0 |
| **Total** | **73** | **0** |

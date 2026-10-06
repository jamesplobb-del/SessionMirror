# Games audit — October 6, 2026

Baseline: HEAD `cc66c3e`. Audit only; no app-source edits, commit, deployment, purchase, telemetry, or production-data writes. Examined Learn Your Instrument, Balance, and Staff Jumper source, with focused executable checks. User changes to `ANTIGRAVITY_APP_CONTEXT.md` and `launch-site/` were not touched.

## Confirmed defect and reviewed behavior

Final independent review upheld G1 as a defect. G2 reproduces a reset behavior but requires an explicit uninterrupted-hold versus Resume contract decision; it is excluded from the consolidated seven-bug count. See the adversarial report for that qualification.

### G1 — P2: Balance resume can score an already completed target twice and invalidate completion

**Anchor:** `/Users/jameslobb/Documents/BestTake/src/labs/balance/balanceEngine.ts:127`.

`COMPLETE_NOTE` appends a result at lines 85–90. `PAUSE` accepts `goalReached` and `noteResults` at lines 113–122. `RESUME` maps either phase to `countIn` without settling the saved result or advancing the target. Reacquiring pitch starts another attempt at the same target and appends a second result.

**Trigger:** Finish a one-note fixed-duration run; pause in the 700 ms `goalReached` window; Resume; play the target again. The Pause button is rendered during that phase (`BalanceScreen.tsx:556`). Leaving the app also dispatches PAUSE (`useBalanceGame.ts:433`), including during the subsequent note-results window. For daily runs the same interruption corrupts the result list even when later targets are played normally.

**Executable evidence:** The actual `useBalanceGame` hook, reducer, and `createRoutineResult` were bundled from current source and executed with a minimal hook runtime, synthetic accepted microphone frames, and silent audio mocks. Result: **2 results for 1 target, `notesCompleted=2`, `completed=false`**. The actual completion predicate requires result count equal target count (`useBalanceGame.ts:121`); the actual planned-game call passes that false completion through at line 421. Device/UI timing was not exercised.

**Musician impact/platform:** A valid finished hold must be repeated, statistics include a duplicate, and completed work can lose daily completion credit. Shared logic affects browser and iOS.

**Smallest fix:** Preserve completed-result phases on resume (`goalReached`/`noteResults`) or settle them into the normal next-note/rest transition. Do not re-enter acquisition for a target with a committed result. Add guards against duplicate target result commits.

**Regression:** Pause/foreground resume in both completed-result phases with one and multiple targets; assert each target commits once, notesCompleted never exceeds target count, and daily completion remains true.

### G2 — Confirmed behavior / contract decision: Balance resume resets accrued balanced time

**Anchor:** `/Users/jameslobb/Documents/BestTake/src/labs/balance/useBalanceGame.ts:264`.

Resuming an active hold routes through count-in and acquisition (`balanceEngine.ts:127`). Pitch-lock success always creates a new accumulator at lines 264–269 and replaces the previous one. Pause has not finalized or cleared that previous attempt, so time shown before the interruption disappears on reacquisition.

**Trigger:** Accrue balanced time below the goal; Pause or leave the app; Resume; reacquire the correct pitch. With no reference/count-in options enabled, the executable actual-hook repro accrued **1000 ms**, then displayed an accumulator of **100 ms** after resume/relock and one further 100 ms frame. The synthetic hold uses the same accepted-frame callback as the tracker. No real microphone was used.

**Musician impact/platform:** A player answering an interruption must redo their sustained-note work despite the pause card saying the microphone and rope are on hold. Shared browser/iOS logic.

**Smallest fix:** For a resumed active attempt, keep the accumulator's totals and reset its sample/time boundary so pause duration cannot earn credit. Reacquire pitch before adding new samples. Alternatively explicitly implement and label Restart note, but that changes the advertised Resume behavior.

**Regression:** Accrue part of a goal, pause longer than the dropout grace, resume/relock; old balanced time remains, paused time adds zero, and final result commits once. Test personal-best mode and fixed mode.

## Checks executed

Isolated diagnostic: `/private/tmp/besttake-oct6-audit/games-repro.mjs`. Its build loads actual app modules; only React hook scheduling, audio start/stop, haptics, storage host, and planned-game external side effects are controlled. It is an executable source harness, not a React DOM or real-device test. Initial harness build failed for missing SVG loader; adding a dataurl loader fixed the harness, and its final execution passed all assertions.

- Balance: active start, accepted-pitch lock, accumulated hold, pause/resume, completed-target interruption, repeated completion, and actual result construction reproduce G1/G2.
- Learn: actual hook rejects a transposed trumpet target one octave high; a frame gap over 140 ms resets the continuous-hold attempt; all eight correct beginner notes complete the course with persistent course credit; Restart clears current-run progress while retaining course credit.
- `node scripts/verify-staff-jumper-difficulty-ranges.mjs` — PASS: 20 graded instruments and 21,582 generated clarinet notes.
- `node scripts/verify-staff-jumper-review.mjs` — PASS: 54,000 rhythm slots, pulse grouping, rest exclusions, spacing, beam hooks, 400 custom-note slots, phrase variation and custom staff ranges.
- `node scripts/verify-instrument-playability.mjs` — PASS: transposition, detector range endpoints, 870 scale cases, notation/defaults, saved-routine validation, range labels, decay scoring, 44 synthetic audio cases.
- `node scripts/verify-rhythm-input-tolerance.mjs` — PASS: 240 timing cases across meters, tempos, durations and difficulties; delayed inputs retained and silent notes expire.

## Source review and useful optimizations

Reviewed Learn start/restart/setup/note stepping, shuffled goals, pitch tolerance and transposition; Balance fixed/personal-best goals, single/scale/custom note construction, settings normalization, retries/rest/stop, daily-result persistence and trophy paths; Staff Jumper difficulty/range/key/transposition/custom pitches, exact-note matching, clocks, rhythm/free progression, pause/end/retry, headphone route gate, asynchronous audio cancellation and ownership. Existing October 1 Learn ±80-cent policy is deliberate; it is not a new defect. Staff Jumper rhythm-bar replay after resume intentionally re-scores replayed notes, documented in the reducer; not counted as a defect.

Separate musician-facing improvements:

- Balance resting UI provides Skip Rest but no in-app Pause/Quit (`BalanceScreen.tsx:468` onward). A player who needs to change target/setup during a manual rest must skip to the next note before reaching a Pause button. Add a reachable Pause/Quit action to rest and result screens.
- Balance rest pause/resume keeps the absolute `restEndsAt` deadline, so remaining rest elapses while the app is away. The reducer harness confirms this; whether a planned breath/rest should freeze or continue is a product choice. Define that behavior and show it consistently.

Neither improvement is presented as a confirmed scoring defect.

## Limits and remaining device work

Live browser operator reported the CUA runtime cannot start because its writable-root configuration references the obsolete `SessionMirror` symlink. No browser walkthrough, real-device microphone, headphone route switch, permission dialog, native audio, background timing, touch gestures, offline purchase/restore, or persistence across app reinstall/restart was exercised. Focused source/harness passes do not certify those paths.

Priority device tests: G1 interruption during reward/result windows; G2 sustained hold interruption; Learn denied microphone → Settings permission recovery → lesson completion; Staff Jumper headphones disconnect/reconnect during native drone startup and pause/resume; test-input switch while holding Balance; quit Games into tuner/music/routines while sound is starting. Cross-feature lifecycle and Plus are owned by the leader/root audit.


## Authorized G1 fix — same-day follow-up

User authorized implementation of G1. `balanceEngine.ts` now preserves goalReached/noteResults on resume, rejects duplicate or wrong-target completions, and checks the expected phase on scheduled transitions. `useBalanceGame.ts` restricts continuation to noteResults and supplies expected phases for reward, continuation and rest transitions. Thus a queued pre-pause callback cannot advance a paused run. The existing unfinished-hold reacquisition/scoring policy described under G2 was preserved.

`node scripts/verify-balance-completed-resume.mjs` passes 12 actual-hook cases: one/two targets × goalReached/noteResults × button/background/visibility pause. The controlled harness invokes a queued callback before effect cleanup, verifies exact result counts and completion, executes actual daily-result persistence once, and checks the planned-game caller receives completed=true. Duplicate commit and failed-note retry checks pass. `node scripts/verify-instrument-playability.mjs` and scoped diff whitespace checks pass. No real microphone, device interruption timing or browser UI was exercised.

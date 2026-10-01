# Pitch analysis and games audit swarm

**Historical audit:** the findings and diagnostic results below describe the initial audit before the user authorized implementation. The follow-up fixes and current regression results are recorded in [pitch and games fixes](2026-10-01-pitch-games-fixes.md). The diagnostic scripts and ignored evidence files have since been updated to assert the repaired behavior.

This recreates the workflow in [Map routine audit swarm](codex://threads/01a0f7b0-fc69-74e1-9c36-dd4a4e61c7e5) for Pitch Insights, Balance, Staff Jumper and Learn Your Instrument. The October 1, 2026 audit found pitch-history deletion problems and misleading game feedback. The recommended first batch repairs trust in saved history and results before adding practice features. Application code has not been changed by this audit.

The deliverables are this workflow, two reproducible diagnostic scripts and recorded browser observations. Source review, synthetic simulations and browser actions cover different behavior; none certifies real microphone performance or a bug-free release.

## Team and usage limits

Three actual agents performed bounded reviews:

| Role | Requested model | Responsibility |
| --- | --- | --- |
| Design lead | GPT-6.1 Sol, high | Musician benefit, feature boundaries, findings and implementation sequence |
| Pitch tester | GPT-6 Luna, high | Capture, history, resets, context changes and reproducible failure scenarios |
| Games tester | GPT-6 Luna, high | All three games, ranges, scoring, results, rewards and adversarial feedback checks |

The coordinator read the original chat and map, reconciled findings, checked source evidence, exercised the actual app and reviewed the diagnostic scripts. Sol completed a final challenge of the resulting map. Workers inspected the current uncommitted tree; only the coordinator operated the browser. Existing user edits were preserved.

The user's floor is **80% allowance remaining**. Before dispatching and between rounds, inspect every reported usage bucket and calculate remaining as `100 - usedPercent`. At **85% remaining in any relevant bucket**, start no further agents or test batches and wrap up into a saved report. At 80%, stop discretionary work. The available readings progressed from 100% to 99% to 98% remaining in the main bucket; the separate reserve bucket showed 100% remaining. Reporting can lag, and the account is shared with other chats, so the buffer is a monitoring policy rather than an enforceable cap. No reset, recurring automation or new chat was created.

## Repeatable audit workflow

Use the original map's bounded design and challenge process, with one feature or small repair batch per round:

1. **Baseline:** preserve the working tree, record source fingerprint and quota, choose a disposable QA origin, and define the musician outcome. Identify microphone, storage and access boundaries before testing.
2. **Sol design pass:** trace a realistic practice session; distinguish confirmed defects, suspected failures and optional improvements. For each item, give evidence, musician impact, smallest repair and observable acceptance criteria.
3. **Luna challenge:** one tester owns pitch/history and one owns games. Exercise production logic with synthetic inputs and explicit boundary mocks. Source assertions must be labeled separately from behavior tests. Report failed expectations even when existing checks pass.
4. **Coordinator UI pass:** serially exercise setup, practice, pause, finish, retry, exit and reopen on the actual isolated app. Record observed text, screenshots and missing coverage. Test apparatus success does not substitute for app success.
5. **Reconcile:** challenge the highest-impact finding and remove unsupported claims. Prioritize data preservation and truthful feedback before optional additions. For an audit, revise the map; implement product changes only within a requested implementation batch.
6. **Verify the selected batch:** after a repair, rerun affected failure cases and adjacent checks, then inspect the actual UI. Keep native microphone and interruption cases separate. Stop after one substantive challenge and revision unless another round has clear value and sufficient allowance.

Each case records its setup, steps, expected outcome, observed outcome, evidence, platform and status: passed, failed, not run or unavailable. A case is passed only for the stated conditions. The benchmark is a **derived professional rubric**: preserve practice data, name pitch consistently, score according to the stated learning goal, recover from interruption, and offer a clear next practice action. No competitor or acoustic performance comparison was performed.

## Findings and repair order

| Priority | Feature and finding | Evidence and musician impact | Proposed response |
| --- | --- | --- | --- |
| P1 | Filtered Reset Day removes other pitch groups | The screen derives days from filtered observations, quotes that count, then calls deletion for the entire time interval. With two groups on one day, the simulation expected one other-group row to remain and found zero. [Screen](/Users/jameslobb/Documents/SessionMirror/src/components/audioPractice/PitchInsightsScreen.tsx:1241), [reset](/Users/jameslobb/Documents/SessionMirror/src/components/audioPractice/PitchInsightsScreen.tsx:1325), [repository](/Users/jameslobb/Documents/SessionMirror/src/db/pitchInsightsRepository.ts:156). | Either delete exactly the selected group and propagate that scope through updates, or make whole-day deletion explicit with the real cross-group count. Selected direction: scoped deletion when a group is selected. |
| P1 | Reset can save a note from before the reset afterward | Clearing stored rows leaves the live tracker's unfinished candidate intact. Completing that candidate saved one row after Reset All in the simulation. [Reset](/Users/jameslobb/Documents/SessionMirror/src/components/audioPractice/PitchInsightsScreen.tsx:1365), [tracker integration](/Users/jameslobb/Documents/SessionMirror/src/components/LivePitchTuner.tsx:737). | Coordinate reset and capture: discard affected candidates and prevent queued observations from before the reset from appearing afterward. New notes played after the reset may be saved normally when capture remains enabled. |
| P1 | History note names can use the wrong written pitch | History selection changes the rows, while the formatter still uses the current tuner transposition. Reviewing B♭ history with the tuner in Concert can therefore label it in concert pitch. This is a source-confirmed mismatch; the populated UI scenario remains untested. [Formatter](/Users/jameslobb/Documents/SessionMirror/src/components/LivePitchTuner.tsx:599), [filter](/Users/jameslobb/Documents/SessionMirror/src/components/audioPractice/PitchInsightsScreen.tsx:1241). | Use the selected group's written offset in overview and details. Label the All view as concert pitch. Keep register commentary in the same context. |
| P2 | Learn completion overstates tuning accuracy | The matcher accepts ±80¢ for beginner recognition, but completion says every note was heard in tune. The diagnostic executed the production predicate at +80¢, +80.01¢ and silence. [Threshold](/Users/jameslobb/Documents/SessionMirror/src/labs/learnInstrument/useLearnInstrumentGame.ts:28), [copy](/Users/jameslobb/Documents/SessionMirror/src/labs/learnInstrument/LearnInstrumentScreen.tsx:178). | Say “All notes recognized.” Preserve forgiving recognition; any stricter intonation mode is a separate design choice. |
| P2 | Balance can announce completion of an incomplete run | Production reducer and completion expression correctly identify missed goals, but rendering the actual result component shows both “Routine complete” and “Incomplete.” [Headline](/Users/jameslobb/Documents/SessionMirror/src/labs/balance/BalanceResults.tsx:44), [completion](/Users/jameslobb/Documents/SessionMirror/src/labs/balance/useBalanceGame.ts:120). | Use “Run summary” or a headline based on the completion result. Preserve the current rule for daily awards and completed goals. |

### Confirmed behavior requiring a product policy

- **Collection access:** capture defaults on and its saving callback lacks the Plus gate used for the Insights screen. This is a source-confirmed access/control gap; whether collection should be paid-only is a product decision. Ensure every user whose pitch is collected has an accessible explanation and capture control. If paid-only is the intended rule, gate capture and discard candidates when access expires, without deleting saved history. [Capture](/Users/jameslobb/Documents/SessionMirror/src/components/LivePitchTuner.tsx:729), [screen boundary](/Users/jameslobb/Documents/SessionMirror/src/components/LivePitchTuner.tsx:591).
- **Normal interval practice:** alternating C4–G4 every 300 ms triggers the competing-audio heuristic. The executable detector scenario demonstrates this, but acoustic impact is untested. Challenge the heuristic with repeated fifths, octaves, arpeggios and true competing input; keep the prompt easy to dismiss and avoid losing legitimate practice history. [Detector](/Users/jameslobb/Documents/SessionMirror/src/utils/pitchInsightsCapture.ts:72).
- **Staff Jumper octave policy:** production matching accepts C5 for a C4 pitch-class target. Code intentionally compares pitch class, so this is not automatically a functional defect. Name the existing flexible-octave policy; consider a separate strict-register mode if correct staff register is the learning goal. Preserve beginner accommodation during any change. [Matching](/Users/jameslobb/Documents/SessionMirror/src/labs/staffJumper/staffJumperMusicLogic.ts:1041).
- **Instrument identity:** Insights groups observations by transposition, so trumpet and clarinet can share one group, as can several concert instruments. Label current groups honestly. True instrument-specific history needs a data-model decision and migration that retains legacy observations. [Grouping](/Users/jameslobb/Documents/SessionMirror/src/components/audioPractice/PitchInsightsScreen.tsx:1229).

## Musician improvements to evaluate

| Feature | Small proposed improvement | Benefit hypothesis and boundary |
| --- | --- | --- |
| Pitch Insights | A deliberate “Practice this note” action from a note tendency | Shortens the step from reviewing history to practicing. Preview pitch context, range and tolerance, then require Start. Keep heuristic commentary separate from measured observations. |
| Balance | Retry a selected weak note from results; evaluate shorter rests for scale work | Encourages focused repetitions. Preserve target, instrument and tolerance. The default goal-matched rest can add 10 seconds between 10-second notes; confirm desirable cadence with musicians before changing it. |
| Staff Jumper | Explain octave policy and distinguish note-reading misses from timing misses | Makes results actionable. Offer a short practice goal before open-ended sessions. Preserve rest behavior and avoid charging multiple misses for one sustained wrong note. |
| Learn Your Instrument | A visible Change instrument action and a written-versus-sounding pitch cue | Reduces setup confusion for transposing instruments. Keep manual Previous/Next, owed notes and the existing broad recognition threshold. |

These are design recommendations, not shipped additions or measured learning outcomes.

## Practice scenarios and acceptance criteria

The following criteria govern future fixes. They are proposed checks unless listed as executed below.

| Scenario | Required outcome |
| --- | --- |
| Long tones → silence → review | One accepted stable tone produces the expected observation; silence completes it; noise and short unstable inputs do not become convincing history. |
| Capture off → play → reload | The tuner continues working, new history stops and the preference survives reopening. Existing history stays intact. |
| Two pitch groups on the same local day | Overview and details use the declared written/concert context. Reset confirmation discloses the exact scope; cancellation changes nothing; unrelated group and other day survive. |
| Reset during a held tone and queued save | Independently test a pre-reset candidate finishing afterward, a save queued before deletion, a wholly new post-reset tone and an unaffected-source candidate during scoped Reset Day. Only affected observations disappear. New tones save once when enabled. Reset failure produces accurate feedback. |
| Instrument change, midnight and access change | Completed observations retain their original context. Local-day boundaries use a start-inclusive/end-exclusive interval. Upgrade/downgrade follows the selected collection policy and preserves saved history. |
| Interval drills versus other players | Repeated fifths, octave shifts and arpeggios do not unnecessarily interrupt a solo exercise; competing sources are evaluated separately. Prompt cleanup does not erase unrelated sessions. |
| Balance centered note → drift → early release → retry | Only valid practice time counts; retry preserves setup; an unfinished goal is reported truthfully. Rest and continue controls remain reachable. |
| Balance full session → results → restart | Goal and partial-run summaries are correct; only eligible completed challenges receive awards; rewards cannot duplicate after restart or failed-save retry. |
| Staff Jumper repeated notes, wrong octave and rests | Acceptance matches the visible octave policy, note repetition requires the intended release, rests score appropriately and pitch/timing misses are distinguishable. |
| Staff Jumper pause → resume → finish → retry → exit | Pausing stops score accrual; resume follows the intended count-in; retry creates a fresh run; exit releases input and returns to Games. |
| Learn center, +75¢, adjacent semitone and broken holds | Recognition follows the chosen tolerance and uninterrupted hold rule. Completion wording describes recognition. Silence cannot complete a note. |
| Learn Next/Previous and lesson completion | Skipped notes remain owed; navigation alone does not advance completion; all required recognized notes complete the course once. |
| Cross-feature session | Warm up in Learn → Balance → Staff Jumper → Tuner/Insights → return to practice. No duplicate listener, stale target, abandoned input or incorrect reward/history attribution persists across transitions. |
| Failure and device cases | Deny microphone, reconnect, background/resume, audio interruption, headphones/Bluetooth, noisy room, full storage and malformed saved state. A failed save is visible and recoverable. Test short phone and tablet orientations for reachable controls. |

## Executed validation

Seven existing focused checks passed: pitch-insights-capture, staff-jumper-review, staff-jumper-difficulty-ranges, instrument-playability, rhythm-input-tolerance, daily-challenges and daily-challenge-plan. Their scopes include preference migration, generated note ranges, synthetic pitch and timing cases, award caps, rollover and storage-failure models. They do not drive the app UI or microphone.

Two new scripts preserve the strongest challenges:

```sh
node scripts/practice-qa/audits/pitch-insights-2026-10-01.mjs
node scripts/practice-qa/audits/game-feedback-2026-10-01.mjs
```

The pitch audit reports **9 passed expectations, 2 failed history expectations and 2 policy-review observations**, and exits 1 while the history failures remain. Actual tracker/repository modules run with an in-memory SQL behavior mock; mock persistence does not prove real SQLite or browser durability. The diagnostic composes those modules rather than executing React reset handlers, a queued-write race or a reset/capture coordinator. The new-tone baseline passes, but all four reset acceptance cases must later exercise the selected coordinator. Unsupported SQL is rejected explicitly so a future scoped-delete query cannot silently receive incorrect mock behavior.

The games diagnostic exits 0 when it successfully reproduces the three observed behaviors: Learn's broad recognition/copy mismatch, Balance's contradictory completion wording and Staff Jumper's octave-insensitive scoring. **That exit status means successful diagnosis, not healthy product behavior.** After a selected repair, replace the relevant diagnostic assertion with the desired acceptance assertion. Preserve intentional gameplay policy explicitly.

The games evidence labels the six earlier check results as previously observed; rerunning that diagnostic does not renew their coverage. The exact fingerprint at those original executions was not captured.

Local machine-readable evidence is [pitch-evidence.json](/Users/jameslobb/Documents/SessionMirror/scripts/practice-qa/results/pitch-games-2026-10-01/pitch-evidence.json) and [games-evidence.json](/Users/jameslobb/Documents/SessionMirror/scripts/practice-qa/results/pitch-games-2026-10-01/games-evidence.json). Results are ignored by Git; the rerunnable scripts and this report remain in the project. The end-of-audit `src` TS/TSX fingerprint is `443aeb06917a74ec3b187869da153921c34e32e821e7259af94af6f36830578e`; it does not fingerprint CSS/native files or establish an immutable snapshot during concurrent chats.

### Actual browser observations

The coordinator used the real working-tree app with the existing QA configuration at the isolated origin `http://127.0.0.1:5227/`. Synthetic media/game input and disabled telemetry were confined to that QA server. Onboarding selected Trumpet. The built-in free Plus preview was started only in that disposable origin; no purchase or restore was performed.

| Feature | Observed result | Coverage limit |
| --- | --- | --- |
| Learn | First lesson displayed C4/open fingering; Next displayed D4/valves 1+3; Previous restored C4; progress remained 0; Back returned to setup and Games. | Actual recognized-note/course completion was not exercised. |
| Balance | Quick Play started with C4/3 repetitions and 10-second goals. A sustained test gesture ultimately produced 3/3 goals, 30.1 seconds reported balanced time and trophy/unlock UI. Games reopened. | Browser control took about 370 seconds to return from an intended 12-second hold. The gesture therefore cannot establish input duration, acoustic accuracy, release timing or intended single-note isolation. |
| Staff Jumper | Start showed count-in/targets; silence produced four misses; Pause → Finish run showed 0 correct and 0% accuracy; Play Again started a fresh exercise; Pause → Exit returned to Games. | Correct-note rhythm scoring and live resume were not tested in the browser. |
| Pitch Insights | Free access opened Plus; the local preview opened Insights. Turning capture off changed its switch and explanation. Reload → Tuner → Insights retained saving off. | Populated history filtering/reset/detail screens and native persistence were not exercised live. |

Screenshots: [Learn](/Users/jameslobb/Documents/SessionMirror/scripts/practice-qa/results/pitch-games-2026-10-01/learn-navigation.jpg), [Balance](/Users/jameslobb/Documents/SessionMirror/scripts/practice-qa/results/pitch-games-2026-10-01/balance-results.jpg), [Staff Jumper](/Users/jameslobb/Documents/SessionMirror/scripts/practice-qa/results/pitch-games-2026-10-01/staff-jumper-results.jpg), [capture off](/Users/jameslobb/Documents/SessionMirror/scripts/practice-qa/results/pitch-games-2026-10-01/pitch-capture-off.jpg). Full session expectations and limits are recorded in [ui-session.json](/Users/jameslobb/Documents/SessionMirror/scripts/practice-qa/results/pitch-games-2026-10-01/ui-session.json).

## Implementation batches and release gates

1. **History and feedback repairs:** scoped Reset Day, reset/capture coordination, correct pitch labeling, truthful Learn and Balance results. Sol integrates one shared area at a time; Luna challenges history and game results separately.
2. **Visible practice rules:** resolve collection controls/access, interval prompt behavior, instrument grouping labels and Staff Jumper octave policy. Keep policy changes distinct from confirmed bug fixes.
3. **Targeted practice actions:** select the smallest validated improvement per feature. Preserve saved history, settings, progress and award behavior; avoid a shared new practice engine without demonstrated need.
4. **Native release pass:** real instruments, permission denial/recovery, background/audio interruption, routing, restart durability and phone/tablet layout. Repeat the cross-feature practice session on a supported device.

No known P1 defect may be waived by passing unrelated utility checks. A feature batch passes only when its selected failure cases, adjacent checks and actual relevant UI flow pass; missing native evidence remains visible. Audit deliverables are complete, but the requested bug-free product bar is **not reached**: confirmed defects remain and real-device coverage is outstanding.

The final Sol challenge tightened the audit: reset expectations now distinguish old candidates from new practice, collection and octave policy are kept outside confirmed-defect counts, the SQL mock rejects unsupported queries, and historical check results are labeled honestly. These revisions improve the audit evidence; they do not repair application behavior.

# Practice workflow verification for paid music features

**Historical broken-version evidence.** The subsequent [fixes and verification report](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-practice-fixes-verification.md) records repairs and their passing checks. Screenshots in this earlier report show the original failures.

The normal routine flow worked in the isolated browser test, but the paid music experience has reproducible failures to address before release. This report records actual app interactions, isolated utility tests and separate source findings on October 1, 2026. It extends the [audit swarm map](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-audit-bot-swarm.md).

GPT-6.1 Sol reviewed design and paid-feature recovery; two GPT-6 Luna reviewers checked routine boundaries and score persistence. The coordinating chat operated the real app serially. Application code was not changed. Test coverage and evidence were added.

## Test environment

The app ran from the current working tree using the repository's dedicated QA Vite configuration at `http://127.0.0.1:5218/`. This fresh origin isolated the test library from the user's normal data. Synthetic inputs belong to this QA configuration and do not establish real microphone, camera or acoustic performance.

Browser viewports were 390 × 844 and 390 × 600. Onboarding selected Trumpet. The test routine was named QA Trumpet rehearsal and began from the four-step Fundamentals preset. Music used the repository fixture `scripts/fixtures/app-design/music-layout-check.pdf`, a two-page PDF. Plus was enabled using the ordinary seven-day development preview UI on the test origin; no App Store purchase or account entitlement was changed.

Source fingerprint, SHA-256 over sorted `src` TS, TSX and CSS paths and contents separated by null bytes: `58418eeab2f2d4543a0dc7136c92bd48520aca1d1d83c7c3627bc8234646eb12`. This does not fingerprint native files or every repository asset.

## Actual practice workflows

| Case | Steps and expected result | Observed result | Status and limit |
| --- | --- | --- | --- |
| First practice | Onboard with Trumpet → Try a suggested routine → Fundamentals | Suggestions opened directly; four exercises and saved tool summaries appeared | Passed for this instrument and preset |
| Save and restart | Rename → Save for later → reload | QA Trumpet rehearsal remained available with four steps | Passed |
| Begin practice | Start saved routine | First step opened Tuner with the routine bar and configured drone | Passed for UI state; no audible accuracy claim |
| Pause and continue | Pause → Resume | Bar changed to Paused, then resumed elapsed time | Passed for this transition; background timing not tested live |
| Next exercise | Done & next from step one | Long tones opened as step 2 of 4 with a 60 BPM metronome widget | Passed for this handoff; full completion and recording not tested |
| Progress persistence | Leave for Home, then reload later | Home still showed 1 of 4 completed and continuation returned to the paused Long tones state | Passed |
| Paywall dismissal | Open Music → View Plus → Close Plus | Returned to Music with Long tones still paused and routine progress retained | Passed for this entry point; draft-save paywall paths remain untested live |
| Preview unlock | View Plus → Try Plus free for 7 days | Plus became ready; locked banner disappeared when returning to Music | Passed for the development preview only |
| Score import | Import fixture PDF → open score | One score appeared; reader showed two pages | Passed; chooser latency was an automation observation, not diagnosed as a product bug |
| Page turn | Page controls → Next page | Indicator changed from 1/2 to 2/2 | Passed for ordinary whole-page turn |
| Mark and undo | Mark up → red marker → draw → Undo | Drawing enabled Undo/Clear/Save PDF; Undo removed the stroke and disabled those controls | Passed for this marker and stroke |
| Reopen marked score | Draw again → Library → reopen | Red stroke remained on page two | Passed within the same app session |
| Reopen after reload | Reload → Music | Library became empty despite successful import and active development Plus preview | Failed; confirmed browser score persistence defect |
| Save exercise duration | Edit Long tones → enter 120 minutes → Save for later → reopen More options | Exercise minutes reopened as 60; total routine time became 1 h 14 min | Failed; confirmed silent duration truncation |
| Short tuner layout | Open tuner Settings during paused Long tones → resize to 390 × 600 | Option-list viewport measured about 33 px high, with 926 px of content; rows were visibly cut off | Failed for usability on this layout |

## Defects to repair first

**Browser score persistence:** imported chart bytes are kept only in the module's memory on web. Reload loses them and Music hides the score. The entitled regression and live UI both reproduced this. Native chart storage uses a separate path, so native persistence must be tested independently. See [practiceChartStorage.ts](/Users/jameslobb/Documents/SessionMirror/src/utils/practiceChartStorage.ts:96).

**Duration truncation:** both builders permit up to 180 minutes, while step normalization caps at 60. The live test entered 120 and reopened as 60; the regression fails at the advertised 180-minute boundary. Align input validation and the persistence limit so accepted durations survive unchanged. See [practiceRoutines.ts](/Users/jameslobb/Documents/SessionMirror/src/utils/practiceRoutines.ts:208).

**Tuner panel height and overlap:** on the short phone, fixed header/profile/help content consumed nearly all the constrained panel height. At 390 × 844, floating metronome/drone/routine widgets also overlapped the menu. An attempted Close tuner settings click expanded the metronome instead; read-only hit testing subsequently found the metronome's close control at the tuner close button's center while that widget was expanded. This establishes an overlap concern, but the exact first click interception should be reproduced separately before writing a regression for it. The visible Tuning toolbar control successfully closed the panel. Fit the panel to usable height and keep its controls above or clear of widgets. See [practice-system.css](/Users/jameslobb/Documents/SessionMirror/src/styles/practice-system.css:951).

![Short phone tuner panel](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01/tuner-short-phone.jpg)

## Source findings requiring failure injection

These findings are supported by source inspection; they were not triggered through live fault injection in this run.

- The guided builder calls an asynchronous `onSaveAndStart` without awaiting it, so its synchronous catch cannot handle rejection. See [GuidedRoutineBuilder.tsx](/Users/jameslobb/Documents/SessionMirror/src/components/GuidedRoutineBuilder.tsx:323).
- The music builder awaits launch and promises a recoverable draft, but App clears the builder in `finally`, including after a rejected launch. Preserve the builder or provide an equally clear saved-plan retry route. See [App.tsx](/Users/jameslobb/Documents/SessionMirror/src/App.tsx:5994).
- Inactive Plus disables missing-score guards and applies a desk without music/hands-free. A score-dependent routine can start without explaining that change. Offer an explicit Practice without music choice and an unlock route. See [MusicRoutineBuilder.tsx](/Users/jameslobb/Documents/SessionMirror/src/components/MusicRoutineBuilder.tsx:91).
- Exercise saves occur before routine save; a storage failure can leave partial updates. Test retry and preservation of previously saved routines, not just the in-memory draft. See [MusicRoutineBuilder.tsx](/Users/jameslobb/Documents/SessionMirror/src/components/MusicRoutineBuilder.tsx:199).
- Annotation storage swallows write failures. Storage-full/private-mode behavior needs a visible warning and a recovery/export path if marks cannot be persisted. See [chartInk.ts](/Users/jameslobb/Documents/SessionMirror/src/components/practiceChart/chartInk.ts:117).

## Executed automated checks

Eleven existing checks passed in this turn:

| Script | Covered behavior |
| --- | --- |
| `verify-plus-access.mjs` | Entitlement policy, trial boundaries, restore/revocation model and routine limits |
| `verify-practice-chart.mjs` | Page turns, spreads, rotation and zoom geometry |
| `verify-practice-chart-ink.mjs` | Mark parsing, erasing and actual marked-PDF drawing operations |
| `verify-metronome-program-review.mjs` | Ramps, tempo pins, count-in, loops, pause and exit model |
| `verify-practice-routines.mjs` | Save/reload, pause/restart, history, skipped outcomes, storage errors and transition retry |
| `verify-routine-music.mjs` | Imported exercise setup, persistence, reuse isolation and file validation |
| `verify-music-library.mjs` | Ordering, missing/deleted entries, setup isolation and navigation restore |
| `verify-routine-program-share.mjs` | Linked programs, missing-score placeholders and malformed files |
| `verify-routine-music-share.mjs` | Shared music routine data and score placeholder preservation |
| `verify-routine-links.mjs` | Routine link round trips and legacy compatibility |
| `verify-routine-preset-tools.mjs` | 54 presets and 108 goal plans |

Two defect regressions failed against current product behavior:

- [music-web-reload.mjs](/Users/jameslobb/Documents/SessionMirror/scripts/practice-qa/regressions/music-web-reload.mjs): updated its isolated build fixture to supply Plus access. Previously it stopped at the access gate and could not test reload. It now reaches the intended assertion and fails because the score is unavailable after a fresh module instance. This test fixture does not unlock the real app.
- [routine-duration-roundtrip.mjs](/Users/jameslobb/Documents/SessionMirror/scripts/practice-qa/regressions/routine-duration-roundtrip.mjs): added a boundary regression deriving allowed maxima from both builders and using the real step and storage utilities. It fails because a permitted 180-minute duration becomes 60.

These tests deliberately retain their failures until the product defects are fixed. Utility/model passes do not certify the entire UI or native purchase flow.

## Paid release gates

Before calling this experience ready, repair the confirmed failures and repeat their workflows. Then verify both builders through launch rejection and storage failure; missing/corrupt score repair; batch import with partial failure; rapid taps; canceled creation; editing a routine with existing progress; day rollover; and repeated start/close/reopen cycles.

On a supported iPhone and iPad, verify native score restart persistence, markup/export, Files import, StoreKit cancellation/restore/revocation, offline access checks, trial expiry while idle and while saving a take, real record/save/playback and app/audio interruptions. The current product is a one-time Plus purchase with a seven-day preview, not a subscription. Browser development access is not a StoreKit test.

Proposed direct Mark up, library-to-routine handoff and dedicated setlists are not yet implemented; none is counted as tested. Add their acceptance cases from the map as they are built. Preserve the score-first and no-score routine paths.

**Gauntlet decision: BAR NOT REACHED for paid-feature readiness.** The strongest challenge was leaving a successful practice session and returning later; it exposed score loss and changed saved duration. This run improved the regression coverage and release criteria, with corroborating UI evidence. Product repairs and native failure-path verification remain open.

The final account check reported **98% remaining** in the primary window and **100% remaining** in the reserve window, above the user's 80% floor. No additional batch or automation was scheduled.

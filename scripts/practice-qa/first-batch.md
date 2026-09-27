# BestTake practice QA — first batch, September 26, 2026

Three requested GPT-6 Sol / High workers reviewed recording/comparison, multitrack/music, and routines/games/tools. The lead tested onboarding/settings/navigation and performed live UI actions serially because workers did not have independent browser access.

Tested the actual working-tree app, including uncommitted changes, at `http://127.0.0.1:5217/`. The concept on port 5201 was not the test target. All QA additions are under `scripts/practice-qa/`; no product behavior or visual design was changed. The QA origin has its own disposable library, synthetic media, and game input. No physical iPhone test was performed.

Weekly usage was 72% remaining on the first tool check and **59% remaining on the final check**, above the user's 40% floor. These are account-wide readings. No further batch or recurring job was scheduled.

## Results and coverage

- **24 existing utility/source checks passed. Three new defect regressions failed as expected.** [Automated report](results/2026-09-26T23-01-05-830Z/summary.md) includes per-check logs and limits.
- **25 scoped actual-app UI cases passed; three failed.** The independent synthetic-media baseline also passed. [Session evidence](sessions/2026-09-26.json) records actions, expected and observed results, and remaining states. Two blocked and two untested gap entries are separate from those cases.
- Static census: **1,087 JSX control candidates**. Curated plans: **84 control/workflow groups** with expected outcomes and states. These are discovery counts, not completed coverage. Broad groups retain untested status until their remaining states are exercised; four failed groups represent three defects (audio and video share the recording defect), 11 are blocked, and 69 remain untested in whole or part.
- Source TypeScript fingerprint before and after the live batch: `56f4d55267465cc6fd2f6c02b50eede3f2729adc8d8a689ef0c444d239fb4214`. This fingerprints `src` TS/TSX, not native files, CSS, or every repository asset.

Verified outcomes include routine creation, reload, pause/resume, step settings and checklist completion; game start/retry/exit and lesson navigation; two-part multitrack import, media playback, mixer state and reopening; settings persistence; score search/page navigation; and confirmation cancellation. Passing a control-state case does not certify an entire feature or acoustic performance.

## Confirmed bugs — no fixes applied

### B1. Browser audio and video recording never start

Impact: blocks browser record → save → playback → compare, hands-free capture, populated Vault workflows, and recording new multitrack parts. Native iOS impact is unverified.

Reproduce: open the actual app on the QA origin, finish onboarding, Home → Record → tap Video Record with live preview; switch to Audio and tap Record. Expected recording state/timer and a Stop control. Observed no recording or user-facing error. The synthetic camera was live at 1920×1080, readyState 4; logs reached `userPressedRecord` and `prepareStream`.

Cause: `StreamingTakeWriter.open` returns null on web (`src/utils/takeStorage.ts:417–423`), while `startRecording` requires that writer and silently catches the resulting error (`src/hooks/useCameraSession.ts:2726–2795`). The buffered web stop path becomes unreachable.

Regression: `node scripts/practice-qa/regressions/recording-web-writer.mjs`. Exercises the real extracted start callback and bundled writer with mocked media boundaries. Both audio/video return false with zero recorder starts. [Detailed evidence](recording-findings.md); UI-03.

### B2. Imported browser Music scores disappear after reload

Impact: a successfully imported/readable PDF cannot be reopened after a browser reload. Native storage uses a separate path and remains untested.

Reproduce: Music → Import music → `scripts/fixtures/app-design/music-layout-check.pdf`; wait for the score to appear, open it, then reload. Expected the score to remain. Observed the empty Music state, while the `QA Scores` folder persisted. Reimport → reload reproduced it again without selecting or deleting anything.

Cause: `src/utils/practiceChartStorage.ts` keeps browser chart bytes only in a module Map. After reload, `hasPracticeChart` returns false and `loadPracticeChart` returns null; Music filters out the persisted project entry.

Regression: `node scripts/practice-qa/regressions/music-web-reload.mjs`. Loads the actual storage module afresh with browser storage retained; fails the score-availability assertion. [Detailed evidence](multitrack-findings.md); UI-27.

### B3. “Try a suggested routine” opens the saved-routines screen

Impact: fresh users need an extra, misleading step to reach suggestions.

Reproduce on a fresh QA origin: Home → Try a suggested routine. Expected instrument suggestions. Observed “Your routines”; only New routine opens “Suggested for trumpet.” `MusicRoutineBuilder` converts the `presets` entry mode to `build` before passing it to the guided builder.

Regression: `node scripts/practice-qa/regressions/suggested-routine-entry.mjs`. Renders the actual parent and captures the child entry mode; expected `presets`, received `build`. UI-04.

## Remaining gaps

- Actual app recording/save/playback could not pass its prerequisite. The independent media apparatus generated and persisted a 435,140-byte video, survived reload, decoded non-silent audio (RMS 0.0565), and advanced video frames. This proves the test apparatus only; no recording-dependent workflow is passed on that basis.
- Physical iPhone capture, microphone permissions/routing, headphones/Bluetooth, interruptions, haptics, native export/share/Files and real acoustic timing require a device pass. Native drone renderer checks aborted during AVAudioMixerNode initialization before assertions; classified as a host blocker.
- Correct-note game scoring, full-duration sessions, custom routines, rearranging steps, programs, annotations, trim/drag alignment, all picker choices, error/retry branches and other unexercised census controls remain open. Multi-part audio decoded and played, but audible mix balance and exact synchronization were not measured.
- Record carousel keyboard activation is a source-level concern worth probing after B1; it is not counted as a separately confirmed runtime bug.
- Browser-control delays affected an intermediate playback wait and a game hold gesture. Those are documented limits, not product defects.

## Rerun

Follow [README.md](README.md) for commands, isolation, media generation and usage limits. `node scripts/practice-qa/run.mjs --include-regressions` runs the automated portion and currently exits 1 for the three real defects. It does not rerun UI sessions. Follow [session-protocol.md](session-protocol.md) with browser/Simulator controls and save a new evidence log for each live batch.

Suggested next batch after findings are reviewed: unblock actual capture, then complete record/save/reopen/compare/hands-free on a supported device before spending more time on secondary controls. Do not silently turn mocked success into a passed app workflow.

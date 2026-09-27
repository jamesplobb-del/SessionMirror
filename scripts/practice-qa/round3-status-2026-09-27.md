# Round 3 QA follow-up — 2026-09-27

Source: the user's “BestTake — fix list round 3,” tested by Claude on `aed1f4d` plus an earlier uncommitted working tree. This checkout still contains prior uncommitted work. No source change here has been confirmed by a new iPhone interaction.

## Addressed in the current source

- **P1:** Backing duration and backing-only multitrack playback; last-used Take folder and duplicate challenge folder; Audio Workspace restore; non-overlapping expanded widgets with full first opening; Staff Jumper Hard click-mode cents.
- **P2:** Music stand half-turn in a spread, Remove/Replace confirmation, stale Music rows, score rename; written routine drone labels; Staff Jumper octave transposition/range picker/clef persistence/count-in; unset drone pitch; daily Balance's early Center Stage unlock; early-finish challenge explanation; tap tempo reset on large tempo change; multitrack Play-all clock fallback; Best Take deletion pointer; completed routine Practice again.
- **P3:** Distinct strong/medium accents; Program tab heading and back control; routine bar count and game folding; stale tuner/instrument copy; singular trophy copy, Balance streak and instrument-neutral wind challenge labels; hands-free threshold labels; Take card duration; Escape on sheets; selected picker keyboard focus.

The backing mix, stand geometry, widget placement, click sounds, and Staff Jumper live pitch behavior are source-level fixes and still need device interaction checks. The user's requirement that stand widgets open full size on first use is preserved.

## Still open or unverified

- **iPhone confirmation:** Multitrack backing-only playback and native monitor mix when adding the first part; full-length backing after a short part; export. Also confirm stand half-turn and widget layout on phone/iPad, Staff Jumper live scoring/count-in, score Replace/Remove, and relaunch persistence.
- **Music stand:** Record rail and half-page seam may still cover staff. Leaving the stand for the Library does not automatically stop the click or mic; stopping the click would conflict with the already-confirmed cross-tab metronome behavior and needs a product decision.
- **Metronome polish:** Cross-tab running/stop affordance, tab volume, gain calibration, and early Program counter remain. These affect controls/audio behavior and were not altered without live verification.
- **First-run tips** may still cover controls. Existing routine-item Minutes and metronome editor title were already in source; confirm in the current iPhone build.
- **Browser-only:** PDF files are memory-only after a full web reload; web recording has no buffered fallback and the start failure is silent. The user earlier prioritized the regular iPhone app over web recording. Native PDF persistence and recording still need a device check.
- **QA gaps from Claude:** iPhone take record/playback/compare/trim/enhance/export, hands-free gate, drone sound, Balance Quick Play/Learn, and Staff Jumper alto/flute option sweep.

## Repeat checks

Run `npm run build` and `node scripts/practice-qa/run.mjs --include-regressions`. On this source, the build passes and the Node suite is **34 passed, 2 failed**; only the browser PDF reload and browser recording writer checks fail. The suite is utility/source coverage, not live UI coverage. Targeted regressions for backing/timing, widgets, folder restore, hard cents, daily Balance unlock, octave transpositions, tap tempo, and Best Take pointer pass.

The run report is `scripts/practice-qa/results/2026-09-27T18-51-14-064Z/summary.md` (generated results may be ignored by Git). For iPhone, use isolated throwaway projects and a synthetic backing longer than the first recorded part; reopen the project and repeat playback before judging persistence or export.

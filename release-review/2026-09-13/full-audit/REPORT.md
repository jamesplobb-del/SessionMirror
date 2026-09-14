# BestTake launch audit — first checkpoint

September 13, 2026. Audited the current working tree, including its existing uncommitted changes. Product code was not changed during this audit.

**Recommendation: resolve the confirmed workflow and teaching defects below before charging for the affected features. This is not an all-features launch sign-off.** The requested audit is broader than the completed coverage: native recording, the complete editing interface, every game interaction, and real instrument/device behavior still need verification. This checkpoint preserves reproducible evidence and the remaining work.

Account usage was 40% used at the start and 45% used at the checkpoint: approximately five percentage points, with 55% remaining. These are rounded account-wide readings, not an exact per-task bill. No usage reset was redeemed.

## What was tested

- 31 existing verification scripts: **30 passed; one tuner-history assertion failed**. See `baseline-results.json`, `additional-results.json`, and `native-tuner-detector.log`. Many scripts verify source contracts or helpers; their success does not prove the corresponding interface works.
- TypeScript compilation passed (`typescript.log`). This was not a new distribution build or TestFlight installation.
- Instrument/game helpers: 870 generated scale cases, supported-range endpoints, transposition examples, viola notation, saved custom-note validation, and 44 synthetic web pitch cases.
- Actual native pitch-detector helper: 52 synthetic frequency/harmonic cases at 44.1/48 kHz; worst error 1.384 cents; silence rejected. These are controlled signals, not recordings of 52 real instruments.
- File probes against production parsers/storage helpers: all 33 supported meters in basic round trips, mixed-meter tempo pins, embedded programs, missing attachments, malformed meter names, storage failure and rollback.
- Browser interaction on an isolated local preview with synthetic media: onboarding/instrument selection; Home navigation; program creation; saved-program import; section-edit tap/keyboard comparison; routine import and item editing; attached-program selection; routine start/expansion; opening its program through keyboard activation; recording-start attempts.
- Native multitrack renderer extracted from production Swift and run in a separate iOS 26.5 simulator test app. Full renderer crashed in Apple's Core Animation/IOSurface path. A diagnostic version bypassing only the decoration animation tool produced five real MP4s; their audio, durations and selected decoded frames were inspected. **Those diagnostic exports do not certify the unchanged full renderer.**

## Confirmed findings, in repair order

### A01 — Attached programs have no advertised Play control in the routine bar — high priority

**Observed:** import `Audit-attached-program.btplan`, edit its item and verify “Audit sequence” is linked, then start the routine. The routine timer advances, but the program is paused. Neither the collapsed nor expanded routine bar exposes Play program. Setup explicitly instructs the user to press Play on that bar.

`src/components/RoutineProgramControls.tsx` exists but has no import or usage anywhere in `src`. `src/utils/routineProgram.ts:6` deliberately prepares a paused session. `src/App.tsx:5160` invokes that preparation. The new `RoutineBar.tsx` has routine pause/resume and completion controls only.

**Impact:** teachers can successfully share a program-containing routine that students cannot start using the instructions provided. A separate program workspace can be reached using keyboard activation; this is not the promised routine-bar workflow. Actual playback of the imported program was not confirmed in this browser run.

**Acceptance:** restore an accessible Play/Pause program action for the active linked step; verify start, pause, resume, step change, completion and missing-program behavior. Routine timing and program timing must have a clear relationship. Keep recording independent as the setup promises.

### A02 — Program section Edit taps are swallowed — high priority

**Observed:** tapping both Edit and the section title in the imported program did nothing. Keyboard Enter on the same Edit button immediately opened the editor. The source captures the pointer on the surrounding card on every pointer-down (`src/practiceTimeline/components/TimelineSectionCard.tsx:69`), before establishing that a swipe occurred. This can retarget the resulting click away from nested buttons.

**Impact:** a user can add a section, but ordinary pointer interaction cannot reliably reopen it for editing. The same capture surrounds More actions and Start here; those controls require the same regression checks.

**Acceptance:** capture only a recognized swipe, or exclude interactive descendants. Verify tap, mouse click, keyboard, swipe-delete and drag-reorder together, including an actual iPhone touch test.

### A03 — Sharing/importing a mixed-meter program silently moves tempo changes — high priority

**Reproduction:** the supplied `.btroutine` has a 4/4 + 3/4 pattern repeated eight times (16 bars), with a 132 BPM pin at bar 12. Export then parse/import it. The pin becomes **bar 4**, without a warning. The browser editor also showed Bar 4 after import.

`src/practiceTimeline/storage/routineFile.ts:377` bounds advanced settings using `bars * repeatCount` (4 here), rather than the effective pattern length (16). The same parser is used for programs embedded in `.btplan` files.

**Acceptance:** retain bar 12 through standalone and embedded round trips; cover both cycle-based and bar-based patterns, repeats and beat-positioned pins. Any deliberate correction must be reported to the user.

### A04 — Missing backing audio can still produce a successful export — high priority

**Reproduction:** native diagnostic render with a valid video and a nonexistent backing CAF path returns success and produces a normal MP4 containing only the video take's audio (`native-export/missing-backing.mp4`).

`ios/App/App/BestTakeAudioPlugin.swift:1231` adds backing audio only if an audio track can be read; the missing/unreadable case has no rejection. The preceding web asset fetch also does not check HTTP success (`src/multitrack/export/multitrackExport.ts:31`).

**Impact:** an export can omit accompaniment without telling the musician. This differs from the explicit, intentional YouTube-backing warning.

**Acceptance:** reject missing/corrupt/unreadable uploaded backing audio with a useful relink message; reject failed asset downloads before caching them. Confirm success only after the intended video and audio are present. Test export to library and export to the native share sheet separately.

### A05 — Incorrect primary trumpet fingering in the upper chromatic lesson — high priority for teaching content

The generated lesson tells the student to play written B♭5 open. Yamaha's published chart gives first valve; its high A♯/B♭ image was inspected visually. The table includes MIDI 82 as an open partial (`src/labs/learnInstrument/instrumentData.ts:663`), using the poorly tuned seventh harmonic as if it were an ordinary primary fingering. Adjacent A♭5 and A5 are generated from that partial too, as first valve and second valve respectively.

**Acceptance:** use verified primary fingerings for this register; label deliberate alternates and their tuning caveats. Check A♭5, A5 and B♭5 against the chart, then review the other generated brass tables note by note. This finding concerns the upper chromatic course, not a claim that the beginner trumpet scale is wrong. [Yamaha trumpet chart](https://www.yamaha.com/en/musical_instrument_guide/trumpet/play/play002.html), [high B♭ fingering image](https://www.yamaha.com/en/musical_instrument_guide/common/images/trumpet/fingering29.gif).

### A06 — Euphonium's default notation and its lesson do not agree — medium priority

Onboarding offers a single “Euphonium / baritone” choice, then Home shows written B♭ with the octave displacement. `instrumentProfiles.ts:82` selects treble-clef transposition; `src/labs/practiceGameInstrument.ts` maps this to `euphonium-treble` for games but to the bass-clef `baritone` lesson in Learn.

**Impact:** a bass-clef student may see the wrong written pitch in the tuner; a treble-clef student can be sent into a bass-clef lesson. Both notation conventions are legitimate. [Yamaha's explanation of euphonium/tuba notation](https://www.yamaha.com/en/musical_instrument_guide/tuba/trivia/trivia012.html).

**Acceptance:** let users select their notation convention, carry it consistently through tuner, games, routines and lessons, and explain when a lesson does not support their convention.

### A07 — Shared-routine import silently loses or changes program content — medium priority

Deleting a referenced program attachment from a `.btplan` still returns success and nulls the step's program ID without warning. An embedded program with an unsupported meter is corrected to 4/4, but the parser's warning is discarded. See `file-probes.json` and `src/utils/practiceRoutineShare.ts:124`.

Avoiding accidental binding to an unrelated local ID is correct. Silent degradation is the defect. Preserve compatibility with older files while telling users exactly which attachment is absent or adjusted.

### A08 — Standalone program import does not handle storage failure consistently — medium priority

Injecting a quota failure into standalone import throws “Quota exceeded”; it does not return a user-readable failure. The standalone save writes the library and active ID separately (`src/practiceTimeline/storage/timelineStorage.ts`). Its callers need complete error handling and rollback. In contrast, the `.btplan` library-write failure probe returned an error and restored previous state successfully.

The native file-open handler also marks a URL handled before its read/import succeeds (`routineFileOpen.ts:136`), suppressing a retry of that URL during the process lifetime. This latter retry problem is source-reviewed, not reproduced through iOS Files.

### A09 — Imported meter validation accepts JavaScript object property names — medium priority

The parser accepts `__proto__`, `constructor` and `toString` as meters with no warning. It tests membership with `in`, which includes inherited properties (`routineFile.ts:127`). Use an own-property or explicit supported-meter check. These values do not describe valid time signatures; downstream playback behavior was not certified.

### A10 — Instrument scope needs clearer limits — medium priority

- The F transposition description incorrectly includes alto recorder (`src/utils/tunerTransposition.ts:143`). Standard alto-recorder notation is nontransposing, despite the instrument being described as “in F.” Correct the description. [American Recorder Society reference](https://americanrecorder.org/docs/AR_Mag_February_1976_Multipage.pdf).
- Current detection bounds exclude a five-string bass's low B0 (30.87 Hz), piano A0 (27.5 Hz) and C8 (4186 Hz), and piccolo C8. This is confirmed against actual selected profiles in `instrument-probes.json`. It is a support/labeling gap, not proof that every note within the bounds tracks reliably. [Yamaha five-string bass](https://hub.yamaha.com/guitars/bass/back-to-bassics-benefits-of-a-five-string-bass/), [VSL piccolo range](https://www.vsl.co.at/academy/woodwinds/piccolo).
- The tuba lesson uses BB♭ fingerings and the horn lesson uses single-F-side fingerings. Clearly name those variants; do not imply coverage of all tuba keys or both sides of a double horn. Recorder lessons likewise need an explicit fingering-system scope.

## Multitrack and editing: what the output evidence establishes

All successful files below used the diagnostic decoration bypass, not the unchanged production render path.

| Case | Inspected result |
|---|---|
| Two tracks | 4.000 s; 1080×1920; red left/blue right decoded frame; both 440 and 880 Hz present at approximately 0.2 amplitude |
| Second muted | 4.000 s; 440 Hz retained; 880 Hz approximately 0.000000014 amplitude |
| Trim 1–3 s, offset −1000 ms | 3.000 s; opening silence and black frame; 440 Hz present after the delayed entry |
| Trim 1–3 s, offset +500 ms | 1.500 s; expected remaining audio present |
| Missing backing | Incorrectly succeeds; see A04 |

Evidence: `native-export/results.json`, five MP4s, decoded PNG frames, original extracted renderer, diagnostic renderer and harness source. The original production-path simulator crash is preserved in `original-renderer-simulator-crash.ips`: Core Animation postprocessing → IOSurface/XPC trap. This does **not** establish that the app crashes on a physical phone.

Editing source review found an additional failure-path concern: `MultitrackOverlay.tsx:1243` commits trims before awaiting offset storage, and `MultitrackAlignStage.tsx:506` clears its saving state in `finally` without showing an error. A failed save can therefore leave only some edits applied. This needs an injected-storage-failure interface test before calling it fully reproduced. Cancel's restoration of trims/offsets/section windows is present in source; its full UI behavior has not been verified.

Do not count the successful diagnostic files as verification of sheet-music overlays, timed image changes, rotations, live-to-export visual equivalence, export progress/cancellation, sharing, or saving the rendered take into the library.

## Remaining verification before a paid launch

1. Repair A01–A05 and rerun their exact reproductions; rerun affected file and routine checks. Resolve A06–A10 or explicitly constrain the supported feature/instrument scope.
2. Complete a native-device record → stop → review → trim → save → reopen → share → play-in-another-app loop. Browser recording-start attempts in this session returned to idle without a recording; logs ended at stream preparation. This is an unresolved observation, not a proven native-device defect.
3. Complete the multitrack UI loop: import/record multiple takes, change layout, align, trim, cancel, save, reopen, adjust gains/mutes, add/remove backing and sheet cues, export to library, export through Share, and inspect both outputs. Include unequal clip lengths, positive/negative offsets, missing files, backgrounding, interrupted export and low storage.
4. Test actual iOS Files/Messages handoff of `.btroutine` and `.btplan`, repeated opening, malformed/future versions, storage failure and restart persistence. Sending to real people was not part of this audit.
5. Finish every game/settings/library interaction checklist and responsive/accessibility checks. The existing helper scripts are useful coverage, but they do not constitute an every-click audit.
6. Check live instrument behavior with at least one representative from woodwinds, low brass, strings/plucked strings and voice, with real phones and rooms. Verify low/high notes, attacks, vibrato, soft playing, octave errors, headphones and speaker bleed. Per-instrument range/transposition arithmetic cannot establish microphone reliability or pedagogical appropriateness.
7. Verify purchases separately in StoreKit/TestFlight: entitlement granting, restoring, reinstall/offline behavior, canceled/invalid/redeemed offer codes and cosmetics. The promo-code entry point alone does not implement or validate these systems.

## Test failure interpretation

The one existing failure is `verify-tuner-history.mjs`: the test requires the oldest sample to remain strictly within 120 seconds at every append. The implementation prunes only once per second, so it can temporarily retain samples slightly older than that limit. Classify this as a retention-contract/test mismatch pending a decision, not as evidence that tuning is inaccurate.

## Reproduction

From the repository root, run `node release-review/2026-09-13/full-audit/probe-files.mjs` and `node release-review/2026-09-13/full-audit/probe-instruments.mjs`. These bundle the current production helpers and write their observations alongside this report. The baseline and additional result files name every existing script that ran. The native harness README describes the more limited export reproduction.

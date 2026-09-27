# Practice routines, games, and tools QA

Source-based control inventory: [inventory-practice.json](inventory-practice.json), 23 items. Items covered by the live pass are marked `partial` or `failed`; all others remain `untested`. Utility checks validate code paths only, while the separate observations below describe the running app.

## Focused utility verification

Ran on the current uncommitted working tree with `node scripts/<name>.mjs`:

| Script | Result | Scope |
| --- | --- | --- |
| `verify-practice-routines` | Pass | Routine storage, daily progress, step reconciliation, tool defaults |
| `verify-routine-preset-tools` | Pass | Presets and goal plans |
| `verify-routine-music` | Pass | Score attachment and routine settings serialization |
| `verify-routine-music-share` | Pass | Shared routine music placeholders |
| `verify-routine-program-share` | Pass | Linked metronome program sharing |
| `verify-staff-jumper-difficulty-ranges` | Pass | Instrument difficulty ranges |
| `verify-staff-jumper-review` | Pass | Generated rhythm, pitch, and layout rules |
| `verify-metronome-background` | Pass | Click pause/resume model around listen-back |
| `verify-tuner-stability` | Pass | Accelerated tuner buffer simulation |
| `verify-drone-transitions` | Pass | Drone state command ordering and recovery |
| `verify-drone-renderer` | Blocked by host AVFAudio initialization | The test's Swift executable aborts at `AVAudioMixerNode init` before renderer assertions: `com.apple.coreaudio.avfaudio`, `required condition is false: comp != nullptr`. This is not evidence of an app behavior defect. |

## Live app findings

The root agent's exclusive QA browser session observed the following on the current app build:

- **ROU-02 failed, suggested-routine entry:** From Practice Home with Trumpet selected and no active routine, click **Try a suggested routine** (subtitle **Start with a plan you can edit**). The destination title is **Your routines** with the saved-routine list. It should open the **Suggested for trumpet** plans directly. Clicking **New routine** from that list reaches the suggestions, confirming the destination exists. The source passes `presets` from `PracticeHub.tsx:498-501` but `MusicRoutineBuilder.tsx:164-169` forwards `build` to `GuidedRoutineBuilder`, whose initial screen for `build` is `routines` (`GuidedRoutineBuilder.tsx:72-77`). Reproduction is captured by `node scripts/practice-qa/regressions/suggested-routine-entry.mjs`, which currently fails with `data-guided-mode="build"` when it expects `presets`.
- **ROU-01/02 partial, saved routine:** In the same QA session, **New routine → Fundamentals → rename to QA Fundamentals → Save for later** produced a saved Trumpet routine. Reloading the app kept Trumpet selected and the routine available. The suggested-routine entry issue above does not prevent creation through **New routine**.
- **ROU-05/07 partial, running step:** Starting **QA Fundamentals** opened its first tuner step with A440 and drone shown. **Pause** changed the routine to **Paused** and silenced the drone. **Resume** and **Done & next** advanced the session and left progress visible. This pass did not independently measure audible pitch or persistence of elapsed time across another reload.

The prepared QA tab could not be bound from this subagent's computer-use session: `getTab('tab6', { browser: 'browser1' })` returned `Browser is not available: browser1`, browser inventory was empty, and creating an `iab` tab returned `Browser is not available: iab`. Native Chrome exposed an unrelated personal New Tab, which was not changed. The live observations above were relayed by the root agent; no game or standalone metronome/tuner/drone controls were reported as exercised in this scope, so those remain untested.

No application source was edited for this QA pass.

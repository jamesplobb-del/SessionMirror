# BestTake release baseline and approval brief

**Latest owner direction:** Keep BestTake recognizable and preserve its arcade identity. Broad redesigns were too drastic; the font/color-only pass was too slight. Explore meaningful card, icon, spacing and modest layout changes in concepts before implementation. No cosmetic change is approved for the app.

Captured September 8, 2026 at 13:08 EDT (17:08 UTC).

## Established baseline

- Shipping branch: `launch-prep`, commit `b65317b7326a851fce3d87869030faa7698d0439`, plus the working changes captured in this folder.
- Captured 583 files in `source-baseline.tar.gz`; SHA-256 checksums are in `baseline-manifest.json`. Separate staged and unstaged patches and the working-tree inventory are preserved here.
- Captured source was checked for changes during copying. Tests ran on a separate copy, not the actively edited application checkout.
- All 11 regression scripts passed. Details: `regression-results.json`.
- TypeScript and the production web build passed. Details: `build.log`.
- The build retains a bundle-size warning: the largest App chunk is about 612 kB minified / 173 kB gzipped. This is an investigation item; the warning alone does not prove slow startup or crashes.
- The snapshot excludes ignored files, credentials, installed dependencies, generated builds, and local recordings. It is a source baseline, not a backup of personal recordings. Checks reused the installed dependency tree with separate temporary caches.
- This build used no private environment configuration, no synthetic media flag, and no Sentry upload. Live reference-service configuration and production diagnostics remain separate release checks.
- Local Git references show `launch-prep` contains local `main` and is 61 commits ahead. No remote refresh was performed; this is not a claim about current GitHub state.

Another task, “Optimize BestTake practice workflow,” was active in the same checkout when this pass began. Its captured changes remain intact. Later edits must be compared with this manifest before the final release gate. No branch switch, merge, commit, source refactor, app styling change, or change to existing recordings was made in this baseline/concept pass.

## Reconciled backlog

“Implemented” below means source and existing automated evidence show work is present. It does not mean the full physical-device release pass is complete.

| Workstream | Current baseline | Next required work |
|---|---|---|
| Audio reliability | Tuner cancellation/recovery and shared microphone safeguards are implemented and covered by checks. | Verify coexistence with metronome, drone, recording, games, reference playback, and backgrounding on iPhone. Investigate restarts using device evidence. |
| Hands-free | Fresh-frame gating, quiet baseline, silence handling, playback generation protection, and visible cycle states have checks. | Verify deliberate arming/cancel, accidental triggers, screen changes, interrupted inputs, and repeated takes. |
| Record → review → retry | Existing recording and comparison behavior remains. | Verify complete save/listen/keep-best/retry/relaunch flows and tool restoration; polish their presentation only after concept approval. |
| References | Search and pasted links exist; shared result cards now have thumbnails. Library/passage helpers have checks. | Resolve the local live-search connection failure; verify a playable video, saved passages, unavailable videos, offline/quota states, and recording transitions. |
| Routine execution | Play/Pause and Done/Next are simplified. Timing and persistence have regression coverage. | Verify preset restoration and screen transitions on a stable device build. Fix the routine bar obscuring navigation/content. |
| Desk/exercise-history removal | Desk controls and routine exercise-journal entry were removed in earlier work. Old recordings were preserved. | Check remaining UI wording and access paths, without deleting historical data. |
| Instrument behavior | Selection applies detection family, written transposition, and trigger gate. | Correct the confirmed strings low-note/octave problem; audit range/transposition propagation and rhythm-focused behavior across tools, routines, and games. |
| Home | Quick start, routine access, tools, Vault, and new daily challenges exist. | Approve a common visual direction; establish hierarchy and shorten supporting copy. |
| Routine builder | Saved/custom/preset routes, tool settings, and optional references exist. | Approve the summary-first preset concept and reduce repeated configuration/explanation. |
| Routine widget | Simple controls are implemented. | Establish reserved layout space and shared appearance; verify active/paused states on all destinations. |
| Take Vault | Existing takes, folder organization, library, and management actions remain. | Approve Recent/Favorites emphasis, helpful empty state, and simplified secondary actions. |
| Session finish | Routine completion/progress data exists. | Approve and build the concise finished-session presentation; verify totals and preserved takes. |
| Games | Staff Jumper, Balance, Learn, character work, and daily challenge work are present. | Preserve the intentional arcade personality. Approve a shared shell, less crowded selection, concise instructions, and appropriate first-play guidance. |
| Onboarding/help | Routine Help and Record tab wording were corrected in the previous audit pass. | Replace the outdated overall tour with current contextual guidance; verify every instruction against an actual reachable action. |
| Native interaction quality | Shared sheets, buttons, motion, haptics, and native audio/camera integrations exist. | Consistent Back/Close, gestures, keyboard behavior, sheet focus/dismissal, larger text, reduced motion, and iPhone responsiveness. |
| Distribution | Existing launch/store checklist is present. | Device release pass, crash symbolication and delivery, support/privacy destinations, release metadata, and final-build testing remain. |

## Confirmed problems versus proposals

Confirmed in the earlier audit: routine controls cover navigation at phone width; strings range normalization produces the wrong octave for low cello/bass inputs; current routine Help previously described the old Program editor (now corrected); live search failed in the local preview.

Design proposals requiring owner approval: unified typography and surface system, screen/navigation arrangement, simpler preset setup, reduced wording, Vault hierarchy, game menus, first-run experience, and completion presentation. These must not silently become implementation tasks merely because a concept was generated.

Not demonstrated as defects: the app's file sizes by themselves, a need for a full rewrite, and intermittent navigation changes observed while another task was editing the app. The older PRs are an optional reconciliation item; no old PR should be merged as part of this design pass without reviewing its current difference from this baseline.

## Revised visual approval brief

The current approval preview offers **Studio** and **Playful** directions applied to the captured Home, Routines and Games screens. These are new code-based directions, separate from the rejected broad image boards. Existing actions, navigation destinations, game artwork and characters remain.

Studio groups tools into compact rows and places daily goals in a clear card. Playful pairs the two starting choices and uses colorful icon buttons and tactile shapes. Both retain the app's blue/gold identity and build on the font cleanup. The earlier font-only treatment remains available for comparison.

The preview is available at http://127.0.0.1:5190/refinement-review.html. Home, Routines and Games buttons open matching screens in both panels. Other screens retain baseline styling. The left panel always shows the baseline; the right shows the selected concept.

Only the separate temporary preview copy and review artifacts changed. No production UI changes are approved. These concepts do not certify native animation quality, dark mode, larger text or physical-device behavior. Those remain implementation/release checks after the visual direction is selected.

Files and reproduction notes are in `refinements/`. Earlier generated boards and prompts are superseded and retained only as history.

### Playful main-tab extension

The owner liked Playful and requested concepts for the main tabs. The isolated preview now extends that direction to Record, Tuner, Metronome and the existing Games concept. This is permission to develop concepts, not production implementation approval. Main-tab selectors and visual states are reviewed in the local synthetic-media preview. Physical-device behavior and native motion remain separate work.

### Latest selected direction: Fresh + Playful Home

The owner chose the Fresh iOS-inspired concept and asked to carry forward the Playful Home composition. Fresh Original, Fresh Air and Fresh Depth now use the paired starting tiles, tool icon row and grouped daily goals. Air and Depth are the two newly requested alternatives. All three include Camera mode and the actual audio/camera bottom control pills. Camera and Record navigation, control-pill rendering and text contrast were reviewed in the synthetic-media preview. Production implementation is still pending concept approval.

### Vibrancy and Camera clarification

The owner requested more vibrant Depth options and tuner color suppression in the preview, then clarified that Camera take boxes and bottom controls must remain see-through. Added Depth Electric (blue/cyan/gold) and Depth Prism (blue/violet/gold), both inheriting the chosen Home layout. Fresh/Depth camera overlays now use transparent dark glass with light labels. Electric and Prism vary bar shape and highlights. The preview tuner-color toggle is off by default in both panels; live pitch analysis stays active. Toggle restoration and transparent camera surfaces were verified. These changes remain isolated to the review copy.

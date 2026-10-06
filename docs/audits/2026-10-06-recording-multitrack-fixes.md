# Recording and multitrack fixes

The seven requested fixes from the October 6 audit are implemented in the working tree. Browser recording startup remains outside scope, as requested. All 33 verification scripts, the TypeScript check and the production build pass. Physical recording, audible routes and complete native screen flows remain unverified.

## What changed

| Problem | Result | Source |
|---|---|---|
| Recording encoder failure was silent | One clear message explains that the take failed and tells the musician how to retry. Capture state resets, and stale callbacks cannot affect a replacement take. | [Capture callbacks](/Users/jameslobb/Documents/BestTake/src/hooks/useCameraSession.ts:1494) |
| A missing received track blocked the whole project | Healthy parts reopen with a missing-track placeholder. Its original source descriptor and project edits survive repeated saves, allowing reconnect or replacement. Thumbnail failures do not block the playable source. | [Project persistence](/Users/jameslobb/Documents/BestTake/src/multitrack/state/multitrackPersistence.ts:132) |
| Cancelling playback before route preparation completed left abandoned audio state | Final release waits for pending preparation and rechecks newer playback, camera and headphone owners before restoring capture. | [Stereo route release](/Users/jameslobb/Documents/BestTake/src/utils/stereoPlaybackRoute.ts:116) |
| Switching audio previews left an extra playback hold | Each start owns its cleanup. Superseded requests release only their own resources, and native starts and stops run in order. | [Native audio preview](/Users/jameslobb/Documents/BestTake/src/utils/audioModeNativePlayback.ts:37) |
| Shared front-camera parts lost mirroring | Project import retains the panel mirror flag, including after reopening against the original Vault take. | [Project importer](/Users/jameslobb/Documents/BestTake/src/multitrack/state/multitrackFile.ts:137) |
| Record ignored keyboard activation | Keyboard and assistive clicks activate once. Pointer and long-press compatibility clicks are suppressed. Disabling a held control cancels its timer, pointer capture and temporary listeners. | [Long-press controls](/Users/jameslobb/Documents/BestTake/src/hooks/useLongPress.ts:33) |
| Export cleanup could hide a finished video | Listener removal errors are logged without replacing a successful render path, an original render failure or cancellation. | [Export cleanup](/Users/jameslobb/Documents/BestTake/src/multitrack/export/multitrackExport.ts:281) |

## Corrections from independent review

The initial implementation was challenged before completion. That review caught activation after a control became disabled, stale recording callbacks targeting a replacement capture, and old playback completion finishing a newer request. These cases were reproduced or executed directly against the production callback logic and corrected.

Capture finalization now snapshots its stream and metadata, delivers a valid older take when saving completes, and cleans up its own resources without resetting a new recording. Delayed writer failures cannot abort or stop a replacement capture.

The native playback completion callback captures request and source ownership before awaiting route cleanup. It finishes only if that request and subscription still own the operation. Cleanup failure is handled without an unhandled rejection. [Completion ownership](/Users/jameslobb/Documents/BestTake/src/context/AudioModePlaybackContext.tsx:952).

The outdated iPad replay test now checks the actual shared-controller contract. This changes the test expectation rather than production replay selection, and lets the remaining cancellation and failure cases run.

## Verification

- **28 existing scripts passed**, covering handsfree cycles, recording handoff, playback, waveform, headphones, trim, guidance, gestures, multitrack recording/count-in/transport, sharing, recovery, geometry, previews and enhancement.
- **5 new scripts passed**, including 23 route and preview ownership cases and five completion-effect cases. Tests execute actual modules, hooks or extracted production callbacks with explicit React, storage, media and native boundaries.
- The combined source passed `tsc -b --pretty false` and `npm run build` with synthetic game input disabled.
- Owned-file whitespace checks passed with the repository files’ existing CRLF convention recognized.

The new regressions cover slow preview A followed by B, cancellation at each asynchronous startup boundary, surviving independent playback consumers, capture and headphone ownership, disabled controls during a press, late encoder callbacks, delayed writer failures, normal save completion during a replacement, missing and rejected shared-media reads, repeated autosave/reopen/reconnect, mirror exchange, export cleanup failure, superseded completion and teardown.

The browser writer requirement and storage implementation remain unchanged. A source comparison and fingerprints record the excluded behavior. Changes are local; no commit, release sync or deployment was performed.

## Remaining validation boundary

The prior isolated Simulator build and launch succeeded, but its screen reader exposed no interaction targets on the visible welcome screen. These fixes were therefore verified through source execution and build checks. No claim is made that physical microphone/camera capture, Bluetooth, interruption recovery, audible mixing or AVFoundation video output has been certified. The original [audit](2026-10-06-recording-multitrack-swarm.md) preserves that evidence and its historical findings.

Usage at the final fix checkpoint was **86% remaining**, above the requested **80% minimum**. Usage is shared across chats and can update after work completes.

[Evidence and reproducible scripts](evidence-2026-10-06-recording-multitrack-fixes/) include every check output, command status, the owned diff and source fingerprints. Run the archived scripts from the repository root or use their checked-in working-tree versions.

# Audio Enhance and multitrack release fixes

## Audio Enhance
- New native enhancement renders publish a separate file. The original is never replaced.
- When Audio Enhance is enabled, new native recordings retain their original take and add a named Enhanced copy to Vault. The current take remains the original, with optional live preview processing.
- Copies persist their processed flag atomically with the Vault entry, carry the rendered duration (including the audio reverb tail), and get independent pitch analysis rather than stale original contour data.
- Playback processing now checks the playing file, rather than guessing from the selected Current Take. Processed copies bypass live enhancement; other recordings can still preview it.
- Offline jobs are serialized. Missing/deleted originals are checked before rendering and before publishing. Failed copies clean up their new files; original recordings are not modified.
- A real native generated-tone test exposed a mono effects-bus format crash. The graph now converts mono input to stereo before effects. The native macOS test then passed, retaining an identical original and producing a valid 3.5-second AAC file from a 2-second input with reverb tail.
- Existing takes processed by older builds cannot have their original sound reconstructed by this change. Native and web effects remain different DSP implementations; real-instrument listening on iPhone belongs in the owner's device pass.

## Multitrack
- Export uses the same section visibility and grid calculations as the live canvas. Native video instructions change crop/transform/visibility at section boundaries. Timed sheet images follow changing music-panel geometry. Sections remain visual windows, matching the existing live behavior; they do not introduce a new audio mute rule.
- Imported backing audio, sheet music, and page cues are saved as durable IndexedDB blobs before metadata is committed. Reopening resolves fresh object URLs. Missing files show a recovery notice while preserving the rest of the canvas.
- Saves are serialized so slower file persistence cannot overwrite a newer edit. Failed saves are surfaced. Empty-library restoration uses an explicit loaded signal; editing waits until restoration finishes.
- Restored volume, BPM, count-in, trims and section boundaries are bounded/normalized.
- Native exports fail visibly when a panel cannot be rendered rather than silently omitting a failed video/audio track.

## Verification
- `release-review/2026-09-08/follow-up/audit-checks.mjs`: mixer and trim request mapping, section layout windows, deleted-take restoration, invalid saved controls, and enhancer parameter checks passed.
- Browser fixture `scripts/fixtures/multitrack-persistence.ts` ran in an isolated origin: revoked input URLs, saved/reopened audio and sheet blobs, cue timing, repeated reopening, missing-file recovery, invalid stored values all passed. No personal recordings were used.
- Native fixture `scripts/fixtures/enhancer-copy/main.swift` compiled with the real AudioEnhancerRenderer.swift and passed on macOS. This proves the tested native audio pipeline, not physical-iPhone behavior.
- Existing audio lifecycle, session extensions, and trim metadata checks passed.
- Final iOS sync/build results appended below.

The owner's device pass still covers long recordings, hands-free cycles, audible mix/sync and processed sound, fullscreen playback/pitch, and inspecting actual exported video on iPhone.

Final verification: production TypeScript/web build and Capacitor sync passed; all 72 web output files match the iOS public bundle by SHA-256; final unsigned generic-device Xcode build succeeded. Xcode workspace reopened for the owner's phone test. No phone installation or physical-device export/listening test is claimed.

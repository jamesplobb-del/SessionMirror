# Hands-free reliability and movable Tools status

User reports accidental playback, missed recordings, asks for advice when threshold is too sensitive and movable/resizable hands-free UI in Tools. Interpreted UI request as the hands-free status panel (existing pitch/metronome widgets have separate drag implementations). User builds/syncs Xcode themselves. No native build/sync performed. Preserve unrelated dirty work, especially tuner fixes user reports resolved.

## Implemented
- `useAutoSoundRecording.ts`: 450ms recorder-start failure timeout was shorter than realistic native setup. Increased to 3s, latch 3.5s, reset failed-start UI/pending gate and show a distinct start-failure notice. Cancel pending start if measured sound drops below threshold before recorder ready.
- Native listener returned after teardown now removed; setup rejection caught with cleanup and microphone notice. Native tap reference release tracked to avoid double release after cleanup. Preserve-capture setup no longer forces a web-only recording onto native path. Native camera preview not treated as missing WebKit microphone by eager recovery effect.
- Masked metronome transient now pauses silence accounting rather than being counted as quiet and ending a take. `handsFreeSilence.ts` adds pause.
- `handsFreeHealth.ts`: bounded diagnostics, warn after 6s blocked quiet-baseline arming or 3 short captures (<=1.5s excluding silence tail) within 60s. A long take clears short-take history. No automatic threshold changes or take deletion. Separate microphone and recording-start messages; microphone loss during recording reported without forcing capture teardown.
- `HandsFreeStage.tsx` + `useHandsFreePanelLayout.ts` + `hands-free-panel.css`: all Tools/audio screens have draggable status panel via Move handle, width resizing via corner handle, keyboard arrows supported. Existing local widget-position storage used; size session storage follows current widget utilities. ResizeObserver/window resize keep panel within viewport; width 220–420, constrained further for small screens. Phase updates reflow height. Camera keeps center treatment. Threshold notice links to existing hands-free settings card.
- `App.tsx`: passes notice and movable flag to status panel.

## Verification
- `node scripts/verify-handsfree-monitor.mjs` passes: REAL hook, deterministic mock microphone/React harness, 900ms recorder acknowledgement, repeated captures, one finish request per take, playback suppression, noisy arming notice, stale pending entrance cancellation.
- `node scripts/verify-handsfree-cycle.mjs` passes: jittered silence, missing frames, resumed playing, masked clicks, warning windows/reset, cycle phases.
- `npx tsc -b` and scoped `git diff --check` pass.
- Browser actual component fixture: Move drag changed panel (490,396) to (160,188); resize widened 300 to 400 with height reflow; Adjust start level callback observed. Fixture `scripts/fixtures/handsfree/`, preview server 5194.

## Limits and next checks
No claim of physical-device fix verification. Test Camera and audio Tools hands-free on phone: quiet arming, soft/hard entrances, long notes, 3–5 record/pause/replay cycles, metronome on, return from playback, threshold change. Near-continuous metronome masking may delay arming/stopping: use headphones to avoid acoustic click pickup. Failure-start timeout is 3 seconds, not an acknowledgement protocol; investigate native start logs if real starts exceed it. Test iOS pointer gestures and safe-area behavior. No broad redesign or native capture-engine changes made.

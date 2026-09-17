# iPad music workspace and recording parity — September 17, 2026

This pass builds on the existing uncommitted PDF import, ink, pitch-gate and multitrack work.

## Changed

- Full-screen music has a Workspace icon and horizontal Pitch / Metronome / Drone / Takes / Enhancer tray. It uses the same settings handlers as the regular Workspace. The score fits below the tray; controls cannot accidentally turn a page.
- Fitted half turns now keep the current bottom stationary and reveal the next top above it. The second turn changes the bottom. Forward/backward turns retain the same page nodes and canvases, including ink. Fill-width mode remains continuous scrolling. Neighbouring spreads are preloaded; off-screen canvases remain bounded.
- Rotation between a page and a spread preserves the reading row, including odd-length documents. A saved spread preference temporarily fits one page when the window is narrow.
- Tempo entry no longer stops the metronome. There is an explicit Apply tempo button for the iPad number keyboard. Control touches do not enter the widget's pinch tracking, and the shell can be dragged during playback. Music uses layout viewport dimensions so the keyboard does not shrink the widget boundary; visual-only resizes no longer request camera recovery.
- Multitrack Keep / Retry / next-box / Record use an awaited recording handoff: stop review and mix playback, finish native transport teardown, restore the recording route, then recover capture. Native stop/prepare/start operations are serialized. Cancelled Play All completions cannot tear down a newer recording's transport. Camera/save watchdogs no longer restart their timeout on every render. A failed capture start clears the app's multitrack capture ownership.
- iPad camera layer, JPEG preview and movie connections use the interface orientation. A movie keeps its starting orientation while the preview and controls can continue rotating. UIKit orientation is sampled on the main thread and passed safely to the capture queue. iPad no longer applies the portrait-locked phone's sensor-based control rotation.

## Native engine review

Camera is the engine with device-specific configuration: iPad capture uses the existing 1080p cap and a larger bounded preview bridge. The preceding audio-tap priority and fallback changes were preserved. Metronome, drone and multitrack derive timing from render formats; pitch uses the sample rate supplied by native capture. Decoder/alignment/enhancer use source sample rates. No separate iPad timing constants were introduced.

The existing iPad microphone gate relief is retained for voice, strings and winds. Tests confirm stable profile identity through split view, unchanged clarity thresholds and unchanged playback gates. Native detector tests pass at both 44.1 kHz and 48 kHz.

## Verified

- Production web build and native iOS Simulator build; final web assets copied into the iOS app. The final build completed, but its optional Sentry release/source-map upload could not resolve sentry.io.
- Browser UI at 834×1194, 1194×834 and 390×844: full-screen tray, half turns forward/back, tempo entry during playback, dragging after entry, and narrow-screen fallback.
- Canvas instrumentation: pages 1 and 2 kept their identities and redraw counts through tempo entry (120 → 96), dragging and a half turn. The next neighbour was loaded without redrawing either visible page.
- `verify-practice-chart`, `verify-practice-chart-ink`, `verify-widget-ball-placement`, `verify-ipad-parity`, `verify-multitrack-transport-handoff`, `verify-multitrack-upgrade`, `verify-multitrack-editor`, `verify-multitrack-native-read`, `verify-playback-route`, `verify-audio-lifecycle`, `verify-native-plugin-registration`, `verify-metronome-background`, `verify-drone-transitions`, `verify-native-tuner-receiver`, `verify-tuner-microphone-ownership`, `verify-tuner-stability`, and `verify-native-tuner-detector` pass.
- The multitrack suite exercises record/review/retry across twelve boxes, camera rejection, cancellation during camera/transport setup, and stale-start suppression. The new transport test delays the previous stop and verifies that the next prepare/start waits for it; it also covers retry after preparation failure.

## Physical-device verification still needed

No physical iPad microphone/camera test was performed. Check repeated Record → Stop → Preview → Keep → next box and Retry on device, with speaker and headphones; confirm recorded file orientation in both landscape directions and portrait; play into the tuner from normal stand distance. Browser checks cannot establish hardware audio latency, microphone sensitivity or native camera frame continuity. Mid-take rotation keeps one movie orientation rather than changing the video dimensions halfway through the take.

The descriptions of scrolling half turns in older portions of PRACTICE_CHART_HANDOFF.md are superseded by the stationary fitted-half behavior above.

References consulted: [forScore half-page turns](https://forscore.co/kb/half-page-turns/) and [Apple capture orientation](https://developer.apple.com/documentation/avfoundation/avcaptureconnection/videoorientation).

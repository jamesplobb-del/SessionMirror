# Multitrack recording fixes — September 19, 2026

## Changes

- Practice-overlay notice dismisses automatically after 4.5 seconds and has a dismiss button.
- Collapsed tuner/metronome widgets portal into their own overlay boundary, above the recording interaction guard. Expanded panels and balls share a coordinate space.
- Recording tools have text labels, 44px minimum targets, opaque backgrounds and readable selected text.
- Native recovery now resolves its bridge promise after the serial recovery operation finishes. Known stale audio pipelines participate in recovery and are rebuilt before starting a movie, even when the video preview remains live.
- Starting a take preserves the existing microphone preference unless the preference changed. Missing movie audio connections cause a clear error instead of proceeding knowingly without audio.
- Native multitrack playback/monitoring receives the current Audio Enhance settings. It uses the existing offline renderer and caches processed audio without modifying original takes. Already-enhanced takes bypass processing; backing audio and click remain unchanged. First playback with new settings may take longer to prepare. Export behavior is unchanged.

## Verification

- Production web build and iOS simulator compile passed (workspace build, signing disabled).
- Existing multitrack, transport-handoff, playback-route, audio-lifecycle, hands-free-monitor and widget-placement checks passed.
- Browser: opened a multitrack recorder, enabled each practice tool, expanded both balls, collapsed metronome again and verified the notice expires.
- `node scripts/verify-multitrack-enhancement.mjs`: current settings reach native parameters; disabled/baked takes bypass. On macOS, generated-tone processing proves the native effect changes the signal, preserves duration, remains audible and avoids clipping. This offline test requires access to macOS audio services; it never records microphone input.

## Physical-device verification still required

The reported failing route was Bluetooth / AirPods. A simulator/browser cannot verify that route.

1. Connect AirPods before opening multitrack. Record speech or an instrument for 10 seconds; stop and preview the saved take.
2. Keep, record another box, preview, retry, then record again. Confirm audible input and uninterrupted reference playback at each handoff.
3. Repeat with Auto, iPhone mic and headphone mic preferences. Check unplug/reconnect and app background/foreground between takes.
4. Expand/collapse both practice widgets while a real take records. Confirm controls remain visible and recorded output is unaffected.
5. Compare Audio Enhance off/on using the same original take, restarting playback after changing settings. Compare an already-enhanced take to ensure it is not processed twice.

The code changes address observed lifecycle defects; the AirPods symptom is not yet verified as resolved on hardware.

## Clarification: Audio Enhance report was regular Camera mode

The user's enhancement report concerned regular Camera recording, not multitrack.
Camera Current Take and Best Take cards selected native inline AVPlayer playback,
which bypassed the Web Audio enhancer even with the setting enabled. The separately
saved Enhanced copy did not change playback of the original card.

Both cards now subscribe to the enhancement setting (including amount changes)
and prepare native preview files with the rebuilt Natural processor. A toggle
resets playback; press Play again to compare. Pending native starts are invalidated
when settings or the selected take change. The live microphone/original recording
remains unprocessed, and separate Enhanced copies remain available.

See `AUDIO_ENHANCER_REBUILD.md` for the final processor, measurements, scope, and
listening acceptance checks. This supersedes the intermediate Web Audio preview fix.

Camera checks: TypeScript, playback-route and hands-free-playback regressions passed.
The enhancement test also checks toggle subscription and unsubscription. Listening
on the actual iPhone remains necessary to confirm the user's perceived difference.

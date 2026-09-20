# Natural Audio Enhance — September 19, 2026

Audio Enhance now prioritizes musical tone, attacks, sustain, and dynamics. It replaces the fixed voice/instrument EQ, compression, and synthetic reverb presets with conservative offline processing on iOS. Existing preset settings migrate to Natural at 60%. Originals remain immutable; newly recorded Enhanced copies are separate Vault entries.

## Processing

- Analyze the recording for at least 350 ms of quiet, stable, broadband ambience. Quiet notes alone do not qualify. If confidence is insufficient, skip denoising.
- Use overlapping spectral analysis with harmonic and transient protection, linked stereo masks, and smoothly varying attenuation. Reduction is bounded to 6 dB at maximum amount, and 1 dB below 120 Hz. These are per-bin ceilings, not promised measured noise reduction.
- Apply one constant gain to the entire recording, at most 4 dB at maximum amount (2.4 dB at the default). Leave encoding headroom. No moving compressor, gate, reverb, stereo widening, or fixed instrument EQ.
- Keep mono/stereo channel count and source sample count. AAC export uses the same processed PCM. Video remux preserves the video track.
- Amount zero bypasses processing in playback. “Match original volume” suppresses the added gain; peak headroom protection still applies.

## Playback and storage

Camera preview cards prepare cached native files and use the same processor as Enhanced copies. Shared native HTML-media playback and Audio Mode also prepare native previews. Native multitrack sources use this renderer. Already-baked Enhanced files are not processed again.

First playback can wait for an offline render. Replays reuse the cached result; setting changes use a new result. Preview files live in iOS Caches and are cleared on the next cold app launch. Rendering failures can retry. Changing settings or closing a pending native card cancels its playback intent, without stopping an unrelated card.

Browser-only playback remains original audio and says so in the controls. This implementation does not add processing to the full multitrack mix export; use saved Enhanced sources where enhanced exported tracks are wanted. Changing settings does not rewrite existing Enhanced copies.

## Verified

- TypeScript and production web build passed; web assets copied into the iOS project. Sentry sourcemap upload failed under the network-restricted build environment; local build output completed.
- iOS simulator compilation passed. Existing build warnings remain (including extension build-number mismatch and an AVAssetExportSession concurrency warning).
- Native generated-audio checks pass for clean low notes/harmonics/vibrato/decay, very quiet sustain, percussive decays, stereo phase, exact duration, zero amount, silence, one-sample input, constant gain, and AAC output.
- Default-strength synthetic stationary-noise fixture: background RMS changed by -1.42 dB; musical-passage RMS changed by -0.001 dB. Clean musical signals remain within 0.002% relative RMS error in PCM tests. These are engineering checks, not perceptual equivalence to Dolby On.
- Preview bridge checks cover deduplication, original/baked/remote bypass, failed-render retry, owner cancellation, and setting changes during processing.
- Playback-route, audio-lifecycle, hands-free-playback, multitrack transport, widget placement, and 1,417 multitrack assertions passed.
- Browser inspection verified Natural controls, amount, volume-match option, and platform messaging.

Run `node scripts/verify-multitrack-enhancement.mjs` on macOS with access to system audio encoding services for AAC checks, and `node scripts/verify-natural-preview.mjs` for the bridge tests.

## Listening acceptance still required

Compare the same real recordings with Enhance off/on and volume matching enabled: bowed/plucked strings, winds, piano, percussion, low notes, vibrato, soft sustained notes, and long decays. Include quiet rooms, fan hiss, and recordings without an ambient lead-in. Listen for watery textures, lost breath/bow detail, shortened sustain, or altered attacks. Compare against Dolby On at matched playback volume. If uncertain whether sound is noise or musical detail, preservation takes priority.

This is a conservative cleanup implementation, not a claim of Dolby parity or guaranteed superiority to the iPhone recorder. AirPods input and post-recording route recovery from the original bug report still require physical iPhone testing.

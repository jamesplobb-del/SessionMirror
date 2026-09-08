# Audio stability change

The current change bounds native tuner PCM delivery through the Capacitor/WebKit bridge to three unacknowledged frames. The existing native encoder backlog limit ended at `notifyListeners`, before WebKit actually consumed a payload. That left downstream message accumulation possible under load.

JavaScript now acknowledges each received frame, including malformed frames and frames arriving after a tuner graph closes. One process-wide listener remains registered; individual graph callbacks are removed on unsubscribe. Idle delivery skips decoding. The native mic recording and spoken-feedback path remain independent of the UI delivery bound.

No display FPS, canvas resolution, PCM sample rate, detection settings, metronome sound, or drone waveform was changed. Tuner, metronome, and drone can still run concurrently through their existing session configuration.

Run `node scripts/verify-pitch-delivery.cjs` for the 1,000-switch subscription regression. It checks single listener ownership, no callbacks to disposed graphs, and acknowledgements for active, late, and malformed events.

Ship native and web changes together: `ackNativeAudioPitchFrame` is a new native plugin method. This is a bounded-delivery fix, not a confirmed diagnosis of the reported restart. A physical-device sustained run with tuner, metronome, and drone together and a matching iOS termination report is still needed to distinguish memory termination, a native crash, and WebKit process termination. No restart report was available locally during inspection.

Concurrent work: camera fixes were explicitly left to Claude. This change touches `BestTakeAudioPlugin.swift`, `audioSessionRoute.ts`, and `nativeAudioPitchTap.ts`; preserve other edits when syncing or building.

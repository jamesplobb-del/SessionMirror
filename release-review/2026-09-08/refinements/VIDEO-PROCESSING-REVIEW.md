# Post-recording wait review
2026-09-08. Read-only recording-pipeline audit; no pipeline changes or device benchmarks.

Selected game direction: Arcade Pop (user choice).

## Evidence
NativeCameraRecordingEngine.swift matches the current original checkout byte-for-byte. The installed binary/version was not verified.
- finishStopPostProcessing waits for optional leading trim, then fallback audio mux, then finalizeStopResult.
- trimVideo uses passthrough export. Avoiding unnecessary physical trim could help hands-free, but playback offsets/duration/exports must stay consistent.
- muxFallbackAudioIfNeeded skips mux when an audio track exists. If absent, it builds a composition and exports at HighestQuality, potentially re-encoding a long video. Investigate compatible passthrough with validated fallback; do not bypass audio recovery.
- buildStopResult synchronously calls NativeCameraTestAudio.measureLevels before completion. The reader decodes PCM and scans up to 45*48000 sample values (not necessarily 45 seconds for all sample rates/channel counts). This blocks stop completion. Consider collecting equivalent levels during capture or moving analysis off the completion path, preserving gain metadata and avoiding volume changes mid-replay.
- App.tsx optionally normalizes landscape video before saveTake. The orientation correction path in prepareTakeVideoExport uses canvas/MediaRecorder and plays the video through to completion. Only runs if orientation dimensions need correction; potentially very expensive for long affected takes.
- App already releases pending save state at successful persistence. Thumbnails and enhancer baking are not simply awaited as part of that database-save gate. Do not claim moving thumbnails alone solves this wait.

## Safe order
1. Add stage timestamps on device: stop requested, writer closed, trim complete, fallback mux complete, levels complete, library save complete, first replay frame.
2. Remove level analysis from the critical wait, maintaining stable gain metadata and mandatory saved-file/audio checks.
3. Try copy/passthrough for compatible fallback mux cases; keep the existing recovery fallback and verify audio/video synchronization.
4. Investigate orientation metadata at capture, retain correct in-app playback and export; avoid replay-and-record correction on every affected long take.
5. Assess metadata-based hands-free leading trim as a separate change with marker/duration/export tests.

Benchmark 30-second, 3-minute and 10-minute recordings: portrait/landscape, manual/hands-free, normal/fallback audio. Check first/last frames, full duration, audio presence/sync, replay volume, repeated cycles and interrupted saves. No measured speedup or universal guarantee is claimed.

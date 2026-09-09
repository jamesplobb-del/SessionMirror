# Recording performance — isolated review change

Implemented only in `/private/tmp/besttake-refinement-preview-20260908`; production checkout and installed app are unchanged.

## Changes
- NativeCameraTestAudio decodes the existing analysis window once, retaining float samples for the existing peak-gated active RMS calculation. Same window/chunk boundaries, threshold, RMS math, and gain payload; transient storage is approximately 8.7 MB plus a decoder chunk at default settings (array capacity may exceed logical size).
- NativeCameraRecordingEngine logs stop-request, writer completion, trim, fallback-audio recovery, level analysis and result completion timestamps. Timing resets after finalization.
- No changes to trimming, recovery mux, orientation conversion, save protection or replay ordering.
- App.tsx ControlDeck prop: `onOpenVault={isAudioPracticeTunerTab ? undefined : handleOpenVaultFromPracticeHub}`. Hides the bottom Vault entry in Tuner.

## Validation
- Browser confirmed no bottom Vault button in Tuner and retained Vault access in Record.
- Before.swift and After.swift contain extracted production analyzer methods for comparison. main.swift expects silence.wav, dynamic.wav and long-stereo.wav under /tmp/besttake-level-bench. The macOS AVFoundation test could not read the generated fixtures, including with broader media-service access; no numerical or speed result is claimed.
- Swift syntax parsing passed for both edited native files.
- Simulator build first failed because the isolated copy lacked Pods. After copying existing local dependencies, the build tool timed out at 300 seconds while compiling dependencies; no successful full build is claimed.

## Required device validation
Record short and several-minute camera takes, including hands-free stop/replay. Compare saved duration, audio/video sync, playback gain, recovery after interrupted recording, and stop-stage timings. Validate landscape normalization separately. This optimization removes redundant decoding; it does not establish an end-to-end latency improvement yet.

## Next approved design directions
Arcade Pop for games. After recording validation: fullscreen playback polish, premium launch, and futuristic app-icon/logo concepts in the existing colorway, all reviewable before production implementation.

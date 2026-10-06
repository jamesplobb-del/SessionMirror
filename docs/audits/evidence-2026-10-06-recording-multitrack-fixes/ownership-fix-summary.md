# Native playback ownership fixes

Authorized scope: stereoPlaybackRoute.ts, audioModeNativePlayback.ts and verify-native-playback-ownership.mjs only. Unrelated concurrent changes preserved; no commit, deployment or hardware/UI actions.

Stereo final release shares pending reconciliation, awaits in-flight native apply, and rechecks surviving/new consumers after camera-state read. A newer player awaits an already-started restore and reapplies playback before starting. Camera preview/capture, pending video mode and headphone profiles remain owned by their respective sessions. Test reset now explicitly rejects pending transitions.

Audio mode native playback owns an idempotently released route lease per start, checks cancellation after file/route/preview awaits, and serializes native starts/stops. A late abandoned native start stops before its replacement starts. Stop and natural completion release only the corresponding attempt; stale cleanup cannot consume a newer or independent route hold.

Validation: 23 current actual-module ownership cases PASS (native bridge, URI, preview and route are explicit ports). Existing verify-playback-route.mjs PASS; verify-audio-lifecycle.mjs PASS. TypeScript `tsc -b --noEmit` PASS. CRLF-aware `git -c core.whitespace=cr-at-eol diff --check` PASS. stereoPlaybackRoute.ts retains original CRLF; default diff-check flags CR characters as trailing whitespace. Native acoustics, microphone/camera and OS interruption remain unverified.

Evidence: native-ownership-fix.log, ownership-fix.diff, ownership-fix-source-hashes.json. Root owns the independent review and combined regression suite.

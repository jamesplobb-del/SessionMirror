# Native completion replacement fix

Before: executed the actual registered effect extracted through the TypeScript AST with deferred releaseAudioModeNativePlaybackRoute; advance request/source before cleanup resolves. Assertion fails because old callback finishes replacement.

After: capture request generation/source before cleanup; check both plus subscription liveness after await before finishNativePlayback or onEnded. Cleanup rejection is caught/logged and ordinary completion remains intact. Teardown invalidates pending completion without changing newer requests.

Scoped changes: src/context/AudioModePlaybackContext.tsx and scripts/verify-native-playback-ended-ownership.mjs. Five actual-effect fixtures pass: changed-source replacement, same-source new generation, normal plus duplicate end, teardown, rejected cleanup with no unhandled rejection. TypeScript and CRLF-aware whitespace checks pass. No native device UI or acoustic claim. Root owns independent replay.

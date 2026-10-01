# Pitch Insights and games fixes — October 1, 2026

The user authorized implementation after the [initial audit](2026-10-01-pitch-games-audit-swarm.md), with Learn retaining its beginner tuning allowance and Staff Jumper requiring headphones for the drone or metronome.

## Implemented behavior

- Pitch Insights resets the selected pitch group and local day, preserving unrelated observations. A synchronous reset boundary discards affected unfinished tones; queued saves settle before deletion, and new tones save afterward. Held pre-reset notes cannot immediately reappear. Note names and register commentary use the selected written-pitch context; All is labeled concert pitch. Single-group history remains reachable after changing instruments. Pending reads cannot refill a reset screen with stale history.
- Balance says “Run finished” for incomplete runs and “Routine complete” only when the existing completion condition is satisfied.
- Learn retains the inclusive ±80-cent recognition window. Its source, lesson progression and completion wording were left unchanged.
- Staff Jumper matches the exact written MIDI note, including octave and instrument transposition. Gameplay, onset/release tracking and visible feedback agree; a same-class wrong octave shows “Try again.”
- Staff Jumper blocks drone/metronome startup, resume and retry without a confirmed headphone output. Unknown, speaker and AirPlay routes fail closed. Wired headphones work automatically; Bluetooth requires the player to confirm headphones because Bluetooth may also connect to a speaker. Confirmation is tied to the connected device and revoked when the route changes. Silent practice remains available, including a silent count-in labeled “Get ready.” Shared desk tools are stopped while unconfirmed output is active in Staff Jumper.
- Headphone loss pauses sounding runs and requests audio cleanup. Native route events include device changes as well as port changes. Audio startup checks cancellation after awaits; native drone startup, retuning, stop and restoration are serialized with ownership checks. Cancelled runs cannot overwrite a newer run or lose the original tuner snapshot. Partial native startup is cleaned before web fallback. Web output is disconnected immediately on stop.

## Verification

- `pitch-insights-2026-10-01.mjs`: 30 passing expectations, including held-note reset, queued INSERT → DELETE → INSERT ordering, source/day boundaries, unaffected candidates, written labels and filter visibility. Actual tracker/repository modules use a controlled SQL mock; React event wiring and filter predicates also have explicitly labeled source checks.
- `game-feedback-2026-10-01.mjs`: passes actual Balance reducer/result rendering, Learn boundary recognition, transposed Staff Jumper pitch helpers, actual Staff Jumper feedback rendering, and mocked route-loss/deferred-handle callbacks.
- `staff-jumper-native-drone-ownership-2026-10-01.mjs`: executes the actual audio module against stateful deferred bridge mocks. Covers cancellation during getState/Solo/Start, stale handles, stop/restore interleaving, native failure before web fallback, route loss during restoration, cancelled retuning and original-settings restoration.
- `staff-jumper-headphone-confirmation-2026-10-01.mjs`: executes the actual output store against mocked native routes. Wired headphones are automatic; Bluetooth is blocked until confirmation, device changes revoke confirmation, and AirPlay/speaker/unknown routes remain blocked.
- `verify-pitch-insights-capture.mjs`, `verify-staff-jumper-review.mjs` and `verify-rhythm-input-tolerance.mjs`: pass. Rhythm coverage includes 54,000 generated slots and 240 input-timing cases.
- Final TypeScript check and production build pass. The final build used `SENTRY_AUTH_TOKEN='' npm run build` to keep source-map upload out of validation. Earlier normal builds also completed; one logged a non-fatal Sentry upload failure. Existing chunk-size/dynamic-import warnings remain.
- Swift syntax parsing of the changed audio plugin passes. Targeted diff whitespace checks pass.

The actual app at disposable QA origin `127.0.0.1:5227` showed Play blocked without headphones, the drone toggle disabled, and “Practice without sound” starting a run. Pause → Settings returned with sound off and Play enabled. Pitch Insights opened with its existing saving-off preference intact. No populated-history deletion was performed through the UI. [Headphone gate screenshot](/Users/jameslobb/Documents/SessionMirror/scripts/practice-qa/results/pitch-games-2026-10-01/staff-headphones-required.png).

## Limits and usage

Mocked bridge operations do not validate real-device audio latency, microphone contamination, headphone unplug timing or native bridge failure recovery. Bluetooth confirmation is a player declaration, not detection that headphones are worn. Browser headphone output is unknown and therefore blocked for sounding Staff Jumper practice. Real instruments, native persistence across restarts, permission recovery and device interruption flows still need device testing. These checks do not certify a bug-free release.

The most recent reported allowance was 94% remaining in the main bucket and 100% in the reserve bucket, above the user's 80% floor. Reporting can lag and other chats share the allowance. Existing unrelated working-tree changes were preserved; no commit or deployment was requested.

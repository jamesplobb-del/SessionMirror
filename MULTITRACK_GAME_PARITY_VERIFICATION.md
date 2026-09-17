# Multitrack simplification and game parity — 2026-09-17

## Changes

- Recording review waits for the new take and the stop operation to finish. It never previews the old take while a replacement is saving. Stale preview loads are canceled and failures are surfaced.
- Close and Retry retain the unused take in the Take Vault. Discard take explicitly deletes it.
- Monitoring shows project-muted and zero-volume parts as unavailable with a reason; speaker click is labeled count-in only. Monitoring choices survive switching parts within the same project.
- Tempo is edited as a draft and applied on blur/Enter. Empty input restores the prior tempo.
- Record next part reuses an empty base slot or grows the grid automatically, without overwriting missing recordings.
- One Layout entry replaces the full toolbar preset strip. Common 2/4/6 layouts are first; all other layouts remain available. Project controls precede sharing; freeform positioning, extra boxes, and visibility timing are under Advanced composition. YouTube is separately labeled as a practice reference with approximate timing and no exported audio.
- Missing take identifiers survive autosaves and show replacement placeholders. Sharing/export do not silently omit unresolved required recordings.
- Staff Jumper uses a detector-delivery allowance before settling/advancing rhythm slots, wider easy/medium timing tolerance, and pitch-class matching in rhythm mode rather than rejecting the correct note for a small tuning offset. Repeated sustained notes accumulate recognition time inside their own slot.
- Staff Jumper observes its actual playfield size, including iPad rotation and split-view changes.

## Verification

- Production TypeScript/Vite build passes; Capacitor web assets copied to iOS. The final build's Sentry source-map upload failed because sentry.io could not resolve; app build and copy succeeded.
- 1,417 multitrack model assertions; actual recording-hook startup/review/retry for twelve parts; cancellation, camera rejection, native transport handoff, rendering payload, sharing round trips, native asset reads, and editor geometry pass.
- Added missing-source save/reopen/restore regressions. Existing source identifiers remain recoverable after autosave.
- 240 rhythm timing cases cover both meters, 60–200 BPM, short/long notes, difficulty, delayed input at the late boundary, and silence expiration. Existing 54,000 generated rhythm-slot checks pass.
- Isolated browser fixtures use production components and the actual Staff Jumper game hook. Tempo 120 → 96 stayed a draft during typing and committed on Enter; review actions were disabled while saving and enabled when the saved take arrived; Keep callback fired.
- Browser layout checks used phone 390×844, iPad portrait 834×1194, landscape 1194×834 and narrow split-view 400×834. Simplified project controls and layout changes worked. A final Staff Jumper run with simulated delayed pitch reached step 39, score 76, zero misses and 100% accuracy through narrow → landscape → phone resizing. An earlier iPad portrait run also retained 100% accuracy.
- Shared audio checks pass: iPad form-factor/orientation and pitch profile parity, 100 microphone handoffs, lifecycle recovery and audio-route restore, 10,000 compact native pitch results plus reopen cycles, and an accelerated eight-hour buffer test.
- Native pitch detector: 52 synthesized frequency/harmonic cases at 44.1/48 kHz, maximum error 1.384 cents; silence and 20,000-frame performance check pass.
- Balance, Learn Instrument and Staff Jumper use the shared live pitch tracker and game microphone recovery; code inspection found no separate iPad game scoring or capture engine. Balance already observes its scene size.

## Limits and device follow-up

Browser dimensions and synthesized input do not emulate an iPad microphone, Bluetooth route, thermal load or WKWebView interruption. No physical iPad/iPhone comparison was performed in this pass. On device, exercise all three games with the same instrument, rotate and resume after backgrounding, then record/keep/retry several multitrack parts with wired/Bluetooth monitoring and verify audible alignment and export. These remain hardware acceptance checks, not claimed passes.

Fixture: `scripts/fixtures/recording-rhythm/index.html` (add `?rhythm` for gameplay); use a separate local test origin to avoid real project storage.

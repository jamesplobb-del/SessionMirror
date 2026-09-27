# Live practice-session protocol

Use the actual application on the QA origin. Run all UI actions through the available browser or Simulator tools. Do not directly call app callbacks, mutate app stores, or manufacture success state. Source reading is useful for diagnosis, but does not replace an actual interaction.

For each case, record `id`, `status` (passed/failed/blocked/untested), `steps`, `expected`, `observed`, `evidence`, `scope`, and `remaining`. A passing case covers only its listed state and outcome. Untested sibling states remain untested. Record current source fingerprint and platform. Record failed waits as automation observations unless independently reproduced as product failures.

## 0. Establish media and data boundaries

1. Confirm the reserved test origin and source fingerprint. Start on an unused port for first-use cases, or reuse the existing QA library for persistence.
2. At `scripts/practice-qa/media.html`, Generate and save the 3-second sample; expect two live tracks, a nonempty saved WebM blob, decoded dimensions 640×360.
3. Reload, Reopen saved sample, then Validate playback and audio. Require nonzero audio RMS, positive playback time, and decoded frames. This proves the apparatus only.
4. In the real app, complete onboarding, select an instrument, and try audio and video Record. Require recording state/timer, then Stop, saved media, playback, and a reopened saved take. If recording cannot start, mark dependent comparison, Vault, hands-free capture, and new multitrack capture blocked; continue independent tests.

## 1. Onboarding, Home, settings, navigation

- Get started → instrument picker → search → select → Start practicing. Confirm chosen instrument on Home and after reload. On a separate fresh origin, test Skip, Previous, empty search, and picker dismissal.
- Follow every Home shortcut. Verify destination and recover via Back/Close. The suggested-routine CTA should open instrument suggestions directly.
- Settings: toggle Dark Mode and Feature tips; change Stop After Silence; close/reload/reopen and verify values and theme. Open and close a help topic. Use the isolated profile only. Hardware settings require hardware verification beyond the switch state.
- Exercise Welcome Tour replay/skip and restore focus. Do not send bug-report email, redeem purchases, share outward, or change cloud backup just to count a control as tested.

## 2. Routines and tools

- Home → Your routines/New routine → suggested Fundamentals → rename `QA Fundamentals` → Save for later. Reload and verify the name and four steps.
- Start routine. Verify the Tuner destination, A4 at 440 Hz from synthetic input, and expected drone indication. Pause/resume. Done & next should load Long tones with 60 BPM, then Lip slurs with 68 BPM, then recording with hands-free.
- On Metronome, Stop/Start, increase tempo, select 3/4, and verify three beat controls. UI transport is distinct from audible timing accuracy.
- Finish routine and verify 4/4 completion after reload. Recording within the routine remains blocked if media gate fails; advancing a checklist is not proof of a performance.
- Follow curated practice inventory for custom routines, reordering, importing, sharing, timing programs, drone settings, pitch history, and insights. Mark any omitted paths untested.

## 3. Games

- Staff Jumper: configure/start; allow missed notes; pause → Finish run → verify misses/review; Play Again → verify new run; pause/Exit. Correct-note rhythm scoring needs a separately timed input case.
- Balance: Quick Play → Play; use the on-screen test-mode hold gesture to supply synthetic target pitch; verify progress and note advancement; release input in a `finally` path; pause/quit.
- Learn: start first-eight-notes lesson, verify C4/open fingering, Next → D4/valves 1+3, Previous, Back to setup. Pitch matching/all instruments are separate cases.
- Do not alter game presentation. Do not count source range checks as actual gameplay.

## 4. Multitrack and music

- Workspace → Multitrack → Projects. Rename, duplicate, switch projects, and confirm originals remain.
- Layout: select four boxes and Cancel (must remain two), then select four and Apply (must show four). Check editor and mixer empty states; empty export must remain disabled.
- Import `results/media/qa-pulses-two-part.btmulti` through Projects → Import shared project, using the browser's file chooser. Confirm separate project `QA pulses two part`, two parts, and 4-second duration.
- Play all. Verify both HTML media elements progress/end without errors; check mix audio separately before claiming audible balance or synchronization.
- Editor → Mixer: mute 440 Hz; reduce 660 Hz from 60% to 59%; Done; reload app; reopen multitrack and verify project, assets, mute, and volume. Unmute and play an individual part; require a positive currentTime and readyState 4.
- Timeline: To end should reach 0:04. Trimming, dragging, alignment, additional boxes, recording replacements, backing tracks, and native video export are separate cases.
- Music: import the repository's generated test PDF (not a personal score), open it, inspect page navigation and practice tools, rename/search, then reload. Do not claim PDF coverage from multitrack audio import.

## 5. Report and preserve regressions

Keep a timestamped session JSON and concise bug report. Include exact setup, taps, expected/observed behavior, platform limits, and the relevant source lines for diagnoses. Add a narrow regression that fails for each confirmed bug without changing product behavior. Avoid unbounded exploration: finish one batch, publish remaining gaps, and check usage before any additional work.

# Multitrack lifecycle/design audit notes — 2026-10-01

Bounded audit only; no application changes. Evidence is source inspection plus two Node/esbuild probes importing actual TypeScript modules with explicit mocked platform boundaries. No native run or acoustic measurement was performed.

## 1. P1: floating parts with short source lead-in shift in native playback/export

`src/multitrack/synchronization/projectTiming.ts:21-26` decreases trimStart by a clamped amount but increases offset by the full four-beat lead-in. The invariant `trimStart + offsetSeconds` is consequently violated whenever `trimStart < playbackCountOffSec(bpm)`.

Reproduction: a floating overdub at project second 10, BPM 120, no count-in, captured source-in 0.3 seconds: panel trimStart=0.3, offset=-10000, source duration=12. Helper returns trimStart=0 and offset=-8000. Native source at project second 10 is 2.0 seconds; HTML source is 0.3 seconds. Error = 1.7 seconds. Declared panel end=21.7 seconds but actual native end=20.0 seconds. For trim=0,1,2,2.3 the observed errors are 2,1,0,0 seconds respectively.

Reachability: `MultitrackOverlay.tsx:1174-1179` creates exactly this trim/offset model for mid-song captures; `:578-583` uses the faulty helper for native monitoring and Play All; `src/multitrack/export/multitrackExport.ts:101-116` uses it for export. HTML sync retains the original mapping (`useMultitrackSync.ts:225-235`).

Repair: shift trim/offset by the same **available** lead-in (`min(requestedLeadIn, max(0, trimStart))`). Keep the visual display lead-in policy separate from available source material. Verify retained source samples have identical project positions before/after helper application for trims 0/0.3/1/2/2.3, BPM 40/120/300, count-in 0/1/2 bars, and changed tempo. Native proof must compare a clap/downbeat in Play All, recording references, visuals, and rendered output.

## 2. P1: missing imported assets lose their recoverable metadata on autosave

`multitrackPersistence.ts:181-201` turns unresolved backing audio into `{kind:'none'}`, base score into null, and drops unresolved timed cues. `useMultitrackSession.ts:95-105,113-135` commits this restored session and autosaves it. The serializer omits recoveryNotice and only saves live backing/score/cues.

Probe: import actual save/load implementation, stub only persistAsset/restoreAsset, in-memory localStorage. Original has audio backing, PDF base asset and timed PDF cue. First restore with assets unavailable yields none/null/[] and recovery notice. Save that restored snapshot, then restore with all assets available: still none/null/[], recovery notice absent. This confirms reference/filename/page/timing loss, not physical blob deletion.

Repair: retain unresolved original descriptors as missing assets, as `missingTakeId` already does for Vault recordings; render missing-file states and offer Relink/Remove. Autosave must preserve identifiers, filename, cue position, page, transform and mixer state until explicit removal/replacement. Verify missing one cue preserves other cues and placement; disappearance/reappearance or relink survives two reopen/autosave cycles; explicit Remove is the only destructive path.

## 3. P2 static: missing reference parts silently disappear from audition/overdub mix

`MultitrackOverlay.tsx:560-567` skips every `!panel.take`, including restored visible panels with `missingTakeId`. Play All and recorder arming call this builder. `:837-844` and `:1243-1250` omit missing parts from recorder reference lists/chips. Export correctly rejects visible missing takes (`multitrackExport.ts:53-55`), so preview/record and export disagree about readiness.

Reproduction from source: reopen project after one Vault take becomes unavailable; retain at least one other playable take; Play All or record another part. The unavailable reference is skipped rather than raising a missing-source error; only panels with an existing Take reach `:569-572`. No native run performed for this case.

Repair: one shared readiness check before Play All, overdub and export. Explain which part is missing; offer Relink or explicitly exclude/hide it. Persist exclusion, so the user can intentionally rehearse a partial mix. Verify a missing unmuted visible reference blocks unexpected partial playback, while hidden/excluded missing parts do not.

## Repair strategy comparison

1. **Small boundary repairs, recommended:** fix the timing invariant, retain missing descriptors, share readiness guards. Addresses reproduced defects while retaining current native engine and UI.
2. **Temporary restrictive guards:** disallow floating capture without sufficient pre-roll and suppress autosave of recovered sessions. Faster mitigation, but prevents valid recording workflows and leaves changed edits unsaved; use only with explicit UI explanation.
3. **Full transport/project transaction rewrite:** potentially unifies state, but introduces broad paid-feature regression risk and is disproportionate before these local fixes and native verification.

## Musician workflow optimization suggestions

- Show per-recording readiness and the exact reference/mute set before count-in. A reference ready-to-play badge must mean the file and native mix were prepared, not merely that a thumbnail exists.
- Distinguish capture finalization, Vault durable save and workspace save. Keep/Retry needs capture-scoped identity; slow finalization must not produce a misleading generic lost-recording error after eight seconds or bind an old take to a newly selected part.
- Preserve Retry takes safely in Vault, and state that behavior in the action copy; maintain non-destructive replacement and one-step Undo.
- Prewarm decode/enhancer caches after a source change while idle; show preparation progress for cold twelve-part projects. Existing native extraction can wait up to 45 seconds per source (`MultitrackTransportEngine.swift:529`). Require a responsive cancellation path before describing the flow as seamless.
- Make the 6/8 pulse choice explicit. Multitrack displays six clicks per bar and derives beatsPerBar from the numerator, while the general metronome supports compound pulse counts; consistency should be a product choice tested with a musician.

## Existing suite failure classification

`scripts/verify-multitrack-upgrade.mjs:217` fails because the lifecycle harness bundles the real Plus gate with initial `ready:false`; `setLayout('twelve')` is denied, then extra creation is denied and returns null. `.startsWith` crashes. This is stale entitlement setup in that harness, not evidence the paid unlocked product cannot add extras. Mock verified access only for the mechanics harness and keep separate free/purchased/expired entitlement checks.

No claim of zero bugs or native certification is supported by this bounded audit.

# Multitrack recording and takebox workflow audit

This audit follows the workflow established in **Map routine audit swarm** and **Audit pitch and game workflows**: a GPT-6.1 Sol lead on high reasoning, two GPT-6 Luna reviewers on high reasoning, realistic musician flows, targeted simulations, and a final adversarial challenge. It covers multitrack, audio and video recording, Current and Best takeboxes, Vault handoff, and audio/video references on the October 1, 2026 working tree.

**The paid-feature release bar is not reached.** Three high-priority defects are reproduced, another reference logic defect is supported by source and a helper probe, and physical capture, routing and exported-media acceptance remain unverified. This is an audit and implementation map; application code has not been changed by this chat. Existing user edits and the concurrent routine/game chats were preserved.

## Usage and coordination

The user's latest shared allowance floor is **65% remaining**, replacing the earlier 80% constraint for this chat. Start no new review or test batch at **70% remaining**; wrap up running work and record gaps above 65%. Check before dispatch and between batches. The account meter reports usage consumed, so remaining equals 100 minus usedPercent. Initial and interim snapshots showed 1% consumed, or 99% remaining, in the main weekly window; the reserve window showed 100% remaining. Meter updates can lag and all three chats share allowance, so this is a conservative monitoring rule rather than a guaranteed cap. No account reset was performed, and this chat did not change the other chats' instructions.

The lead reviewed timing, capture handoff, project recovery and export. One Luna challenged recording, takeboxes and hands-free playback; the other challenged references and integration. The coordinator reran existing checks, independently reran the behavioral probes, exercised the actual app on isolated origin `http://127.0.0.1:5229/`, and reconciled disputed findings. Only synthetic media and a disposable QA profile were used. Existing QA documentation's older model and usage settings were superseded by the user's current instructions for this run.

The benchmark is the user's existing audit pattern plus a **derived musician-workflow rubric**: retained recordings, consistent timing across preview and export, truthful readiness, recoverable missing resources, explicit errors, and repeatable practice without surprise playback. No competitor parity or device certification is claimed.

## Findings and repair order

### Preserve timing for short pre-roll overdubs

**P1, reproduced production-helper defect.** [projectTiming.ts](/Users/jameslobb/Documents/SessionMirror/src/multitrack/synchronization/projectTiming.ts:21) reduces source trim by a clamped amount but adds the full four-beat offset. When available source pre-roll is shorter than that count-off, the source-time mapping changes.

At 120 BPM, an extra part placed at project second 10 with a 0.3-second source trim maps to source second 2.0 for native monitoring/export, while the HTML timeline maps to 0.3. That is a **1.7-second discrepancy**, and the helper-derived native end is 1.7 seconds early. The same probe finds errors of 2 seconds with zero source trim and 1 second with a one-second trim. This is a calculation and payload-path finding, not an acoustic measurement.

Mid-song capture creates this model in [MultitrackOverlay.tsx](/Users/jameslobb/Documents/SessionMirror/src/multitrack/components/MultitrackOverlay.tsx:1174). Monitoring uses the helper at line 578; [multitrackExport.ts](/Users/jameslobb/Documents/SessionMirror/src/multitrack/export/multitrackExport.ts:97) passes its source window to native rendering. Native export reads explicit sourceInSec/sourceOutSec at [BestTakeAudioPlugin.swift](/Users/jameslobb/Documents/SessionMirror/ios/App/App/BestTakeAudioPlugin.swift:1375).

**Proposed repair:** decrease trim and increase offset by the same available source lead-in, bounded by the current source trim. Keep the visual count-off policy independent. Preserve `trimStart + offsetSeconds` for each retained source sample. Do not change the recorded media or Vault original.

**Acceptance:** identical source mapping and duration for trims 0, 0.3, 1, 2 and 2.3 seconds at 40, 120 and 300 BPM; zero/one/two count-in bars; late entries; tempo changes; hidden and visible extras. Then record clear attacks on a physical device and compare Play All, overdub references, picture and final export near the beginning and end.

### Keep missing imported assets recoverable

**P1, reproduced production save/load defect with mocked asset availability.** [multitrackPersistence.ts](/Users/jameslobb/Documents/SessionMirror/src/multitrack/state/multitrackPersistence.ts:181) restores missing backing as none, score as null, and drops missing timed cues. [useMultitrackSession.ts](/Users/jameslobb/Documents/SessionMirror/src/multitrack/state/useMultitrackSession.ts:113) autosaves the restored session.

The probe saved backing, score and cue descriptors, loaded with assets unavailable, saved that restored state, and loaded again with assets available. The descriptors remained absent and the recovery warning disappeared. This confirms loss of recovery metadata; it does not demonstrate physical media-file deletion.

**Proposed repair:** retain unresolved asset descriptors and show Relink/Remove states, following the existing missingTakeId approach. Autosave must keep IDs, names, cue time/page/placement and mixer settings until explicit replacement or removal. A transient asset-read failure must not become an intentional removal.

**Acceptance:** two load/autosave/reopen cycles retain missing descriptors and warnings; one missing cue leaves other cues intact; successful relink restores the original placement; explicit removal stays removed. Simulate storage/read failure separately from a file that was genuinely deleted.

### Restore browser recording and make failures visible

**P1 for the supported browser/QA workflow, reproduced in the actual app with synthetic audio/video.** [takeStorage.ts](/Users/jameslobb/Documents/SessionMirror/src/utils/takeStorage.ts:417) returns no streaming writer on web. [useCameraSession.ts](/Users/jameslobb/Documents/SessionMirror/src/hooks/useCameraSession.ts:2750) treats that as fatal before creating MediaRecorder. The buffered web stop/save path is unreachable.

On the isolated QA origin, clicking Video Record and the first-take Audio Record button logged userPressedRecord and prepareStream, returned to idle, and displayed no error. The focused regression also produced started=false and zero recorder starts for both modes. The independent media baseline successfully generated, stored, reloaded and decoded a 456,763-byte 640×360 WebM; after reload it measured a three-second stereo signal, RMS 0.056545, positive playback time and 23 decoded frames. Browser media capability therefore worked in this test apparatus. This finding does not establish a native iOS recording failure.

**Proposed repair:** permit the existing buffered save path on web while preserving the native writer requirement; surface a recoverable start error. If production browser capture is intentionally unsupported, explain that state and disable the action, while retaining an honest native QA plan.

**Acceptance:** audio/video start → timer → stop → nonempty persisted take → decoded playback → reload → second take; permission denial; writer failure; quota failure; double-tap start; retry. A successful start alone does not certify saving or audible playback.

### Correct reference passages after delayed player readiness

**P2, source logic plus production-helper probe.** [ReferencePassageControls.tsx](/Users/jameslobb/Documents/SessionMirror/src/components/ReferencePassageControls.tsx:12) permits saving a range before source duration is known. [useYoutubePracticePassage.ts](/Users/jameslobb/Documents/SessionMirror/src/hooks/useYoutubePracticePassage.ts:36) does not revalidate it when duration arrives; its loop guard skips ends beyond duration.

A saved 0:10–0:40 loop remains intact for a 25-second reference. The UI can continue to call it a saved passage although the loop cannot run. The probe calls the real save/load helpers, then evaluates the hook's predicate; it does not mount the hook or operate a real YouTube embed.

**Proposed repair:** revalidate restored/drafted bounds when duration arrives and show an actionable invalid-range state. Preserve the user's draft rather than silently claiming an impossible passage is playable. Decide and test the precise end behavior of Listen separately from Loop.

**Acceptance:** delayed telemetry for a shorter reference produces explicit correction; valid bounds survive reload; Clear removes the saved passage; recording prevents surprise reference playback; stale telemetry from an old reference cannot change the new one.

### Support keyboard activation of Record

**P2, source diagnosis supported by live activation logs.** [RecordingModeCarousel.tsx](/Users/jameslobb/Documents/SessionMirror/src/components/RecordingModeCarousel.tsx:93) uses pointer long-press handlers. [useLongPress.ts](/Users/jameslobb/Documents/SessionMirror/src/hooks/useLongPress.ts:183) suppresses native clicks while tap activation runs only through pointer-up.

In the actual QA app, Enter and Space on centered Audio Record added no recording lifecycle events; a pointer click on the same control added userPressedRecord and prepareStream. The separate writer failure still prevents recording, so these observations establish an activation difference, not a successful pointer capture.

**Proposed repair:** allow Enter/Space to activate once while preserving pointer long-press hands-free behavior. Test start and stop, repeat keys, pointer cancellation and a long hold. Physical assistive technology remains untested.

### Make missing recording references explicit

**P2, static workflow inconsistency requiring live confirmation.** [MultitrackOverlay.tsx](/Users/jameslobb/Documents/SessionMirror/src/multitrack/components/MultitrackOverlay.tsx:560) skips panels without a take, including visible missingTakeId panels, in native monitoring. Overdub reference lists omit them; export rejects visible missing takes at [multitrackExport.ts](/Users/jameslobb/Documents/SessionMirror/src/multitrack/export/multitrackExport.ts:53). A musician can therefore rehearse an incomplete mix and learn that it is incomplete only at export. The existing recovery notice partially mitigates this risk.

**Proposed repair:** share readiness rules across Play All, overdub and export. Name missing parts and offer Relink or explicit Exclude. Excluding/hiding a missing part intentionally should permit partial practice; empty available parts should remain recordable.

## Findings narrowed by the final challenge

- A stale localStorage selection remains after deleting a selected local audio reference, but derived playback clears. Treat this as cleanup, not a confirmed wrong-playback defect.
- Destructive trim does not rebase legacy focused-loop boundaries, but the current review UI has no demonstrated setter for creating those boundaries. Treat it as a latent/legacy-state risk until a reachable setup is reproduced.
- Historical native QA reported audio-only export rejection. Current native source accepts audio-only panels and generates visual plates. Do not carry that older rejection forward as a current bug. Export still needs physical-device proof.
- The upgrade script crashes on extra.startsWith because its lifecycle harness uses real Plus access with readiness false. The gate correctly denies the requested twelve-box layout and extra box. This is test setup failure, not a reproduced paid-layout defect.
- The hands-free playback script expects the older mounted iPad HTML path; current iOS code deliberately uses the shared native player for persisted file paths. Treat this as a test/code expectation mismatch pending actual iPad playback, not proof of silent audio.

## Implementation sequence and optimization

Choose **small boundary repairs** first: timing invariance, missing asset preservation, web start/error handling, reference validation and keyboard activation. They retain the current media engine and are independently reviewable. Temporary restrictions could block short-pre-roll captures and suspend recovery autosave, but would sacrifice valid workflows and leave edits unsaved. A full transport/project rewrite could unify state, but would introduce broad regression risk before the local defects are repaired and measured. These are internal repair alternatives, not external benchmarks.

Only one editor should change App.tsx, MultitrackOverlay.tsx or shared recording/audio lifecycle files at a time across the three chats. Recheck the current tree immediately before any repair; test evidence is tied to the inspected snapshot. Sol should integrate a narrow batch, then Luna should challenge its failure paths and cross-feature behavior. Do not run an open-ended swarm.

Musician-focused suggestions, still proposals:

1. Show which references and mutes are prepared before count-in. A thumbnail alone must not imply playable media.
2. Distinguish Preparing, Recording, Saving take and Saved in the visible flow. Keep capture identity through slow finalization, Keep, Retry and part switching.
3. Keep reference passage, loop and volume consistent through reference → take review → retry, while explicitly stopping the previous playback owner.
4. Prewarm decode/enhancement while idle after source changes; show cold preparation progress and responsive cancellation. Benchmark cold 12-part and 16-part projects before claiming speed improvement.
5. Keep replacements nondestructive and provide Undo; verify removal from a workspace leaves Vault originals intact.

## Practice simulations and paid release gates

The following end-to-end checks are **proposed acceptance tests**, not completed passes:

| Musician session | Required observable outcome | Current evidence gap |
| --- | --- | --- |
| Audio: record, stop, listen, retry, mark Best, reopen | Original and Best persist; no overlapping playback; next take starts promptly | Browser start fails; native sequence untested here |
| Video: capture, Current/Best, fullscreen, enhance, share | Sound and picture retained; enhancement applied once; sharing failure preserves take | Physical capture, listening and share untested |
| Reference: select/import, passage/loop, record, review, retry | Correct source/range; previous audio stops; recording is not unexpectedly interrupted | Embed and local reference live sequence untested |
| Multitrack: import or record parts, late extra, trim/mix, reopen | Timing and edit state consistent; missing files stay recoverable | Helper defects reproduced; native sequence untested |
| Export: audio-only, video-only and mixed project | Preview matches rendered sound/picture/layout/end; backing included; YouTube excluded clearly | Current native capability inspected, output untested |
| Failure/recovery: deny permission, unplug route, background, low storage, cancel | Visible recovery; no false Saved state, data loss or stale starts | Physical failure injection untested |
| Paid access: unlocked, expired, offline restoration, purchase cancellation | Access and explanation match entitlement; saved work remains intact | Existing source access checks pass; StoreKit UI untested |

Repeat critical capture and routing cases on iPhone and iPad with speaker, wired headphones and Bluetooth. Exercise portrait/landscape, short screens, interrupt during count-in/capture/finalization/render, and restart after a durable save. Also force-terminate the app during take finalization and workspace autosave, then reopen: require a playable durable take or an explicit recoverable incomplete state, with no false Saved status, erased existing asset descriptors, or capture assigned to the wrong part. This interrupted-write test is proposed and has not been run. Synchronization measurements should use clear attacks at both ends of longer takes and compare native preview with exported files; pick measurable tolerances before the device pass rather than declaring them satisfied from mocks.

Release requires no unresolved critical/high defects in the supported platform, all critical workflow checks passing on the intended devices, regression coverage for repaired defects, and explicit recovery for expected failures. Literal zero bugs cannot be proven by finite testing; these gates operationalize that objective without hiding untested paths.

## Executed checks and evidence

The coordinator ran 24 existing scripts: **21 passed, 3 returned nonzero**. [results.json](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-media-evidence/results.json) records commands, exit codes and logs. Source TypeScript hashes were unchanged during that suite. Passing checks cover geometry/editor, transport handoff, native asset reads with doubles, project sharing roundtrip, reference preview, recording waveform/guidance, trim metadata, enhancement preview helpers, routing contracts, hands-free state/handoff/manual/monitor and access source checks. They do not certify touch UI, microphones, Bluetooth, StoreKit or final render quality.

The nonzero scripts were browser recording (reproduced product failure), multitrack upgrade (stale entitlement harness), and hands-free playback (changed iPad route expectation). Upgrade printed 1,428 passing model assertions and a passing export-payload section before its lifecycle harness failed. Keep the failures visible and repair test assumptions separately from app changes.

- [Lead behavioral probes](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-media-evidence/lead-behavioral-probes.mjs) and [output](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-media-evidence/lead-behavioral-probes.log): actual timing/save/load modules, with storage/platform boundaries mocked. Both coordinator and lead ran them. Exit zero means the defect-reproduction assertions succeeded; it does not mean the product defect passed a regression gate.
- [Reference helper probe](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-media-evidence/reference-probe.mjs), [output](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-media-evidence/reference-probe.log), and [scope](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-media-evidence/reference-probe-scope.md): saved bounds and trim metadata; no mounted player/trim UI.
- [Live recording console](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-media-evidence/live-recording-console.json) and [audio failure screenshot](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-media-evidence/audio-record-failure.jpg): actual app, fresh isolated origin, synthetic media.
- [Live session record](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-media-evidence/live-session.json) and [source fingerprints](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-media-evidence/source-fingerprints.json): steps, outcomes, limits and the final inspected source snapshot.
- [Media baseline after reload](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-media-evidence/media-baseline-after-reload.txt): independently persisted, decoded sample and signal/frame measurements.

**Gauntlet verdict: BAR NOT REACHED for paid release.** The strongest challenge was that a missing-resource recovery path could autosave away the information needed to recover. The audit map now makes preservation and repeat-reopen tests mandatory. A fresh challenge also downgraded two overstated findings, separated stale harnesses from product failures, and added force-termination during saving to the release gates. Proposed repairs remain unapplied, and native runtime acceptance remains open. The final main allowance snapshot reported 98% remaining, above the user's 65% floor.

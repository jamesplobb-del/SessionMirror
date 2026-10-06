# Recording + multitrack cross-feature ultra audit — 2026-10-06

Audit only. HEAD cc66c3ee0cf7729f376276518a363dc6a054491a. Canonical repository /Users/jameslobb/Documents/BestTake. No product/config changes; unrelated dirty music/routine/game tree preserved. Temporary probes and evidence live beside this report. Final fingerprint: source-fingerprint.json; concurrent unrelated changes make this a final observation, not immutable-source proof. One source pass plus a fresh adversarial challenge; no native camera/microphone, native UI, browser UI, audible monitoring, encoded capture, or OS interruption executed.

Derived professional benchmark: each capture/preview operation owns an identifiable lifecycle; cancellation balances only its resources, preserves competing consumers, and prevents late completions from restoring abandoned state. Saved/shared project metadata preserves the musician's visible composition; missing sources permit repair without discarding healthy work.

## Confirmed cross-feature findings

### P2 — cancel during native stereo route apply leaves no hold but an engaged playback route

Evidence class: confirmed executable module state with explicit native port mock. Exact current source: src/utils/stereoPlaybackRoute.ts:64-65 and113-123. Reachable caller: src/context/AudioModePlaybackContext.tsx:481-503 marks native playback starting before awaited preparation; Pause at791-812 calls stop while start is pending. Audio mode start acquires this route at src/utils/audioModeNativePlayback.ts:73.

Reproduction: call actual engageStereoPlaybackAsync with enableStereoPlayback pending; call final releaseStereoPlayback; resolve native apply as routeApplied:true. Actual isStereoPlaybackEngaged=false, isNativeStereoRouteEngaged=true, enableRecordingRoute calls0. Expected no abandoned route engagement after the final owner leaves (or an explicit capture-owner-safe reconciliation). Source cause: final release observes nativeRouteEngaged=false before pending apply resolves, returns, and late apply sets it true. Normal settled final release restores once. A competing surviving hold control passes and correctly postpones restoration.

Musician impact: rapid Play/Pause or leaving preview can leave shared playback-route bookkeeping and session behavior inconsistent for subsequent recording/monitoring. Acoustic volume, mic availability and on-device frequency are unverified; do not describe a proven native silent take.

Smallest fix: make final-release reconciliation await/serialize with the pending apply, then recheck current holds/generation before restoring. Do not restore the generic recording category over a newer playback or camera owner. Proposed acceptance: pending apply→final release→apply completion leaves no orphan engagement; a newer/surviving consumer retains its route; apply failure/routeApplied:false does not trigger fake restoration; settled release remains exactly once; capture-owner profile is preserved. Device route/capture smoke check remains required.

### P2 — replacing a still-preparing audio preview leaks its route hold

Evidence class: confirmed executable actual audioModeNativePlayback and nativeInlineTakeBoxPlayback modules; explicit URI, preview preparation, native bridge and route-hold ports. Exact source: src/utils/audioModeNativePlayback.ts:73,85-87,123-134. Caller reachability: src/context/AudioModePlaybackContext.tsx:494-509 stops the preceding request only if nativePlaybackActiveRef is true; a preparing request has nativePlaybackStartingRef=true. Its stale null completion is ignored at541.

Reproduction: start A.m4a; hold its readyNaturalTakePreview promise after route acquisition. Start B.m4a and let it complete. Finish A preparation; A correctly returns null and never starts media. Stop B. Actual native player stopped, but acquired route holds2 and releases1 leave one hold. Expected both abandoned A and stopped B have released exactly their owned route holds. Ordinary single A Stop while preparing balances correctly; this defect requires replacement without first stopping the pending start.

Musician impact: quickly auditioning two audio takes can retain a playback lease after playback ends, delaying recording-route restoration and confusing subsequent audio/camera handoff. Real sound/capture effect unverified.

Smallest fix: represent each acquired playback route as an idempotently released owned lease; release stale starts without consuming a newer request's lease. A single audio-controller lease with serialized replacement is also viable, but must cover stop before acquire settles. Proposed acceptance: A slow/B fast→A stale→Stop B leaves zero owned holds, B is never preempted by A cleanup; same-source rapid restart also balances; prepare/decode failure and Pause at every await boundary restore ownership; a concurrent independent YouTube/take lease survives cleanup.

## Fresh challenge of medium findings

| Finding | Ultra adjudication |
|---|---|
| Web recording writer gate | Retain P1 for browser/QA capture only. Native paths return earlier. Current production callback execution is fresh; prior actual-app evidence is historical. Both the writer defect and keyboard defect were documented 2026-10-01 and explicitly outside prior iPhone/iPad fix scope; they are not established new regressions. Restoring start alone does not prove web save/reload durability. |
| Center Record keyboard/native click | Retain P2. Current carousel renders a real button, installs only returned long-press pointer handlers and onClickCapture; no key activation path. Pointer action works, keyboard-native click is suppressed. Actual hook result is sufficient for callback defect; physical assistive-device behavior remains unverified. |
| Encoder error silently discards | Retain P2 for MediaRecorder path. Visible capture terminates with telemetry but no actionable user failure message. Do not claim a permanent stuck ref; render sync mitigates that. |
| .btmulti mirror loss after reopen | Retain P2. Current importer panel construction multitrackFile.ts:137 omits mirrored; persistence retains panel metadata; exporter uses panel.mirrored OR take.mirrorPlayback at multitrackExport.ts:119. Medium's save→reopen against raw Vault take(false)→build→read reproduction defeats the competing interpretation that the take's mirror flag always covers it. |
| Missing received source blocks reopen | Retain P2. multitrackPersistence.ts:130-135 throws before existing missingTakeId fallback151-152. This is saved-workspace restore, not deliberate manifest strictness. Medium module probe compares healthy local + unavailable received source. It blocks repair; does not prove deletion. |
| Successful render lost to listener cleanup rejection | Retain P3 injected bridge fault. finally await at multitrackExport.ts:283 can replace result; observed frequency unknown. |
| Existing handsfree playback script failure | Treat as stale route expectation pending contract update; native play count does not establish silent playback. Remaining cases past failed assertion were not executed. |

No fixes applied because request is audit only. Three repair approaches compared against ownership/concurrency safety: (1) local owned leases plus final-apply reconciliation; (2) one serialized audio-controller lease for replacements; (3) a shared capture/playback resource arbiter. Prefer (1) for smallest independently reviewable fixes; (2) centralizes same-owner replacement but needs broader controller regression coverage; (3) may reduce future divergence but has unnecessary migration and regression surface for these two localized defects.

## Coverage and evidence ledger

| Cross-feature workflow | Evidence/status | Remaining boundary |
|---|---|---|
| Shared native stop→prepare→start, live mixer ownership | PASSED verify-multitrack-transport-handoff actual module | AVAudioEngine timing/device sound |
| Capture before transport, late start cancellation, full lead-in, retry | PASSED verify-multitrack-count-in actual hook/callback | Device encoder, physical countdown/acoustics |
| Final playback lease release and competing consumer | FAILED cancellation invariant; normal and surviving-consumer controls PASSED | AVAudioSession route on device |
| Audio preview replacement/cancel route balance | FAILED replacement invariant; plain single cancel PASSED | Rendered vault/handsfree action sequence |
| Capture completion→take cards→multitrack review | Source inspected App1960+,3893-3924 and Overlay1155-1173 | Full UI/save-time completion race |
| Save/rendered take→Vault; failed DB save cleanup | Source inspected App3927-3982; captureBusy/pending-saves guard reviewed | Real SQLite/filesystem failure and reload |
| Compare/audio library→recording handoff | Source inspected AudioModePlaybackContext, nativeInline singleton and route coordinator | Rendered compare/live mic ownership |
| Background/foreground, native mode guard, headphone loss | Source inspected hook and plugin; delegated module checks | Lock screen, call interruption, Bluetooth |
| External/routine navigation during arming | Suspected lead narrowed: routine actions disabled by WorkspaceTools busy at32 | Files handoff timing; not promoted to finding |
| Close during count-in then late canceled take | Source lead only: closeRecorder clears activePanel1578-1594; pending effect1155-1164 requires target before discard. Close control stage319 allows arming/count-in cancellation. Cleanup can be deferred until another target exists. | No end-to-end UI/native reproduction; do not claim new panel corruption. |

Executed temporary probe suite has five cases: two product-invariant failures observed, three disconfirming controls passed. Existing two focused regression commands passed. cross-owner-results.json and control-tests.json record boundaries; cross-owner-probes.mjs bundles current actual modules. Tests intentionally exit0 after asserting observed defects, so exit status is harness success, not product readiness.

Optional optimizations: add the two ownership race probes as narrow regressions; replace shared boolean capture-owner routing with per-take identity when revisiting the completion boundary; record route lease/generation diagnostics for difficult device-only handoffs.

Gauntlet decision: BAR NOT REACHED for a readiness claim because confirmed ownership and medium domain defects remain, with key native behavior unavailable. Audit deliverable complete; source remains unchanged.

# Recording audit — 2026-10-06

Audit only; HEAD cc66c3ee0cf7729f376276518a363dc6a054491a. Current relevant source SHA256s: source-hashes.json. Unrelated dirty music/routine/game files preserved. No app source or configuration edited. Tests use actual bundled modules or extracted production callbacks and explicit mocked React/media/device boundaries. No browser/native UI, real microphone, camera, encoded-file validation, native interruption, or audible output certified.

## Prioritized findings

### P1 — Browser manual recording never starts
Expected: ready Audio/Video Record starts MediaRecorder and yields a take. Actual: both callbacks resolve false before MediaRecorder.start; visible recording remains false. Execute `node scripts/practice-qa/regressions/recording-web-writer.mjs` from repository: exit1, audio/video each started:false, recorderStarts:0, reportedRecording:false. StreamingTakeWriter.open deliberately returns null on web (takeStorage.ts421-423), but useCameraSession.ts2752-2756 rejects null. Start error is silently caught at2780-2796. Thus no browser take, review or compare can be completed from live capture. This is fresh production-callback reproduction, not a new actual-browser observation; old app observation is historical.
Smallest fix: permit null writer on web and retain native writer requirement, activate existing buffered stop path at1603-1648. Acceptance: mocked real start produces exactly one recorder for audio/video; actual browser capture yields playable nonempty take; forced native writer-open failure reports actionable failure; repeat start/stop works. Browser durability needs a separate decision: current persistRecordingBlob at566-579 exposes only an ephemeral URL; App.tsx2050 persists only nonempty filePath and2128 rejects unpersisted take. Restoring start alone will not establish reload durability.

### P2 — Center Record ignores keyboard activation
Expected: native button Enter/Space/assistive activation calls start or stop once. Actual production hook invokes zero actions for native click(detail0); pointer release invokes one. RecordingModeCarousel.tsx99-125 spreads useLongPress handlers when center slot has long press. useLongPress.ts183-186 prevents every click, and its returned handlers have no keyboard activation path; plain action occurs only onPointerUp at106-139. Evidence adversarial-callbacks.cjs/log executes real hook with mock hook primitives, no DOM UI test. Musician impact: keyboard or switch-control users cannot use central record/stop affordance.
Smallest fix: allow native zero-detail activation through a guarded onClick while suppressing duplicate pointer clicks, or handle keyboard explicitly. Acceptance: Enter and Space each invoke once, pointer tap once, long press toggles handsfree without recording, disabled prevents activation. Actual DOM/device check remains required.

### P2 — Mid-take encoder failure discards the performance without a user message
Expected: failing MediaRecorder stops cleanly and informs musician that take was discarded, with retry. Actual actual bindRecordingHandlers.onerror (useCameraSession.ts1703-1720) reports telemetry, discards chunks, aborts writer and detaches recorder, then clears visible recording; no user alert or setError occurs. Audit harness injected encoder error: reportedErrors1, userAlerts0, discardedChunks1, recorderDetached:true. Persistence failures at1664-1685 already do alert, making encoder failure inconsistent. Scope: MediaRecorder capture path; native engine failure paths not implicated. Do not infer permanently stuck ref: render synchronizes it at429.
Smallest fix: one actionable take-failed alert and complete terminal capture-state cleanup here. Acceptance: encoder failure during manual and handsfree capture shows one message, saves no misleading take, terminates elapsed/saving/listening state, and next Record can start; late onstop/data callbacks cannot resurrect failed take.

## Fresh tests and stale test
16 existing scripts executed:14 pass,2 fail; full command/status in baseline-results.json and individual logs. Passing executed modules/callbacks: handsfree-cycle, handsfree-manual, handsfree-handoff, handsfree-monitor, camera-handsfree-playback, audio-lifecycle, live-recording-waveform, library-audio-preview, natural-preview, playback-route, headphone-output, trim-metadata, take-guidance, camera-gestures. Web writer fails above. verify-handsfree-playback passes first native start/end/cancel/reject/timeout/stale checks, then fails at130: mounted iPad audio element expects native plays0; actual1. Current App.tsx1213-1217 intentionally selects global native player on iOS with filePath, whose shared controller has WebKit fallback. Treat as stale test expectation/routing contract discrepancy, not proof of silent device playback; update that assertion only after confirming intended route, and continue remaining browser/rejection cases (currently abort at first assertion). Adversarial callback harness exits0 and reproduces keyboard/error findings.

## Workflow coverage
| Workflow | Status and evidence | Unverified boundary |
|---|---|---|
| Manual audio/video start; rapid taps | Executed actual start regression FAIL; handsfree-manual duplicate/pending starts PASS | Physical capture and encoded output |
| Live audio waveform | Executed hook with PCM PASS | Actual microphone amplitudes |
| Count-in/cancel | No single-take count-in found in current capture controls; multitrack count-in delegated | Multitrack owner's report |
| Handsfree quiet baseline, threshold, silence finish, resume sound, missing audio, repeated takes | Executed cycle utility and monitor/callback tests PASS; manual promotion/pending cancellation PASS | Actual thresholds in room and second recorded file |
| Finish & listen / Next / turn off / mode handoff | Executed manual+handoff+playback mocks PASS; native iPad routing test stale FAIL | Full UI phase transitions and audible replay |
| Audio/Video switching; front/back lens | Source-only changeRecordingMode3150-3238; switchCamera2938-2983 locked during capture/save and rolls back failure; gesture utility PASS | Physical lenses and camera recovery |
| Mic permission denial/recovery/loss | Source-only requestCameraAccess1171-1245 handles denial and stale-session result; no permission simulator executed | OS authorization/revocation |
| Preview/play Current/Best compare | Playback route/natural preview modules PASS; App pin best6390 and PipCompareRow source reviewed | Rendered cards, simultaneous audio/video comparison |
| Save, failed save, reload durability | Source-only onstop1590-1698 and App2050-2135,2294-2316 alerts failed persistence; web recording start FAIL blocks end-to-end path | SQLite reload, real storage full/filesystem denial |
| Review notes/focus/Record again | Source-only GuidedTakeReview85-115 debounces/flushing note and App7224-7226 | Visible dialog and persisted note after reload |
| Delete single/bulk, Best/load, vault search/filter/sort | Source-only TakeCard156-158,222; TakeVaultDrawer170-190,270-301,592-642; App5483-5523 | UI confirmation, SQLite/file transaction behavior |
| Share/export | Source-only App3451 and TakeVaultDrawer270,614 | Native share sheet, audio/video exported file fidelity |
| Trim/edit | Executed trim metadata utility PASS | Encoded export and timeline/audio alignment |
| Enhance | Natural preview renderer cancellation/retry/cache PASS; source App2187-2235 preserves original/copy ownership | Native render waveform fidelity and disk cleanup |
| Library audio preview | Executed browser identity/hydration/replacement/delete/isolation modules PASS | Visible vault playback on device |
| Background/interruption | Source-only capture interruption3079-3120, suspend3240+, lifecycle3739-3755; replay cancellation mocks PASS | Phone call, lock screen, foreground restoration |
| Speaker/headphones/Bluetooth | Executed route/headphone state utilities PASS | Audible route/output and Bluetooth reconnection |
| Multitrack touchpoints | Recording completion App1964-1966/7705 source inspected; full flow delegated | Multitrack report |

## Optional optimizations
1. Consolidate capture start failure reporting with save/encoder reporting so all terminal failure paths have one visible recovery message.
2. Turn the keyboard and encoder audit scenarios into narrowly scoped regression tests using actual hook/callback execution.
3. Replace stale platform-specific replay expectation with route contract tests plus a small real iPad smoke test for audible replay/re-arm.

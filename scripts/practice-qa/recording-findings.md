# Recording, comparison, Vault, and handsfree QA findings

Scope: one source inventory, one safe verification pass, and focused diagnosis of the lead's shared desktop app run with synthetic media. The app and fixtures were not modified. The grouped inventory links lead observations; untouched states remain untested. Real microphone/camera input and native iOS recording remain untested.

## Confirmed failures

The shared desktop app run with `VITE_FAKE_MEDIA=1` reaches recording start for both Video and Audio, then silently returns without recording. The lead observed `[AudioRecordLifecycle] userPressedRecord` and `prepareStream` on each attempt, with the fake `getUserMedia` returning live streams; `recorderStart` never appears. Source tracing finds the first guaranteed web failure: `StreamingTakeWriter.open()` returns `null` whenever `Capacitor.isNativePlatform()` is false (`src/utils/takeStorage.ts:417-423`). `useCameraSession.startRecording()` requires that writer before it creates or starts `MediaRecorder`; it throws on null, catches the error without logging, clears state, and returns false (`src/hooks/useCameraSession.ts:2726-2795`). This is a **confirmed browser recording failure in the actual app under synthetic media**. It does not establish an iOS native recording failure.

The recorder's stop handler still contains a no-writer path that buffers chunks, persists a Blob, and reports it to the app (`src/hooks/useCameraSession.ts:1519-1625`). The mandatory writer check during start makes that browser path unreachable. This narrows the likely repair to restoring the no-writer start path on web while retaining the native writer requirement; no repair was made in this QA pass.

Repeatable regression: `node scripts/practice-qa/regressions/recording-web-writer.mjs` runs the **extracted real `startRecording` callback and bundled real `StreamingTakeWriter`** with web platform and mocked capture/MediaRecorder boundaries. It currently exits 1 as intended: audio and video each report `started:false`, `recorderStarts:0`, `reportedRecording:false`, while the assertion expects recording to start through the buffered web path. This is a harness check of the web start branch, backed by the shared app observation; it does not exercise camera hardware, encoded media, or saving a take.

The center Record carousel also has a **source-level keyboard accessibility concern**: `useLongPress` activates on pointer-up, suppresses the native click during capture, and provides no Enter/Space handler (`src/hooks/useLongPress.ts:106-145,183-193`). This merits a focused follow-up once the browser recording gate is fixed; this batch does not independently establish its runtime impact.

## Verification evidence

| Command | Result | Classification / limit |
| --- | --- | --- |
| `node scripts/verify-handsfree-cycle.mjs` | PASS | Bundled utility assertions for silence, phase, health. Simulated input; no device capture. |
| `node scripts/verify-handsfree-playback.mjs` | PASS | Extracted App callback with mocked React/device boundaries. Simulated replay; no audible app playback. |
| `node scripts/verify-camera-handsfree-playback.mjs` | PASS | Extracted camera replay effect with mocked media/route. Expected recovery diagnostic lines appeared three times. No live camera. |
| `node scripts/verify-take-guidance.mjs` | PASS | Bundled utility state transitions; no UI. |
| `node scripts/verify-live-recording-waveform.mjs` | PASS | Hook harness with simulated PCM frames; no microphone. |
| `node scripts/verify-trim-metadata.mjs` | PASS | Bundled metadata utility assertions; no media export. |
| `node scripts/practice-qa/regressions/recording-web-writer.mjs` | FAIL as expected (`exit 1`; audio/video start `false`, recorder starts `0`) | Extracted real start callback and bundled writer with mocked web capture/MediaRecorder; regression gate for the confirmed browser failure. |

## Likely issues to probe, not confirmed bugs

- Handsfree capture and replay traverse microphone ownership, native recording, audio routing, and media readiness. The passing mocks leave those device boundaries unverified. In the app, use a real performance with a quiet pause, listen for an audible replay, then start a second take; inspect both saved files in Vault. Sources: `src/hooks/useAutoSoundRecording.ts`, `src/App.tsx:6990-7025`, `src/components/LiveCameraBackground.tsx`.
- Permission refusal and camera recovery still need device checks. The lead's observed browser failure occurred with the carousel ready class and with recording start logs, so readiness is not its cause. Source: `src/components/RecordingModeCarousel.tsx:70-108,181-210`.
- Vault's Best filter uses project best-history membership, which may include a previously best take; the visible wording might suggest only the current Best. Verify intent and displayed badges with multiple promotions. Source: `src/components/TakeVaultDrawer.tsx:154-190,510-526`.

## Focused browser diagnosis from the shared QA run

The lead's synthetic-media run showed a moving video preview (`readyState=4`, 1920×1080), but clicking Video Record and pressing Enter produced no recording. Switching to Audio worked, yet the first-take Audio Record also appeared inert, with no visible error. Instrumentation then showed both mouse clicks reached `startRecording`, which makes the browser writer gate above the relevant cause. These are **actual app interaction observations with synthetic input**, not proof of a device recording failure.

The Video Record path has a readiness guard (`RecordingModeCarousel.tsx:181-210`), but the lead confirmed the center button lacked `record-carousel-slot--not-ready` and the click reached `startRecording`. Fake capture returned the expected tracks. The readiness hypothesis is ruled out for this run.

Audio's prominent first-take button uses a direct click handler (`AudioModeHome.tsx:792-800`). It was enabled, and `[AudioRecordLifecycle] userPressedRecord` plus `prepareStream` confirmed the handler passed App guards. The next required writer creation returns null on the browser, before MediaRecorder is constructed.

The carousel keyboard defect is separate from the browser writer failure. AudioModeHome does not use `useLongPress`.

## Highest-value actual-app scenarios

1. New session: launch Record from Home, record a short audio take, stop, hear playback, add a note/focus, record again, promote one take to Best, and compare both. Confirm saved names/durations and playback after reopening the app.
2. Repeat with video and camera permission transitions. Check preview readiness, audio in the saved video, Current/Best playback, full-screen comparison, and export.
3. Open Vault with mixed audio/video takes across two sessions. Exercise search, filters, sort, Make Best, Load Take, select/bulk actions, and confirmation on delete. Verify only the intended session changes.
4. Enable handsfree from idle. Play through one performance, pause for the configured quiet gap, confirm automatic replay is audible, then repeat. Change quiet gap/start level, use Finish & listen and Next take, and close handsfree.

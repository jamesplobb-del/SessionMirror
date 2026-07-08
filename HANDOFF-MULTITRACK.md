# Multitrack Feature — Handoff Document

Written 2026-07-09 after a full multitrack rework. **The repo builds clean** (`npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, `npx cap sync ios`, `xcodebuild` simulator build all pass). This doc is for whoever continues: a human, Cursor, or another AI session.

## Product intent (approved by the owner)

Multitrack = acapella-style grid recorder for musicians, "feels like an iPhone, not a DAW."
- **Tiles are visual** (camera takes, vault takes, sheet music). **Audio is a project source** (MP3/YouTube backing, click) shown in a mix strip — audio never occupies a grid tile.
- Target: 3 taps to first recording (open → tap tile → Record). Count-in is musical (bars @ BPM). Stop → Retry / Preview / Keep review loop. Everything auto-saves to the Take Vault (one-time toast explains this).
- Monitor mix is a *state* of the record screen ("You'll hear" chips, all-on default), not a config gate. A live headphone chip warns about speaker bleed.

## Architecture map (all paths relative to repo root)

- `src/multitrack/components/MultitrackOverlay.tsx` — the canvas screen + all bottom sheets (tile actions, backing, mixer, **trim**) + recording lifecycle wiring + watchdogs. The central file.
- `src/multitrack/components/MultitrackRecordingStage.tsx` — full-screen record UI: top bar (rec dot + elapsed), "You'll hear" monitor chips + headphone chip, big record button, count-in settings sheet, Retry/Preview/Keep review row. Camera preview = JPEG frame pump canvas (`setNativeCameraFrameBridgeEnabled(true)` on mount).
- `src/multitrack/recording/useMultitrackRecording.ts` — phase machine: idle → count-in → recording → review. `onCountInStart` must return the camera-start promise; failure → `fail()` → `onError` toast + reset. Never leaves a dead-end.
- `src/multitrack/synchronization/useMultitrackSync.ts` — playback sync engine. Now supports per-panel **volume/mute** (mixer), **monitor mutes** (recording), and **trim** (`setPanelTrim(panelId, startSec, endSec|null)`): timeline t maps to `t + trimStart` inside each take; RAF drift-corrector and end-caps are trim-aware; master = longest *trimmed* take.
- `src/multitrack/state/useMultitrackSession.ts` + `multitrackPersistence.ts` — session state + localStorage auto-restore (`sm.multitrack.session.v1`: layout, panel take-ids, mixer, trims, practice, YouTube backing). Blob-backed things (file backing, sheet music) are intentionally not persisted.
- `src/multitrack/backing/MultitrackBackingTrackPanel.tsx` — backing UI; the actual `<audio>`/`<iframe>` elements live in the always-mounted `MultitrackBackingMediaHost` (exported from the same file, rendered by the overlay) so sound survives sheet close. Pass `renderMedia={false}` when embedding the panel in a sheet.
- `src/hooks/useCameraSession.ts` — camera lifecycle. Key recent work: `startNativeExperimentalRecording` returns `Promise<boolean>` and stores a settle promise (`nativeStartSettleRef`); `stopNativeExperimentalRecording` **awaits that settle** so Stop is safe during the didStartRecording window (this killed the original "second box freezes" wedge); `setSuppressNativeBridgeRecovery(true/false)` is set on multitrack open/close so failures never tear down the stage preview.
- `App.tsx` multitrack handlers ~line 1920–1990; `<MultitrackOverlay>` JSX ~line 3800.
- Native: `ios/App/App/BestTakeAudioPlugin.swift` (`renderMultitrackVideo` now honors per-source `trimStartSec`/`trimEndSec`), `NativeCameraRecordingEngine.swift` (capture session, frame pump, `ensureNativeCameraSessionHealthy` recovery), `BestTakeAudioPlugin.m` (**CRITICAL: every new plugin method must ALSO be listed here as `CAP_PLUGIN_METHOD` or JS gets UNIMPLEMENTED silently** — this bit us once already).

## The open bug and the fix that needs on-device verification

**Symptom (owner-reported):** after recording take 1, the camera stream freezes and take 2 can't record.

**Diagnosed mechanism:** any take playback (review Preview, tile quick-play, sync playback) calls `preparePlaybackRoute` → flips AVAudioSession to a playback-focused route → **iOS interrupts the live AVCaptureSession** → frame pump freezes; nothing healed it.

**Fix applied (unverified on device):** `ensureNativeCameraSessionHealthy()` (native session rebuild/restart, idempotent — see `nativeCameraTest.ts:178`) is now called at every playback→record seam in `MultitrackOverlay.tsx`:
- `openRecordingForPanel` (stage open)
- `onRecord` (before count-in)
- `handleConfirmTake` / `handleRetryTake` via `restoreRecordingReadiness()` (which first runs `completePlaybackRouteRestore()` to release the playback route hold)
- the 4s camera watchdog failure path

**If the freeze persists after this**, next steps in order:
1. Filter Xcode console for `NativeCameraRecovery` / `[NativeCameraTest]` — check whether `ensureNativeCameraSessionHealthy` runs and whether it reports rebuilding.
2. Check `AVCaptureSessionWasInterrupted` / `Ended` notifications — the engine may need an interruption observer that calls the same recovery (add in `NativeCameraRecordingEngine.swift`, mirroring the `didBecomeActiveNotification` observer pattern already there).
3. Suspects if still stuck: `restoreAudioSessionAfterTest()` in the engine's `didFinishRecording` (reasserts recording route mid-preview), and `attachPlaybackRouteEndedListener` in `takePlaybackAudio.ts` (fires `restoreRecordingRouteAfterPlayback` on the native side when preview media ends — may race the record start).

## What was just added (this session, latest first)

1. **Freeze fix** (above) — unverified on device.
2. **Trim** — per-tile trim (start/end) with:
   - UI: tile ⋯ sheet → Trim → nudge sheet (±1s/±0.1s, Reset, "Preview in sync").
   - Playback: trim-aware sync engine (see above).
   - Persistence: trims survive restart.
   - **Export**: `multitrackExport.ts` passes `trimStartSec/trimEndSec` per source; Swift `renderMultitrackVideo` inserts the trimmed `CMTimeRange` (audio + video share it).
3. Full canvas + stage UI rework (see Architecture map).

## Verification checklist (owner runs on device)

1. **The freeze repro**: record box 1 → Preview it → Keep → immediately record box 2. Repeat with quick-play of box 1 from the grid in between. Camera must stay live; recording must start.
2. Stop during count-in / instantly after Record — error toast at worst, never a wedge.
3. Trim: record 2 boxes → Trim box 2 start +1s → Play All (box 2 enters late… actually starts 1s into its content, aligned) → Share → exported video reflects the trim.
4. Mixer volumes/mutes; monitor chips (mute click → silent count-in continues visually; mute box 1 → silent while recording box 2, audible in playback).
5. Kill/reopen → canvas restores (layout, takes, trims, volumes).
6. Share with 2+ boxes → renders and opens share sheet (`renderMultitrackVideo` was silently unregistered until recently; first end-to-end validation still pending).

## Known deferred work (agreed with owner)

Drag-to-swap tiles · drone as a monitor source · per-tile gain in export (mixer is playback-only) · "Duet a take" entry from the vault · import video from Files · waveform-based trim UI (current is nudge buttons).

## Build commands

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run build
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx cap sync ios && node scripts/patch-ios-audio-plugin.mjs
cd ios/App && xcodebuild -workspace App.xcworkspace -scheme App -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
```

Gotchas: `noUnusedLocals` is on (unused imports fail the build). Cursor also edits this repo — always read current file state before editing. New Swift files must be added to `project.pbxproj` (4 entries — see `AudioEnhancerRenderer.swift` as the pattern) and new plugin methods to BOTH `BestTakeAudioPlugin.swift` `pluginMethods` AND `BestTakeAudioPlugin.m`.

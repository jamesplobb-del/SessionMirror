# BestTake (SessionMirror) - App Context

## 1. App Naming & Identity
- **Product Name**: BestTake (Confirmed by `capacitor.config.ts`, `CAPACITOR_SETUP.md`).
- **Legacy Repository Name**: SessionMirror (Confirmed by `README.md`, `package.json` name).
- *Note: BestTake is the current app/product name and should be treated as such, not merely as an internal plugin name.*

## 2. Core Application Architecture

This section documents the structure of the application.

### Overall Application Architecture
**[Confirmed from code]**
The application is a React 19 + Vite frontend bridging to native iOS via Capacitor.
- **Frontend**: React 19 (`src/App.tsx`, `src/main.tsx`), Vite, Tailwind CSS (v4) (`src/index.css`).
- **State/Hooks**: Heavy use of custom React hooks for hardware lifecycle (e.g., `src/hooks/useCameraSession.ts`).
- **Bridge**: Capacitor v7 (`capacitor.config.ts`).

### Recording Pipeline
**[Confirmed from code]**
The recording pipeline maintains separate paths for Web and Native iOS environments to handle hardware contention and performance.
- **Web**: Uses `MediaRecorder` chunking buffered in memory (`src/utils/mobileVideo.ts`).
- **Native iOS Video**: Uses native AVFoundation for recording to prevent WebKit frame-drop freezes (`src/hooks/useCameraSession.ts`). The frontend suspends the shared WebKit mic track (`suspendSharedMicForNativeRecording`) right before native recording starts to prevent hardware contention.
- **Native iOS File Writing**: Uses `StreamingTakeWriter` (`src/utils/takeStorage.ts`) which appends chunks to `Directory.Data/takes/<id>.mp4` via `Filesystem.appendFile` (`CAPACITOR_SETUP.md`).

### Playback Pipeline
**[Confirmed from code]**
- **State Storage**: React state only stores the `filePath`.
- **Playback Rendering**: The app uses `Capacitor.convertFileSrc(uri)` to play back the on-disk file, rather than keeping large blobs in memory (`CAPACITOR_SETUP.md`).
- **Thumbnails**: Thumbnails are generated directly from the on-disk URL via `generateThumbnailFromUrl` (`CAPACITOR_SETUP.md`).

### Native iOS Bridge Architecture
**[Confirmed from code]**
- **Native Camera Bridge**: `useCameraSession.ts` invokes native methods (`startNativeCameraBridge`, `stopNativeCameraBridge`) to acquire the camera in iOS.
- **Custom Plugin Patching**: `package.json` executes `node scripts/patch-ios-audio-plugin.mjs` during the iOS sync phase, indicating custom patching of iOS native audio behavior.
- **Plugin Directory**: A custom `BestTakeAudioPlugin` directory exists in the workspace root.

### Camera Lifecycle
**[Confirmed from code]**
- **Lifecycle Engine**: Managed by `useCameraSession.ts` (`src/hooks/useCameraSession.ts`).
- **Resource Management**: It strictly controls stream tracks, detaching previews (`detachPreviewStream`), and gracefully halting web tracks before native AVFoundation takeover (`acquireNativeVideoBridge`).

### Audio Session Management
**[Confirmed from code]**
- **Input Preference**: `useCameraSession.ts` applies `micInputPreference` (e.g., 'headphone' or 'built-in') before acquiring `getUserMedia`.
- **Music Tuning**: The stream applies `tuneMusicRecordingStream` (`src/utils/audioCapture.ts` referenced in `useCameraSession.ts`) to optimize the mic for musical capture (disabling echo cancellation, AGC, etc.).

### Creator Studio Architecture
**[Confirmed from code]**
- **Path**: `src/creatorStudio/`
- **Core Engine**: Uses `renderer.ts`, `exporter.ts`, `canvasObjects.ts`, `layout.ts`, `projectStorage.ts`, `state.ts`. It manages rendering data to a canvas or exporting mixed media without relying on external game engines like Phaser.

### Multitrack Architecture
**[Confirmed from code]**
- **Path**: `src/multitrack/`
- **Subsystems**: Includes subdirectories for `recording`, `state`, `synchronization`, `takeVault`, `sheetMusic`, and `playback`. It coordinates playing multiple takes simultaneously using native HTML5/WebAudio APIs.

### Metronome Architecture
**[Confirmed from code]**
- **Path**: `src/metronome/`
- **Core Engine**: `sharedMetronomeEngine.ts` handles the audio pulse scheduling.
- **Timing Logic**: `metronomeTiming.ts`, `pulseModes.ts`, `pulseResolution.ts`, and `timeSignatureDefinitions.ts` power time signatures, beat subdivisions, and UI synchronization.

### Tuner Architecture
**[Confirmed from code]**
- **Pitch Tracking**: Live mic pitch graphs are managed by `useLivePitchTracker.ts` (referenced in `useCameraSession.ts`). In native mode, this pulls PCM data from a native audio tap, bypassing WebKit contention.

### Storage/Database Architecture
**[Confirmed from code]**
- **Schema**: Defined in `src/db/schema.ts` and `src/db/migrations.ts`.
- **Web Implementation**: Uses `jeep-sqlite` and `sql.js` (WebAssembly SQLite) (`src/db/connection.ts`).
- **Native Implementation**: Uses `@capacitor-community/sqlite` (`src/db/connection.ts`).
- **Repositories**: `vaultRepository.ts` and `libraryRepository.ts` in `src/db/` abstract the raw SQLite queries for the rest of the application.

### Practice Timeline Architecture
**[Confirmed from code]**
- **Path**: `src/practiceTimeline/`
- **Features**: This is a robust, heavily-engineered user feature, containing structural logic such as `patternLogic.ts`, `timeSignatureLogic.ts`, `timelineNormalize.ts`, `patternTempo.ts`, and `naturalLanguage.ts`. 

## 3. Needs Human Confirmation
**[Unknown / Requires manual confirmation]**
- **YouTube/play-along pipeline**: A `netlify-youtube-proxy` directory exists, but the frontend integration for YouTube play-alongs requires manual confirmation.
- **Import/Export Pipeline**: `src/creatorStudio/exporter.ts` exists, but the exact mechanism by which final videos are encoded or exported to the user's OS requires manual verification.

## 4. Files I Should Never Touch Casually
Modifying these files carries a high risk of breaking the application's hardware interactions, iOS builds, or user data.

- **`capacitor.config.ts`**: The core bridge configuration. Modifying server URLs or web directories will break the iOS webview's access to `navigator.mediaDevices` (`CAPACITOR_SETUP.md`).
- **`CAPACITOR_SETUP.md`**: The definitive manual for iOS native setup. 
- **`src/hooks/useCameraSession.ts`**: The core camera lifecycle and recording engine. Any changes here risk causing camera freezes, dropping audio frames, or causing race conditions between WebKit and AVFoundation.
- **`src/utils/takeStorage.ts`**: Manages `StreamingTakeWriter`. Any changes to the chunk writing sequence could corrupt MP4 writes or bloat memory in production.
- **`src/db/migrations.ts` & `src/db/schema.ts`**: Altering these can result in permanent data loss for existing users.
- **`ios/App/*`**: Native iOS audio/session files. Do not touch without explicit native iOS development knowledge.
- **`scripts/patch-ios-audio-plugin.mjs` & `BestTakeAudioPlugin/*`**: Build scripts and native code that hack/patch Capacitor's standard behavior. Modifying them will break the audio capture routing.
- **`src/multitrack/synchronization/*`**: The multitrack engine's timing relies on precise WebAudio/React scheduling. Refactoring without deep testing will cause audio drift.
- **`src/creatorStudio/exporter.ts` & `renderer.ts`**: The core of the Creator Studio. These handle canvas rendering and timing; casual changes will break video exports.

## 5. Developer Workflow
**[Confirmed from code]**

### Build Commands
- **Dev Server**: `npm run dev` (copies SQL WASM and starts Vite)
- **Build**: `npm run build` (copies SQL WASM, runs `tsc -b`, and `vite build`)

### Sync Commands & iOS Workflow
- **Sync iOS**: `npm run cap:sync` (builds the web bundle, syncs to iOS, and strictly patches the iOS audio plugin via `patch-ios-audio-plugin.mjs`).
- **Full iOS Refresh**: `npm run ios:refresh` (generates icons, builds, syncs, and patches).
- **Open Xcode**: `npm run cap:open`

### Where Generated Code Exists
- Web build output is generated in the `dist/` directory (`capacitor.config.ts`).
- Application icons and splash screens are generated into `ios/App/App/Assets.xcassets` by the `@capacitor/assets` tool (`package.json` scripts).

### Where Native Code Begins
- The boundary between web and native exists at the Capacitor plugin interfaces, specifically within the `ios/` folder and `BestTakeAudioPlugin/`.

### How Web and Native Communicate
- Communication is facilitated by `@capacitor/core` plugins (e.g., `Filesystem`, `Media`) and custom bridges (e.g., `startNativeCameraBridge` called in `useCameraSession.ts`).

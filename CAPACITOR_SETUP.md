# Capacitor + Filesystem setup for BestTake (iOS)

## 1. Install dependencies

From the project root:

```bash
npm install @capacitor/core @capacitor/filesystem
npm install -D @capacitor/cli
```

For the native iOS shell:

```bash
npm install @capacitor/ios
npx cap add ios
```

Required for saving takes to the iOS Photos library:

```bash
npm install @capacitor-community/media@^8.0.0
```

## 2. Build the web bundle

Capacitor serves the compiled `dist/` folder, not the Vite dev server:

```bash
npm run build
npx cap sync ios
```

## 3. Open Xcode

```bash
npx cap open ios
```

Run on a physical iPhone (simulator camera/filesystem behavior differs).

## 4. How recording storage works

1. `MediaRecorder.start(1000)` emits a chunk every second while recording.
2. On native iOS/Android, `StreamingTakeWriter` appends each chunk to `Directory.Data/takes/<id>.mp4` via `Filesystem.appendFile` — nothing accumulates in RAM.
3. When you stop recording, `finalize()` returns the playback URL immediately; no full-file write step.
4. React state stores only `filePath` + `Capacitor.convertFileSrc(uri)`.
5. Thumbnails are generated from the on-disk URL (`generateThumbnailFromUrl`), not from an in-memory blob.
6. Failed or cancelled recordings call `abort()` to delete partial files.

In Vite web dev (`npm run dev`), chunks are buffered in memory and exposed as a blob URL (same as before).

## 5. iOS permissions

Add to `ios/App/App/Info.plist` if not already present:

```xml
<key>NSCameraUsageDescription</key>
<string>BestTake needs the camera to record practice takes.</string>
<key>NSMicrophoneUsageDescription</key>
<string>BestTake needs the microphone to record audio with your takes.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>BestTake needs permission to save your takes to Photos.</string>
```

## 6. Safe area / notch

- `index.html` uses `viewport-fit=cover`
- Review Mode header uses `env(safe-area-inset-top)`
- Timeline footer uses `env(safe-area-inset-bottom)`

## 7. Re-sync after code changes

```bash
npm run build
npx cap sync ios
```

Then rebuild in Xcode.

## 8. App icon

Source icon: `assets/icon.png` (1024×1024). After updating the icon:

```bash
npm install
npm run cap:icons
npm run cap:sync
```

Then rebuild in Xcode. Web/PWA icons are served from `public/icons/`.

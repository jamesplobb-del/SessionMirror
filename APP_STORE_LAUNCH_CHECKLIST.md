# BestTake — App Store Launch Checklist

Everything below is what's left after the automated cleanup pass. Items are grouped by where you need to do them.

## 1. Run this in Terminal first (repo cleanup)

My sandbox couldn't delete files directly on your Mac's filesystem, so this one block does the physical cleanup + untracks it from git. Paste the whole thing into Terminal from the project root:

```bash
cd ~/Documents/SessionMirror

# Remove the 523MB of committed Xcode build cache (already added to .gitignore)
git rm -r --cached build 2>/dev/null
rm -rf build

# Remove the 3 duplicate/junk Cordova config files
git rm --cached "ios/App/App/config 2.xml" "ios/App/App/config 3.xml" "ios/App/App/config 4.xml" 2>/dev/null
rm -f "ios/App/App/config 2.xml" "ios/App/App/config 3.xml" "ios/App/App/config 4.xml"

# Remove the unused 8.6MB Kenney asset pack (not referenced anywhere in src/)
git rm -r --cached kenney_isometricBlocks 2>/dev/null
rm -rf kenney_isometricBlocks

git add .gitignore
git status --short
```

Review the output, then commit when it looks right:

```bash
git commit -m "Clean up repo: drop build cache, duplicate config files, unused assets"
```

**Note on those duplicate `config N.xml` files:** their existence usually means something (iCloud Drive, Dropbox, or a similar sync tool) is actively syncing this project folder and creating conflict copies. If `~/Documents` is under iCloud Drive sync, that's worth turning off for this folder — live-syncing an active Xcode project is a common cause of exactly this kind of file duplication, and can also cause flaky/corrupted builds. Right-click the SessionMirror folder in Finder and check if it shows an iCloud icon; if so, consider moving the project to a non-synced location or excluding it.

## 2. Already done for you (in this session)

- `.gitignore` updated to prevent `build/`, `config*.xml`, and the Kenney folder from being re-committed
- `ios/App/App/Info.plist`: added `ITSAppUsesNonExemptEncryption = false` (skips the encryption questionnaire on every App Store Connect upload — your SQLite connection uses `'no-encryption'` mode, so this is accurate)
- `ios/App/Podfile`: `platform :ios, '14.0'` → `'15.0'` (Capacitor 8 minimum)
- `ios/App/App.xcodeproj/project.pbxproj`: all 4 `IPHONEOS_DEPLOYMENT_TARGET = 14.0` entries (project + App target, Debug/Release) bumped to `15.0`. The QuickTunerControl extension was already at 18.0, untouched.
- `package.json`: bumped `@capacitor/*` packages and the three community plugins to their Capacitor-8-compatible major versions
- `vite.config.ts`: production builds now strip `console.*`/`debugger` statements automatically (dev server is unaffected) — handles the 256 leftover `console.log` calls without touching 46 files by hand
- Created `ios/App/App/PrivacyInfo.xcprivacy` declaring your UserDefaults and file-timestamp API usage

## 3. Steps that need Xcode on your Mac

1. **Add the privacy manifest to the Xcode project.** The file exists on disk at `ios/App/App/PrivacyInfo.xcprivacy` but Xcode won't bundle it until it's added as a project resource. In Xcode: right-click the `App` group → *Add Files to "App"...* → select `PrivacyInfo.xcprivacy` → make sure the `App` target checkbox is ticked.
2. **Double-check the two privacy reason codes.** I used `CA92.1` (UserDefaults, own app data) and `C617.1` (file timestamps, displayed to user) based on how `AudioRouteConfigurator.swift`/`QuickTunerLaunchCoordinator.swift` (UserDefaults) and `MultitrackTransportEngine.swift`/`NativeCameraRecordingEngine.swift` (file timestamps) use those APIs. Worth a 2-minute sanity check against [Apple's reason table](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api) since this is a compliance document.
3. **Update Xcode to 26.0+** if you're not already on it — Capacitor 8 requires it.
4. **Confirm Node 22+** on your machine (`node -v`) — Capacitor 8's CLI requires it.
5. Run the standard sync:
   ```bash
   npm install
   npm run cap:sync
   ```
   This will pull the new plugin versions, run `pod install` against the updated Podfile, and sync native code.
6. Open the project in Xcode, confirm **Deployment Target** reads 15.0 under both the Project and the App target's Build Settings (should already reflect the pbxproj edit, but worth a visual check before you archive).
7. Build and run on a simulator/device, then do a full Archive to make sure everything still compiles clean under Capacitor 8 before submitting.

## 4. Crash reporting (Sentry) — finish the install

The integration code is written and wired in. It's inert until you install the packages and provide a DSN.

```bash
cd ~/Documents/SessionMirror
npm install @sentry/capacitor @sentry/react
npm run cap:sync          # pulls the native iOS SDK via CocoaPods
```

Then create your Sentry project (free tier, choose **React** as the platform), copy the DSN, and:

```bash
cp .env.example .env
# edit .env, paste the DSN into VITE_SENTRY_DSN=
```

`.env` is gitignored — the DSN never gets committed.

**Verify it works end to end** before you trust it. Temporarily call `sendTestCrash()` from somewhere reachable (a settings screen button, or just at the end of `bootstrap()` in `main.tsx`), run a build on device, confirm the event shows up in Sentry, then remove the call.

### What was wired up

- `src/utils/crashReporting.ts` — init, error reporting, test helper
- `src/main.tsx` — initializes first thing in `bootstrap()`, so boot-time failures are captured
- `src/components/ui/AppErrorBoundary.tsx` — React render failures now report with the component stack
- `vite.config.ts` — injects `__APP_VERSION__` as the Sentry release tag

### Decisions baked in

- **Native crashes are captured**, not just JS — that's the point, since your Swift camera/audio/SQLite plugins are where the hard-to-reproduce failures live.
- **Session Replay is hard off.** It records the screen, which in your app means the live camera preview. Not sampled at zero — disabled.
- **Performance tracing off** (`tracesSampleRate: 0`) to protect the free-tier quota. Errors only.
- **Absolute file paths are scrubbed** from events and breadcrumbs, since take/project titles can appear in sandbox paths.
- **`console.*` is no longer stripped from production builds.** I removed the earlier `drop: ['console']` — Sentry converts console calls into breadcrumbs that only transmit when an error occurs, so your existing diagnostic logging becomes the trail leading up to a crash. Stripping it would leave you with stack traces and no context.

### One follow-up worth doing

Your play-along diagnostics log a large object every 2 seconds during recording (`[YouTubePlaybackProgress]`, `[YouTubePlayAlongDiag]`). Sentry keeps the last ~100 breadcrumbs, so a long recording session will flush out everything useful before a crash lands. Consider throttling those two to every 10s, or routing them through `Sentry.addBreadcrumb` at a lower level.

### App Store Connect

Adding crash reporting changes your privacy answers. In the App Privacy section you'll now need to declare **Diagnostics → Crash Data**, collected, **not** linked to the user's identity, used for App Functionality. Sentry's iOS SDK ships its own privacy manifest, so no change needed to yours.

## 5. Still open — not something I can fix for you

- **Netlify redeploy** — `netlify-youtube-proxy/index.html` has fixes (volume loop efficiency, postMessage origin guard) that only take effect once the Netlify site is redeployed. The app talks to the deployed copy, not the one in this repo.
- **App Store Connect listing** — privacy policy URL, screenshots, description, keywords, age rating.
- **Build number** — bump `CURRENT_PROJECT_VERSION` (currently `3`) if you've already uploaded a build with that number.

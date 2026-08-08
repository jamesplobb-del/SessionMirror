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

## 4. Still open — not something I can fix for you

- **Netlify dependency** for the YouTube play-along proxy — separate conversation, flagged for follow-up.

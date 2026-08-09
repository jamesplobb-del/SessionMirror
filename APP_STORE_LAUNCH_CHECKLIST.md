# BestTake — App Store Launch Checklist

Verified on `launch-prep` on August 9, 2026.

## Verified locally

- Node 24.16.0 and Xcode 26.5 satisfy the current toolchain requirements.
- `npm run build` passes.
- Capacitor 8 sync and CocoaPods install pass without tracked-file drift.
- The native app builds and launches on iOS 26.5 iPhone and 13-inch iPad simulators.
- SQLite opens, migrations run, and existing take paths resolve at simulator launch.
- Sentry initializes its JavaScript and native Capacitor SDKs at simulator launch.
- `PrivacyInfo.xcprivacy` is included in the App target's Resources phase.
- App and Quick Tuner extension versions are both marketing version 2.3, build 4.
- The App target uses iOS 15.0; the Quick Tuner control uses iOS 18.0.
- Release builds use `DWARF with dSYM File` and the App target has a Sentry dSYM upload phase.

## Must finish before archiving

### 1. Add the Sentry build credentials

Add these values to the existing gitignored `.env` file:

```dotenv
SENTRY_AUTH_TOKEN=your_token_here
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=besttake
```

The same file now drives both Vite source-map upload and the Xcode dSYM upload phase. The archive phase intentionally fails if any of the three values are missing, so an App Store archive cannot silently ship without native symbols.

Run `npm run build` once after adding them. Confirm Sentry reports a successful artifact upload and confirm no `.map` files remain in `dist/`.

### 2. Complete the real-device release pass

- Camera record/stop, front/rear camera, permissions, and share-to-Photos.
- Record, save, and play a continuous video of at least 10 minutes.
- Audio-mode recording and playback through speaker, wired headphones, and AirPods.
- Connect/disconnect headphones while recording and while the tuner/metronome is active.
- Background/foreground cycles, a phone-call interruption, a Control Center audio grab, and at least 10 minutes backgrounded.
- SQLite create/edit/delete persistence after force-quit and relaunch.
- Multitrack import, alignment, mix controls, render, save, and playback.
- Quick Tuner widget/control launch and return to the main app.
- Toggle iCloud backup off and on once; confirm no Xcode console error.
- Confirm Bug #2 (Current Take X works on the first tap) and Bug #4 (camera quality remains stable).
- Sanity-check iPhone and iPad layouts, including the camera overlay menu.

### 3. Verify Sentry end to end on the device

In Safari's Web Inspector console:

```js
__besttakeSentryTest.isInitialized()
__besttakeSentryTest.js()
__besttakeSentryTest.native()
```

`isInitialized()` must return `true`. The native test terminates the app by design; reopen it so Sentry can upload the crash. Confirm the JavaScript event resolves to source files and line numbers and the native event resolves to Swift symbols rather than hexadecimal addresses.

### 4. Finish App Store Connect and review metadata

- Privacy policy URL and support URL.
- A privacy-policy link inside the app; Apple requires the policy to be easily accessible in-app as well as in App Store Connect.
- At least one 6.9-inch iPhone screenshot and one 13-inch iPad screenshot. Apple scales those down for the smaller supported sizes.
- App description, subtitle, keywords, category, copyright, and review notes.
- Updated age-rating questionnaire.
- App Privacy: Diagnostics → Crash Data; not linked to identity; not used for tracking; purpose App Functionality.
- EU Digital Services Act trader-status declaration if distributing in the EU.

### 5. Deploy the web proxy change

Redeploy the Netlify site used by `netlify-youtube-proxy/index.html`. The app uses the deployed copy, so the postMessage origin and volume-loop fixes are not live until that deploy finishes.

## Final archive sequence

```bash
npm install
npm run cap:sync
```

Then open `ios/App/App.xcworkspace`, select **Any iOS Device (arm64)**, and run **Product → Archive**. Confirm `CURRENT_PROJECT_VERSION` is 4 immediately before the archive. Increment it for every later upload.

Do not merge `launch-prep` until the real-device pass and Sentry verification are complete.

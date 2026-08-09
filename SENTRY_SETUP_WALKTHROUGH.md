# Crash Reporting (Sentry) — Status & Remaining Steps

## Done

- `@sentry/capacitor` 4.2.0 + `@sentry/react` 10.60.0 installed (versions must stay locked to each other).
- DSN present in `.env` (gitignored, US region, valid format).
- **Native iOS SDK installed** — `SentryCapacitor` 4.2.0 + `Sentry` 9.16.1 pods. This was the missing piece: `pod install` had been failing silently on a CocoaPods UTF-8 error, so the native crash handler was never in the binary. JS errors would have reported; Swift crashes would not have.
- `src/utils/crashReporting.ts` — init, path scrubbing, breadcrumb filtering, test helpers.
- `src/main.tsx` — initialized first in `bootstrap()`, so boot failures are captured.
- `AppErrorBoundary` reports React render failures with component stack.
- Source map upload wired into `vite.config.ts` (inert without an auth token — see below).

### If `pod install` fails again

CocoaPods on this machine needs a UTF-8 locale. Either prefix commands:

```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm run cap:sync
```

Or add `export LANG=en_US.UTF-8` to `~/.zshrc` once and forget about it.

---

## Remaining step 1 — Source maps (do this before launch)

Without this, a production JS crash shows as `App-CN_JN6Ko.js:1:84210` instead of a file and line number. The build wiring is done; it just needs a token.

1. In Sentry: **Settings → Developer Settings → Auth Tokens → Create New Token**, with scopes `project:releases` and `org:read`.
2. Export the values (add to `~/.zshrc` to persist):

```bash
export SENTRY_AUTH_TOKEN=your_token_here
export SENTRY_ORG=your-org-slug
export SENTRY_PROJECT=besttake
```

3. Build as normal. Maps are generated, uploaded, then **deleted from `dist/`** so they never ship inside the `.ipa`.

The release name is `besttake@<package.json version>`, currently `besttake@2.3.0`. It must match `release` in `crashReporting.ts` — both read the same source, so keep them that way.

## Remaining step 2 — dSYMs for native crashes

Native Swift crashes arrive as raw memory addresses unless debug symbols are uploaded. After an Archive, either:

- Let Xcode do it: add a Run Script build phase using `sentry-cli upload-dif`, or
- Upload manually once per release: **Sentry → Settings → Projects → besttake → Debug Files → Upload**, dragging the `.dSYM` folder from your Xcode archive (right-click the archive in Organizer → Show in Finder → Show Package Contents → `dSYMs`).

Manual is fine for launch; automate it later.

## Remaining step 3 — Verify on a real device

Native crash capture cannot be tested in the simulator.

1. Plug in your iPhone, open `ios/App/App.xcworkspace`, select the device, press ▶.
2. Safari on Mac → **Develop → [your iPhone] → BestTake** → Console tab.
   (Requires Web Inspector ON in iPhone Settings → Apps → Safari → Advanced, and
   "Show features for web developers" in Safari → Settings → Advanced.)

```js
__besttakeSentryTest.isInitialized()   // must be true
__besttakeSentryTest.js()              // JS error → Sentry in ~30s
__besttakeSentryTest.native()          // hard native crash
```

`isInitialized()` returning `false` means the DSN did not make it into the build — re-run `npm run cap:sync` and rebuild.

**The native test kills the app immediately. That is expected.** The report is written to disk and uploaded on the *next* launch — reopen BestTake, then check Sentry.

Confirm the native event shows a **symbolicated Swift stack trace**, not hex addresses. If it is hex, step 2 was not done.

### Removing the test hooks

They are harmless to keep and useful for verifying future builds. To remove, delete the `if (typeof window !== 'undefined')` block at the bottom of `src/utils/crashReporting.ts`.

---

## Decisions baked in

- **Errors only** — `tracesSampleRate: 0`. Performance tracing would burn the free tier (5k errors/mo) without telling you anything pre-launch.
- **Session Replay is off by construction.** It records the screen, which in this app is the live camera preview. It is disabled by never adding `replayIntegration` — do not add it. (An earlier version set `replaysSessionSampleRate`, which is not a valid Capacitor option and was breaking `tsc`.)
- **Absolute file paths are scrubbed** from events and breadcrumbs — take and project titles appear in sandbox paths.
- **`console.*` is preserved in production builds.** Sentry converts console calls into breadcrumbs that only transmit when an error occurs, so existing diagnostic logging becomes the trail leading to a crash.
- **High-frequency play-along diagnostics are dropped from breadcrumbs.** `[YouTubePlaybackProgress]` and `[YouTubePlayAlongDiag]` fire every ~2s during recording; Sentry keeps only the last 100 breadcrumbs, so a few minutes of recording would evict everything useful before the crash landed. They still print to the console. Add to `HIGH_FREQUENCY_LOG_PREFIXES` in `crashReporting.ts` if you find others.

## App Store Connect

Crash reporting changes your privacy answers. Declare:

- **Data Type:** Diagnostics → Crash Data
- **Linked to user's identity:** No
- **Used for tracking:** No
- **Purpose:** App Functionality

Sentry's iOS SDK ships its own privacy manifest, so `PrivacyInfo.xcprivacy` needs no change.

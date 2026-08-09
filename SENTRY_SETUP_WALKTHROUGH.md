# BestTake Sentry Setup

## Current integration

- `@sentry/capacitor` 4.2.0 and `@sentry/react` 10.60.0 are pinned to the exact compatible pair.
- `SentryCapacitor` 4.2.0 and Sentry Cocoa 9.16.1 are installed through CocoaPods.
- The DSN is stored in the gitignored `.env` file.
- `src/utils/crashReporting.ts` initializes Sentry, strips absolute paths, drops noisy high-frequency breadcrumbs, and exposes device test hooks.
- `vite.config.ts` uploads production source maps and deletes them from `dist/` after upload.
- The App target's **Upload dSYMs to Sentry** phase uploads native symbols during Release builds.
- Session Replay and performance tracing are disabled.

## One-time credential setup

Create a Sentry organization token with permission to upload release artifacts and debug files. Add the real values to `.env`:

```dotenv
VITE_SENTRY_DSN=https://your-public-dsn
SENTRY_AUTH_TOKEN=your-secret-build-token
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=capacitor
```

Only `VITE_SENTRY_DSN` is compiled into the app. The unprefixed `SENTRY_*` values are build-only credentials and must never be committed.

Keeping the credentials in `.env` matters for Xcode: an Xcode process launched from Finder does not reliably inherit values exported from `~/.zshrc`. Both Vite and the Xcode upload phase now read the same gitignored file.

## Verify source-map upload

Run:

```bash
npm run build
```

The build should log a successful Sentry artifact upload. Source maps are then deleted; this command should print nothing:

```bash
find dist -name '*.map' -print
```

The release name is `besttake@<package.json version>`. It matches the value attached to runtime events in `src/utils/crashReporting.ts`.

## Verify native symbol upload

Archive a Release build in Xcode. The **Upload dSYMs to Sentry** phase calls `scripts/upload-sentry-dsyms.sh` and uploads every dSYM in `DWARF_DSYM_FOLDER_PATH` using the bundled `sentry-cli`.

The archive fails when credentials, `sentry-cli`, or the dSYM folder are missing. For ordinary non-archive Release builds, missing credentials produce a warning instead.

## Real-device event test

1. Install the build on an iPhone.
2. Enable Web Inspector on the phone and connect Safari's Develop console to BestTake.
3. Run:

```js
__besttakeSentryTest.isInitialized()
__besttakeSentryTest.js()
__besttakeSentryTest.native()
```

The native test intentionally terminates the app. Reopen BestTake to upload the stored crash.

Confirm:

- `isInitialized()` returns `true`.
- The JavaScript event shows original source filenames and line numbers.
- The native event shows a symbolicated Swift stack rather than hexadecimal addresses.

The hooks are safe to keep for future release verification.

## App Store privacy answer

Declare Diagnostics → Crash Data as collected, not linked to identity, not used for tracking, and used for App Functionality. Sentry's native SDK supplies its own privacy manifest.

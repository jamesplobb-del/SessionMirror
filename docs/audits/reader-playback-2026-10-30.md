# Reader markup and quick preview — 2026-10-30

Build 30 refines the music marking flow and addresses quick-preview playback interruptions after foregrounding and scrubbing. Source verification passed; signed release verification is in progress.

## Markup

A compact six-control row replaces the reading controls during marking: last pen, eraser, Undo, Redo, options, and Done. Each target is at least 44px; all six fit within a 320px viewport. The larger palette tucks away on the first valid drawing or erasing gesture. Other floating music tools are hidden while marking, without stopping their audio or changing page geometry. Pen colour and width are remembered; opening a score still begins in reading mode. The options menu can turn pages without leaving marking.

Undo and Redo track actual edits, including a whole eraser drag and Clear. A cancelled eraser gesture restores its baseline, including when two-finger zoom takes over. History is bounded to 50 operations and scoped to the score attachment/revision. An active eraser gesture temporarily disables undo/redo to prevent a second finger from splitting the edit. Existing marks continue to save automatically, with the existing save-failure recovery UI.

Drawing snapshots the starting colour and width, preserves coalesced pointer samples and the final endpoint, and updates the live preview at most once per display frame. The normal-fit zoom minimum, half-page turns, zoom reset on turning, and native selection suppression from builds 28/29 remain in place.

The interaction reference was [forScore's annotation guide](https://forscore.co/documentation/annotation/), particularly keeping tools within reach and remembering a drawing choice. This small update does not add automatic Apple Pencil entry, shapes, layers, or the rest of forScore's annotation system.

## Playback

Delayed camera recovery now defers while an audio or camera quick preview is preparing/playing, including recovery that was already waiting when playback started. Native stop commands validate the actual preview owner, so old card cleanup cannot stop a newer preview. Shared completion-listener install/removal is serialized, and the audio-only path installs the listener before playback.

Audio scrubbing immediately enters the existing playback-request sequence. Older stop/start/recovery continuations cannot override a later seek, Pause, or source switch. Starting a replacement stops the old progress clock immediately and preserves completion/failure callbacks. A late WebKit play event cannot restore playing intent after Pause or overlap native audio.

The reported physical-phone lock/unlock and scrubbing failure has not been reproduced locally. The checks reproduce the code-level races with controlled asynchronous timing; on-device playback remains a user verification item.

## Verification and release

Passed: TypeScript; markup interaction and history/storage integration; bounded ink-history tests; 31 production zoom/turn scenarios; menus; page geometry; ink/PDF export; setlist reader. Browser checks with the actual production components confirmed drawing → Undo → Redo, erasing → Undo, panel auto-hide, remembered red pen, Done focus restoration, and hidden floating widgets. At 320px width all six toolbar targets are 44px, with a 294px total width.

Playback checks passed: 15 seek/recovery cases, 23 native playback ownership cases, 5 native-ended ownership cases, hands-free handoff, and the new inline-preview lifecycle checks. The native owner-stop method was extracted and compiled/executed in Swift 5 with inert ports. Independent review found no remaining blocker. Production web build and Sentry upload passed. iOS Simulator build/install/launch passed (112.1s), and the audio-mode screen opened. A record-button interaction timed out when the Mac locked; no simulator playback result is claimed. The simulator app was stopped afterward. The signed archive and profiles passed verification; all 94 production web files match, and the archive contains no source maps, StoreKit test configuration, or development server URL. Source commit: `6b7b154`.

TestFlight export/upload did not complete: Xcode reported `Failed to Use Accounts` with unavailable account credentials in the keychain. The Mac was locked. A request to unlock is pending; retry the existing signed archive after unlock, without rebuilding. Archive: `build/internal-plus-preview-4.2-30/BestTake-4.2-30-InternalPreview.xcarchive`; log: `build/internal-plus-preview-4.2-30/upload.log`. Temporary Plus remains internal-only and expires November 13, 2026 at 11:59:59 PM Eastern. The build 23 App Review submission, purchase pricing, and unsent Apple support draft are unchanged.

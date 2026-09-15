# Multitrack editor audit — September 14, 2026

Implemented in the app source and copied into the iOS project's web assets. This is not an installed device build.

## Box placement

- Extra boxes can be dragged directly without entering Arrange, including while the timeline editor is open. Select a box to resize from any corner. Geometry is continuous within the composition bounds, with a 5% minimum dimension.
- Base boxes remain fixed unless Arrange or the editor is open. Editing is blocked during recording, playback preparation, playback, and export.
- Pointer movement updates a local preview at most once per animation frame. Releasing commits one project update; cancelling discards the preview.
- Coordinates use the actual displayed canvas dimensions. Keyboard arrows adjust move/resize controls by 1%, or 5% with Shift.
- All selected boxes use a separate fixed-size selection toolbar above the box layers so edit/delete controls are not clipped or covered by other boxes. Corner hit areas remain separate as the box shrinks.
- Adding another extra creates a distinct box without resetting an existing empty box. The existing four-extra capacity remains.
- Corner placement shortcuts keep even full-width/full-height extras inside the canvas.

## Timeline fixes

- Removed a second native waveform extraction path; the editor uses the shared cached waveform hook.
- Waveform backing stores are capped at 2048 × 256 pixels (2 MiB of raw RGBA storage per canvas), independent of recording length or zoom. This bound is for the canvas, not total media-decoding memory.
- Ruler marks render only around the visible viewport.
- Clip drag/trim updates are batched per animation frame and flush the pointer-up position. Gesture cancellation restores its original timing.
- Timeline editing pauses playback; save/export/record ownership blocks conflicting edits. Failed saves keep the editor open with a retry message.
- Discard restores image changes as well as timing and section windows. Its label specifies timeline changes; box placement remains a separate immediate project edit.
- Hidden boxes no longer appear as editable lanes, and extra lanes use their Extra labels.
- Shortened the action labels to Extra box and Image so Preview fits at phone width.

## Validation

Passed:

- `npm run build` with Sentry upload disabled: TypeScript and production bundle.
- `node scripts/verify-multitrack-upgrade.mjs`: 1,385 timing/layout/project assertions plus export payloads, recording lifecycle/cancellation, 12 base + 4 extra capacity, replacement safety, and preservation of an existing empty extra's geometry.
- `node scripts/verify-multitrack-editor.mjs`: movement/four-corner resizing across more than 10,000 delta combinations; bounds/minimum size; waveform memory limits; visible ruler bounds for recordings through one hour.
- Browser gestures on the actual MultitrackOverlay with isolated test storage: direct move with and without the timeline open; bottom-right and top-left resize; shrink and expand again; geometry after reload; adding a second empty extra without moving the first.
- Browser checks on the actual timeline component with synthetic media and a controlled test transport: a two-second move produces offset -2000 ms; trimming one second from each edge yields trim [1,7] and compensated offset -3000 ms; a rejected save preserves edits; retry saves and reopens the same timing; Discard restores a removed image.
- Phone viewport 390 × 844: all three editor actions fit within the viewport. No browser warnings/errors were reported in the review tab.
- `npx cap copy ios` completed.

The browser timeline fixture tests editor state and gestures, not native audio output. Physical-device recording, native audio synchronization, and device export were not exercised in this pass. Existing Vite bundle-size warnings remain outside this change.

Fixtures: `scripts/fixtures/multitrack-look/frame.html` and `scripts/fixtures/multitrack-editor/index.html`. Use an isolated development origin to avoid changing real project storage.

## Delete-control follow-up

Moved all selection actions outside the clipped box cells. Delete now has a visible label and an 18-pixel icon in a 44-pixel-high target. Verified in the browser at 390 × 844 that its hit target is unobstructed with overlapping extras and with the timeline open; clicking it removed only the selected test extra. Production build and iOS asset copy passed again.

## Button interaction follow-up

The prior delete-only test did not cover populated-box controls. The cell's capture-phase handler intercepted inner controls, and populated panels rendered buttons inside another button. Fixed by deferring body pointer capture until movement crosses the drag threshold, allowing ordinary taps through, marking explicit inner controls as independent of dragging, and replacing the outer populated-panel button with a container and sibling play surface. Capture ownership is retained through resizing; transferring capture no longer cancels the gesture.

Verified through the full App entry point on an isolated development origin: Workspace → Multitrack; extra-body tap opens Tile options; toolbar Edit opens Tile options; toolbar Move changes geometry; body drag changes geometry without opening actions; corner resize commits new dimensions with the timeline open; Delete removes the test extra. A fresh app load resolved a stale browser session encountered during navigation; no onboarding source change was retained.

Verified with `scripts/fixtures/multitrack-controls/index.html`, using the actual grid and performance components with synthetic WAV media: zero nested buttons; Options invokes the correct box callback; Play advances the media element; Pause stops it; Remove clears only the extra's media and retains base media; Add invokes options; resize and body drag save geometry without invoking options; toolbar Edit and Delete work after dragging. These are manual browser interaction checks, not physical-touch-device or native recording tests. Browser camera/microphone permission was denied, so live capture was not validated.

Production build, existing multitrack regressions, geometry checks, and iOS asset copy passed after these changes. The installed iPhone app was not rebuilt or updated in this pass.

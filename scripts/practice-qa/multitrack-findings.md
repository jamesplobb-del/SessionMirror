# Multitrack, music, import, and export QA pass

This agent report contains source diagnosis and automated checks. The lead subsequently ran actual UI cases, recorded in `sessions/2026-09-26.json`; those observations and `first-batch.md` are the authoritative live coverage record. Grouped inventory rows remain untested wherever important sibling states were not exercised. I made no product-code edits and preserved the existing uncommitted work.

## Automated checks run on 2026-09-26

| Command | Result | Evidence and scope |
| --- | --- | --- |
| `node scripts/verify-multitrack-upgrade.mjs` | PASS | 1,424 model assertions plus exporter payload against a native bridge double and recording/session hook harness. Covers 1–12 parts, layout, count-in, timing, cancellation, and restore. Does not play rendered video in the app. |
| `node scripts/verify-multitrack-sharing.mjs` | PASS | In-memory project file round trip with five synthetic WAV parts, sixth-part return, exact bytes, mix, backing, sheet metadata, and malformed-file rejection. Does not operate iOS share/import UI. |
| `node scripts/verify-multitrack-editor.mjs` | PASS | Geometry bounds and timeline raster/ruler model assertions. Does not perform touch gestures in the app. |
| `node scripts/verify-music-library.mjs` | PASS | In-memory storage assertions for order, folders, score setup, isolation, and navigation restore. Does not click library controls. |
| `node scripts/verify-routine-music.mjs` | PASS | Music exercise and routine model checks, including invalid/empty files. Does not render a PDF in the app. |
| `node scripts/verify-document-handoff.mjs` | PASS | iOS plist check and mocked Capacitor cold/warm PDF handoff. Does not open a real file through iOS Files. |

No concrete failure surfaced in these commands. They establish model and bridge expectations only; actual camera, audio route, Files, share sheet, PDF display, and video render behavior remain open.

## Importable two-part practice fixture

Run `node scripts/practice-qa/make-multitrack-fixture.mjs` to regenerate `results/media/qa-pulses-two-part.btmulti` from the 440 Hz and 660 Hz synthetic WAV files. The generator uses the app's `buildMultitrackFile` and `readMultitrackFile` functions and verifies both imported audio assets byte for byte. The resulting file is 706,826 bytes. In the web app, open multitrack **Projects → Share & collaborate → Import shared project** and choose that file. The source import flow creates a separate project and persists imported blobs through IndexedDB; the lead subsequently verified import, playback, mix settings, and reload through the UI (UI-17–19). These are audio-only parts, so they exercise import, project restore, transport, mix, and timing, but cannot establish camera video or native render quality.

## Confirmed browser reload failure: imported Music score disappears

Observed in the browser: import `scripts/fixtures/app-design/music-layout-check.pdf`; the score opens with two pages and page navigation works. Create a `QA Scores` folder, enter selection, open **Delete all** confirmation, then **Cancel** and **Done**. After a full reload, the folder remains but Music shows the empty state. The cancel action does not call `confirmDelete` or `deletePracticeChart` in `MusicLibrary.tsx`, so it does not explain the loss. The lead then independently reproduced the same failure by reimporting, waiting for the score to appear, and reloading without entering selection or deletion (UI-27).

Source diagnosis: `savePracticeChart` stores browser imports only in its module-level `charts` Map. On reload, that Map is empty. `hasPracticeChart` returns true from saved metadata only on native, and `loadPracticeChart` returns null immediately on web. `MusicLibrary` filters project rows through `hasPracticeChart`, so a durable project row and folder placement can remain while its score disappears. This diagnosis is specific to the web build; native chart files use `Filesystem` and metadata and need independent device testing.

`node scripts/practice-qa/regressions/music-web-reload.mjs` is a focused, intentionally failing regression using the actual chart storage module. It imports a PDF, confirms the score is available, then loads a fresh module instance with browser storage retained. It fails at line 36: `imported browser score should still appear in Music after reload` (`false !== true`, exit 1). No delete action runs in the test. This is a reproduced code-path failure, not a simulated click through the app. No app fix was made during QA.

## Priority actual-app scenarios

1. Start a new multitrack project. Record two short parts with headphones, stop/review/use each, seek and Play all, then reopen the project. Exercise Retry and camera permission denial on a disposable project. Record a third part from a later playhead position and confirm sound and picture align.
2. Import a short licensed or synthetic audio backing file and a two-page PDF/image. Record against the backing, turn a PDF page, edit image placement and timing, then render and preview video. Compare preview with transport for timing, page placement, layout, and volume. Try YouTube as a practice reference and verify it is absent from exported audio.
3. Open Editor. Trim and move a clip, adjust mute/volume, set a visibility window, and add an extra box. Check preview, export, and project reopen for identical results. Exercise Done and discard separately.
4. Share a project file through the native share sheet, import the actual saved `.btmulti`, add another part, return-share, and reimport. Verify originals and imported copies have independent names/parts; reject a corrupt file without changing the active project.
5. Import a multipage PDF and multiple photos into Music. Search, organize folders, change a score's tools, annotate a page, close/reopen, then delete one score through confirmation. Open another PDF from iOS Files with the app cold and warm. Verify only the intended score, settings, and markings change.
6. Try video Render & preview, Share video, and Save to Take Vault on a real iOS build. Include auto and manual end, cancellation, background/foreground, and low storage if feasible. Record the exact device/OS/build, inputs, taps, observed state, and resulting file for each run.

For every scenario, mark corresponding inventory rows `pass` or `fail` only after observation. On failure, capture the smallest reproducible sequence, expected and observed result, device/build, and a screenshot or console log path. Keep the original media and project files available so the run can be repeated.

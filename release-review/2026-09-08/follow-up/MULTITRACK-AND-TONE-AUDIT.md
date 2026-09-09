# Follow-up review — September 8, 2026

## Build status
The light Signal icon and launch appearance are in the main app. Web sync and an unsigned generic iOS build succeeded. Xcode still needs to run the app on the phone; no phone installation is claimed here.

Update: the user approved implementation. Bottom controls, larger take previews, the Tone Studio name, and the prepared audio fixes are now integrated into main. The multitrack findings and original-preservation redesign below remain open; they were audit recommendations rather than implemented preview fixes. The separate review remains available. Open http://127.0.0.1:5190/refinement-review.html and choose **Take preview** or **Record** with **Depth · Electric** selected.

## Controls and take previews
- Reduced blue icon stroke weight, removed the blue glow, and reduced interior fill in audio-mode bottom controls.
- Tapping Best or Current opens a larger preview sheet. Full screen expands it; Back returns to the recorder. Kept the existing playback and drag-dismiss components.
- The review demo uses generated video, not personal recordings. Both comparison panels demonstrate the new interaction; the right panel has Electric styling.

## Multitrack findings
1. **Playback and export differ for section windows.** Playback filters panels by section time and can reflow the grid. Export computes a static layout and does not send section start/end to native rendering. Confirmed by inspecting the export request through a mock bridge. Export should honor those sections, or clearly label the limitation before export.
2. **Uploaded backing audio and sheet assets do not survive reopening.** Persistence intentionally omits temporary blob/file assets. Save durable local copies and restore them with a missing-file recovery flow.
3. **Empty-library restoration can stall.** Hydration waits when the saved session expects takes but the current takes array is empty. The hook needs an explicit library-loaded signal to distinguish loading from all referenced takes having been deleted.
4. **Stored values need validation.** A saved volume of 99 and tempo of -20 were accepted. Clamp restored values to supported control ranges and normalize trims and section bounds.

Normal mixer, trim, and section persistence passed. Missing take IDs become null. Volume, mute, and trim reach the native export request correctly. These checks do not prove native rendering, synchronization, count-in, or long-session recording works on a phone. Those require an actual device session and exported media inspection.

## Audio Enhance → proposed name: Tone Studio
This feature is EQ, compression, and room sound. “Tone Studio” describes its purpose without implying AI repair or noise removal.

Approved improvements integrated into main:
- Compression at zero now produces a 1:1 ratio. Previously it still produced 1.5:1. The native renderer bypasses its dynamics unit at zero while retaining independent makeup gain.
- Background rendering captures its settings before waiting, so later preset edits do not change that pending render.
- If hands-free replay is still busy after the wait limit, processing skips replacement instead of proceeding into active playback. This is a conservative skip, not a deferred retry queue.

Further changes needed before a broader release (not part of this integration):
- **Preserve the original.** Native enhancement currently replaces the recording file. Switching the effect off cannot restore the raw recording afterward. Prefer Original / Preview / Save a copy with explicit processed-take labeling.
- **Coordinate playback and file replacement.** The candidate timeout guard addresses the observed wait-limit path. A shared media-operation coordinator is needed to rule out playback restarting during subsequent asynchronous file preparation.
- **Reconcile processed duration.** Audio rendering can add a tail; duration and pitch-related metadata should be refreshed after processing.
- **Compare native and web sound.** Web convolution and native room reverb differ, and native dynamics are an approximation of the web compressor. Match perceived loudness and test attack, clipping, and instrument tone with real recordings before changing presets.

## Evidence and limits
`audit-checks.mjs` exercises real application helpers with an in-memory store and mocked native bridge. `audit-results.txt` records the main app findings; `candidate-audit-results.txt` shows the zero-compression ratio corrected to 1. Swift parsing and TypeScript checks cover candidate syntax/types; no listening test or candidate native device run is claimed.

`preview-snapshot/` preserves the review files. These are snapshots from the isolated review branch, **not drop-in replacements for main**: App and playback files also contain preview harness differences and predate some approved production fixes. Integrate only the reviewed follow-up changes.

## Integrated build verification
Production type check/build, iOS sync, unsigned generic-device Xcode build, trim metadata, hands-free cycle, playback routing, audio lifecycle and zero-compression checks passed. All 72 web output files match the iOS bundle. No physical-device installation or listening test was performed. Main integration retains prior trimming safeguards and excludes preview-only fixture code.

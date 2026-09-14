# Multitrack upgrade — September 14, 2026

## Implemented

- Twelve base layout boxes plus up to four extra boxes created independently above the layout. Adding an extra box never consumes a base slot.
- Extra boxes can enter and leave at specified song times. Their audio follows that window by default; a per-part checkbox also supports visual-only visibility changes.
- Arrange boxes mode: select a box, drag Move, or drag its corner to resize. Every part has independent width and height sliders. Extra boxes also have corner-position presets.
- Project-local labels, ordering, timing, trimming and geometry. Smaller layouts park extra base parts without dropping their recordings. Hidden parts are excluded from playback and export.
- Named projects, duplication, automatic saving, restored assets and Undo. Replacing a recording clears stale clip timing, trim and mix settings. Source recordings in the Take Vault are not rewritten by alignment edits.
- Shared percentage geometry for the preview and native export, including custom frames, extra boxes and timed score images.
- Portrait, landscape and square output at 1080×1920, 1920×1080 and 1080×1080 respectively. An optional project end time drives preview and export.
- Timed score screenshots plus an upward roll option for the starting score image, with adjustable duration and final position. Later screenshots can be placed on the timeline.
- Rendered-video preview, progress, cancellation, Share and Save to Take Vault. Completed renders are reused when retrying Share/Save without edits. Editing invalidates the displayed render.
- YouTube remains a practice reference and is explicitly excluded from exported audio. Imported backing audio is included.

## Timing and export corrections

- Removed the monitor builder's zero clamp, which discarded Play All's requested half-second lead-in and put native audio ahead of its visual timeline.
- Native visual playback now anchors to the returned scheduled timestamp, including playback resumed at a nonzero playhead, rather than to the later resolution of video playback promises.
- The score/playhead advances during native recording monitoring, including solo recording with no reference videos.
- Late extra recordings use a source trim to remove their own count-in and a project-local offset to place their downbeat at the intended song time.
- Recording setup is serialized and generation-checked. Cancellation during pending camera or transport setup cannot revive a discarded run. Rejected capture starts report a recoverable error.
- Count-in tempo, meter and sound are project settings. Unsupported native rhythm/feel controls were removed from the multitrack count-in panel. BPM is the counted click rate, with the displayed number of clicks per bar.
- Export clips are intersected with actual media track ranges and the chosen ending. Fully trimmed clips do not produce a phantom last frame. Audio track start offsets preserve their silent head in monitoring and export.
- Extra/custom video rectangles cut through the score overlay in the native compositor. Overlapping rectangles remain correctly masked. Timed single score layers, mirror playback and rolling image positions are passed through to export.

## Verification

`node scripts/verify-multitrack-upgrade.mjs` covers:

- 1–12 layout geometry and timing calculations at 40, 60, 120 and 300 BPM, with 0, 1, 2 and 8 count-in bars;
- lead-in, resume, late entries, trimming and export endings;
- actual exporter payloads, floating-layer order, timed/rolling score, mixer state, mirror state and cancellation;
- project restore and actual session actions with twelve base boxes plus four extras;
- twelve successive recording lifecycles, camera rejection, cancellation during camera/transport setup and stale-start suppression.

Browser inspection verified the twelve-box layout plus a separate extra box, drag resizing, Undo, collapsed part settings and independent size controls. Production web and native simulator builds are checked separately. These checks do not constitute a physical-device audio timing measurement or a completed real-media export/share test.

## Device acceptance pass required before release

1. Record parts 1–12 against the same click, using clear attacks/claps at known beats. Preview/Keep each, immediately record the next, and repeat after previewing existing parts.
2. Compare attacks near the beginning and end of a longer performance for cumulative drift. Test wired headphones, speaker monitoring and Bluetooth separately.
3. Cancel during arming and count-in, retry immediately, interrupt with an app/background transition, then record again.
4. Add an extra part near the end. Confirm its audible entry, picture entry and exit, resizing and placement over the score. Repeat with multiple overlapping extra boxes.
5. Export portrait, square and landscape with twelve parts plus extras, muted/quiet parts, trimmed/late parts, uploaded backing and changing/rolling score images. Compare the final file to the preview, including the ending and mirrored takes.
6. Cancel export, retry, cancel the system share sheet, share again and save to the Vault. Reopen projects and confirm that every edit and imported asset remains available.

Use headphones when assessing synchronization so speaker bleed does not create an apparent doubled attack. The existing hardware-latency compensation remains in the native transport; only a device recording can verify its physical accuracy.

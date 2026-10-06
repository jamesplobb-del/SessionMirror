# BestTake multitrack bounded audit — 2026-10-06

AUDIT ONLY. Canonical workspace /Users/jameslobb/Documents/BestTake. HEAD cc66c3ee0cf7729f376276518a363dc6a054491a. Existing dirty Music/routine/game changes preserved. No app source/config edits. Source hashes in source-hashes.txt. Existing historical inventory used for discovery; current source authoritative. No browser/native UI exercised by this domain agent. Tests execute current modules with explicit React/native/storage boundary doubles, except native AudioEnhancerRenderer DSP fixture compiled/executed on macOS.

## Confirmed findings

### P2 — shared project exchange loses front-camera panel orientation after a reopen
Source: src/multitrack/state/multitrackFile.ts:137; src/multitrack/state/multitrackPersistence.ts:69,129,145; src/multitrack/export/multitrackExport.ts:119; src/multitrack/performance/PerformancePanel.tsx:135.
Reproduction: a recorded front-camera panel has mirrored:true. Reopen against the original Vault take whose mirrorPlayback is false/unset; persistence correctly retains panel.mirrored. Build .btmulti and read it. Actual imported panel.mirrored is undefined; take.mirrorPlayback remains false, so preview and native export stop mirroring. Expected collaboration preserves displayed orientation. Musician impact: a reopened front-camera part changes handedness/framing when sent to a collaborator and returned. Actual-module save→reopen→build→read sequence executed in adversarial.mjs. Minimal fix: sanitize and retain mirrored:p.mirrored===true while constructing each imported panel. Acceptance: true/false panel mirroring roundtrips with raw Vault take mirrorPlayback unset; imported exporter payload mirrors exactly as source.

### P2 — one missing received take blocks the entire saved project and its repair controls
Source: src/multitrack/state/multitrackPersistence.ts:130-135; src/multitrack/state/useMultitrackSession.ts:93-110 and242-266.
Reproduction: save a project containing collab-* received media, then have that asset unavailable in its store (restoreAsset returns null; transient read rejection also escapes). loadMultitrackSession rejects "Could not restore workspace" before panels are reconstructed. Expected reopen an editable project retaining healthy local parts, timing, mix, backing/sheets, and a missingTakeId placeholder for the received part. Actual initial workspace restore remains unhydrated; opening from another project fails and keeps the prior project. Reimporting the original exchange file is the only provided path, potentially losing subsequent local edits if musician cannot access it. Storage metadata is not erased; this is availability/recovery failure, not proven deletion. Minimal fix: catch each shared take restoration independently, omit only unavailable take from lookup and preserve ID/descriptor so existing missing-panel controls become accessible. Acceptance: one missing/rejected shared source still opens healthy parts and settings; two autosave/reopen cycles retain identity; restored source clears placeholder without replacing project.

### P3 — bridge cleanup rejection overrides successful render result
Source: src/multitrack/export/multitrackExport.ts:281-284 and src/multitrack/components/MultitrackOverlay.tsx:523-539.
Explicit injected fault: native renderer returns rendered path, listener.remove rejects. Real exporter rejects rather than returning successful renderedPath; caller cannot retain that completed file and requests a render again. Minimal fix: best-effort listener removal isolated from successful result/error classification. Acceptance: renderer success plus rejected cleanup still retains path; renderer failure plus rejected cleanup retains original render_failed result. Confirmed under mock failure only; real bridge failure frequency not measured.

## Coverage matrix

Executed = current module logic executed; source-only = controls/wiring inspected without UI interaction; unavailable = requires physical capture/native UI/network route evidence. Most groups have both module checks and unverified surface behavior.

| Actual feature group | Status and evidence |
|---|---|
| New/open/duplicate/rename project, autosave and retry | Source-only async hook wiring; executed persistence roundtrip and missing-source failures. Native switch/UI/storage-quota race not certified. |
| Editable .btmulti import/share, independent IDs, six-way collaboration | Executed sharing (byte-exact five parts→import→add sixth→return), malformed/truncated/version cases; adversarial orientation roundtrip. Native share sheet cancellation UI unavailable. |
| Take Vault audio/video selection and reconnect | Executed reference-preview, asset-recovery actual session actions, picker timing helper; some picker controls are source contracts only. |
| Raw file/native chunk read and incoming .btmulti | Executed native-read bounded 3MiB reads using filesystem double; incoming launch/dedup event wiring source-only. Actual Files/share-sheet handoff unavailable. |
| Backing audio import/replace/play/clear/gain, YouTube reference | Source-only UI/import lifecycle; executed persistence, stale missing source removal and exporter mix/YouTube exclusion contract. Network iframe/timing/acoustics unavailable. |
| Photo/PDF/library score, pages, cues, framing, roll, missing reconnect | Executed asset-recovery, quiet, upgrade layer/page/timed cue payloads and recovery controls; actual PDF/image picker rendering source-only/unavailable. |
| 1–12 base slots + four extras, bounds, reorder/hide/show/remove | Executed upgrade/quiet/editor helpers and session slot actions, replacement; source-only accessible reorder/remove buttons. |
| Mute/gain, monitor mutes, enhancer | Executed native mix ordering, reference-preview, export payload, JS enhancement state; native DSP fixture verifies musical transients/sustain/stereo/duration/gain/silence. Physical monitoring acoustics unavailable. |
| Solo / speed | No multitrack solo or speed user control found; source uses normal playback rate. Not presented as tested features. |
| Play/pause/restart/seek, align/trim, source mapping, waveform zoom | Executed reference-preview hook with media doubles, readiness/upgrade/editor timing mapping and geometry; exact device audiovisual sync unavailable. |
| Camera framing/front mirror, portrait layouts, overlays | Executed composition/export payload/geometry and exchange orientation failure; real camera UI unavailable. |
| Record/overdub/count-in/stop/review/retry/cancel/keep | Executed upgrade actual recording hook with camera/transport doubles: twelve boxes, denied camera, cancel during pending camera/transport, stale restart; count-in cases 0/1/2/8 bars, 4/4 and6/8, click off and slow startup. App final take handoff source-only. |
| Undo/reset/remove/relink/missing/reopen | Executed reset-layout/session replacement and asset recovery; missing shared media confirmed failure. Undo/reset controls source-only beyond session model checks; true reload UI unavailable. |
| Export render/preview/save Vault/share/progress/failure/cancel | Executed exporter payload and pre-abort, normal success, injected render and cleanup failure. Source-only UI cache/confirm/save/share branches. Native AVFoundation render/acoustics/cancel during encoder unavailable. |
| Headphone route loss, native bridge, background/wake | Executed bridge ordering and recovery after prepare failure; inspected overlays/native transport/route gates. Physical disconnection/interruption/background capture unavailable. |
| Plus access | Source-only requirePlus gates on layout/slots/record/music/backing. Verified plusAccess broader checks owned by recording/root; downgrade/import policy not determined from multitrack in isolation. |

## Executed verification outputs

13 scripts exit0: verify-multitrack-upgrade (1428 assertions plus exporter and recording/session hooks), editor, sharing, readiness (18 timing+4 readiness), asset-recovery, recovery-controls, native-read, picker-reconnect, transport-handoff, reference-preview, quiet, count-in, enhancement. Each log retained in this directory. These mix actual execution with source assertions: recovery-controls and picker-reconnect do not independently certify UI behavior. Adversarial.mjs exits0 by asserting the three observed failures as audit evidence; this is a reproduction harness, not a product regression pass.

## Optional optimizations

1. Extend collaboration regression to every persisted panel field, especially mirrored; avoid a second serializer silently dropping a supported field.
2. Add source-by-source shared-media recovery tests alongside existing backing/sheet/Vault recovery so the recovery policy is uniform.
3. Keep completed render results even when bridge cleanup fails; capture cleanup warning separately for diagnostics.

Lead challenge: external navigation during async arming can hide a live recording hook; lead owns App/Overlay integration confirmation. Existing closeRecorder cancels hook, but pending take processing requires a target before evaluating discard flag, delaying cleanup until another target opens. These remain source leads, not confirmed end-to-end findings here.

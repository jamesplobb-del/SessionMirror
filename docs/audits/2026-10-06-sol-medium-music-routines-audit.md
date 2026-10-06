# MUSIC and ROUTINES audit — 2026-10-06

Baseline: HEAD cc66c3e; source checkout /Users/jameslobb/Documents/BestTake. Audit only; no app source, commit, release, telemetry, or dependency changes. Existing modified ANTIGRAVITY_APP_CONTEXT.md and untracked launch-site/ were preserved. Sol medium scope: music library, routine builder/runtime, shared plans, setlists, annotation ownership/persistence. Root owns browser operation. Browser and native runtime were unavailable; no live reader, native audio, PDF rendering, or device usability claim is made.

## Findings

### M1 — P1: a failed native score replacement destroys the prior file

Anchor: `/Users/jameslobb/Documents/BestTake/src/utils/practiceChartStorage.ts:124`–125. iOS/native filesystem path.

Trigger: attach A.pdf to a practice item, open/cache it, then replace with B.pdf of the same MIME while localStorage metadata setItem rejects (quota/storage failure). Filesystem.writeFile overwrites the existing score path before metadata is committed. The function throws before cache update; the reader can still show A and the old filename while the durable file contains B. After a fresh launch B appears under A's filename. The failed import therefore does not preserve the musician's prior score. Different-extension replacement instead leaves an uncommitted new file.

Evidence: executable production module body with mock Capacitor/Filesystem and failing localStorage; assertions prove rejected save, disk NEW_SCORE, cached OLD_SCORE, name old.pdf. This proves mutation order and failure behavior; real device quota was not induced.

Smallest reliable fix: stage new bytes under a unique temporary/versioned path and make the metadata pointer commit the durable boundary; retain the prior path until commit succeeds, clean staged bytes on failure. If canonical paths must stay, save a backup and restore on metadata rejection, surfacing restoration failure explicitly.

Regression: same MIME and different MIME replacements, metadata quota rejection, failed restoration/cleanup, retry, cache state and cold reload must agree with the reported result.

### M2 — P2: replacing music in a routine applies the old part's marks to the new part

Anchors: `/Users/jameslobb/Documents/BestTake/src/components/MusicRoutineBuilder.tsx:125`; `/Users/jameslobb/Documents/BestTake/src/components/RoutineMusicSetup.tsx:50`. All platforms.

Trigger: mark A.pdf, edit the routine music item, use Change/Replace to put B.pdf into the same practice folder, then read B. These callers replace the attachment but never clear project-keyed ink. Contrast the reachable reader replacement handler at `/Users/jameslobb/Documents/BestTake/src/components/PracticeChartLayer.tsx:554`, which explicitly clears ink after a replacement. Routine removal also leaves that ink for a subsequent attachment.

Consequence: A's breath marks, fingerings, and circled accidentals are displayed on unrelated B pages; this can mislead rehearsal. Markings on nonexistent B pages remain hidden but persisted.

Evidence: actual savePracticeChart plus chartInk functions retain A's stored stroke after B replaces it; source-confirmed caller omission. No browser image comparison performed.

Fix: centralize successful replacement handling so all UI entry points apply the same score/annotation ownership policy. Confirm removal of marks before mutation and clear them only after durable replacement succeeds; alternatively version annotations by attachment identity. Keep recording ownership unchanged.

Regression: annotate A, replace through each routine entry point, load B after restart, assert A marks absent; cancelled and failed replacement retains A and its marks.

### M3 — P2: custom routine music attachment rejects valid Files PDFs with empty MIME

Anchors: `/Users/jameslobb/Documents/BestTake/src/components/RoutineMusicSetup.tsx:48`–50; reachable from `src/components/GuidedRoutineBuilder.tsx:610`. Native/iOS Files primarily; any browser-provided empty MIME file has identical behavior.

Trigger: build/edit a custom Music routine item, choose score.pdf whose File.type is empty. The handler creates the practice folder, then calls savePracticeChart directly, whose MIME allowlist rejects it. The bulk import paths correctly call prepareRoutineMusicFile, which documents and normalizes this iOS Files case at `src/utils/routineMusic.ts:45`. The custom handler also skips readability/empty-file validation, allowing unreadable files with an accepted MIME to become attachments.

Consequence: a valid musician score fails only through this entry point and leaves an unused practice folder. A corrupted accepted-MIME score can be saved and discovered as unreadable later.

Evidence: extracted actual choose callback, real savePracticeChart, File('score.pdf', type=''); assertions show one folder created, no onChange, visible unsupported-type error. Source confirms validation omission; native Files picker timing not tested.

Fix: await prepareRoutineMusicFile before creating the project and before saving, consistently with both bulk import handlers.

Regression: empty-MIME .pdf, application/octet-stream PDF, corrupted/empty accepted-MIME file, uppercase extension; ensure rejected files create no project and change no prior attachment.

### M4 — P2: long annotation gestures lose their ending after reload

Anchors: `/Users/jameslobb/Documents/BestTake/src/components/practiceChart/chartInk.ts:106`; save at line136. All platforms.

Trigger: draw a long continuous curved/writing stroke that retains more than 400 normalized points after simplifyStroke. PracticeChartPaper's pointer handling has no cap and sends the full simplified stroke at line267. Save persists all points and returns true, but parseInkStrokes keeps only the first400 points on next load.

Consequence: annotations appear saved during rehearsal, then are partially erased when the score reopens. No save warning is shown.

Evidence: actual simplifyStroke, saveInkStrokes, loadInkStrokes; 650 visible/saved points return as400. This is a synthetic valid gesture, not a device-drawn specimen.

Fix: apply one consistent bounded representation before both visible state and storage; simplify/resample the whole curve while preserving its endpoint rather than truncating its tail. Alternatively permit the supported saved-point count on read with a suitable total-size limit.

Regression: long curve above400 points round trips with start/end preserved and a bounded shape error; ordinary short marks and erase/undo remain stable.

### M5 — P2: failed history migration hides valid routine progress at cold launch

Anchor: `/Users/jameslobb/Documents/BestTake/src/utils/practiceRoutines.ts:418`. All platforms; legacy-day migration/history-missing recovery under storage pressure.

Trigger: valid current-day `besttake:practice-routine-day:v1` has completed steps but no matching history row. History setItem rejects while loadRoutineDay attempts migration. The write happens before selecting the valid legacy candidate; the outer catch returns freshRoutineDay.

Consequence: Today shows completed work as unchecked despite the valid saved day still existing. When App subsequently saves this fresh state, the old visible progress can be replaced if writing becomes possible.

Evidence: bundled production routines functions, one completed Warmup legacy day, history key rejection; returned doneStepIds=[], original persisted legacy still contains Warmup. No device storage exhaustion performed.

Fix: read/select/reconcile valid day data independently of migration writes. Treat migration as best effort and preserve the candidate even if archive writing fails; report persistence trouble separately.

Regression: valid legacy day with done/skipped/paused/session/time data and failing history write returns the same reconciled paused progress; successful later migration/retry does not overwrite it with empty state.

## Validation

All checks below exited0 on the current source:

- verify-music-library: saved ordering, missing/deleted entries, score setup/routine fallback and isolation, navigation restore.
- verify-music-setlists: actual model storage/order/repeated occurrences/snapshot/replacement, limits, quota/retry/corruption preservation/list-only delete; editor callback save/open/retry/draft/doubletap with isolated hooks, no DOM.
- verify-setlist-reader: reader silence, same-score routine detachment, occurrence identity, setup/progress preservation, blocked navigation recovery.
- verify-routine-music: empty library, selected counts, score import model, advanced setup persistence, reuse isolation/selective tools, invalid/empty files on the covered bulk path.
- verify-routine-start-recovery: builders async failure/doubletap/retry, storage failure prevents launch, music/handsfree cancellation/resume, selected routine order, stale IDs, size limits, App handoff checks.
- verify-routine-library-transaction: quota rollback of routines/exercises, retry deduplication, newer/unrelated routines, absent keys and failed rollback.
- verify-practice-routines: pause/restart daily archive/plan isolation/skip/storage errors/competing navigation/retry; metronome settings migration and instrument defaults.
- verify-routine-music-share, verify-routine-links, verify-routine-program-share: score placeholders without score bytes, older package handling, Unicode and oversized-link fallback, shared program remapping/meter/tempo and malformed payloads.
- verify-routine-preset-tools:54 presets,108 goal plans, sustained-tone/brass/instrument tool exceptions.
- practice-qa/regressions/routine-duration-roundtrip:0–180 minute boundary persistence.
- practice-qa/regressions/suggested-routine-entry:actual parent component preserves suggestions/library modes using React server render and mocked child.

13 existing check entrypoints passed. Their pass does not cover the failures above. New isolated proof script `/private/tmp/besttake-oct6-audit/music-routines-repro.mjs` exited0 with five independent defect assertions. It bundles production pure functions, extracts one production handler, and transpiles the production chart module body with imported platform dependencies supplied as mocks; it makes no app data writes.

## Useful optimizations, separate from defects

- MusicLibrary repeatedly reparses the exercise library and score metadata in scoreStep/setupLabel/loadMusicSetup for each visible row and change. Cache the exercise-by-project map and settings/setup snapshot for a library revision, reducing repeated localStorage JSON work in large libraries.
- Reference metadata validation allocates an Audio element but never explicitly removes its src/reloads it on success/error/timeout. Release the temporary element and handlers in one cleanup so repeated file picks do not leave decode/network resources until GC. Treat as resource hygiene, not a demonstrated leak.
- Routine history grows without a retention or size policy. Add an explicit archival/export or bounded retention strategy before localStorage limits become routine-progress failures; preserve the user's ability to export older practice.
- MusicSetlistEditor builds counts with an object spread per entry; a single accumulator avoids quadratic copying. Low priority at the existing100-entry cap.

## Coverage limits and follow-up

Reviewed selection order/search/folder and score rename/delete handlers, durable music storage, setlist editing/opening/ownership, routine create/save/start/done/skip/pause/resume, suggestion dispatch, daily progress, shared plan/program import/export, Plus handoff gates, reference pinning, and annotation input/save paths. Executable evidence is limited to checks and isolated fixtures. Layout/touch drag/accessibility, actual Files picker MIME distribution, PDF/photo rendering (including rotated PDFs/EXIF images), annotated PDF export, YouTube playback/network failure, speaker/headphone routing, native background timing, real quota exhaustion, and device-specific rapid interactions remain untested. Root/leader owns cross-feature Plus/lifecycle and backing-audio durability findings; this report does not duplicate their claims.

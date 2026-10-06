# Authorized chart integrity fixes — October 6, 2026

After the audit, the user authorized repairing the seven confirmed defects. This leader implemented M1 and M4, then added the M2 attachment ownership safeguard requested by the root/fresh critic. Other agents own the routine UI, Games, history and shared-link changes. No commit, deployment or release was performed. `ANTIGRAVITY_APP_CONTEXT.md` and `launch-site/` were preserved.

## Changes

- `src/utils/practiceChartStorage.ts`: native score saves write a unique versioned file, then commit metadata pointing at it. Metadata rejection or a partial-write rejection preserves the previous file, name, attachment identity and loaded cache; staged bytes are cleaned best effort. Original-file retirement happens after the successful metadata/cache commit and cannot turn cleanup failure into an import failure. Legacy canonical paths remain readable; versioned path validation remains confined to the same chart/project and MIME extension. An image object URL is prepared before storage commits and revoked if the operation fails.
- The same module commits a fresh optional `attachmentId` on every successful native/web score save. Existing metadata without an ID remains readable. Failed web replacement still rolls its Blob back and retains prior metadata/identity. Export and delete use the committed versioned path.
- `src/components/practiceChart/chartInk.ts`: removed the 400-point read truncation. All finite saved point pairs now survive reopening, including existing long gestures. Existing precision rounding, invalid-input filtering, 600-gesture retention, observable quota failures, whole-gesture eraser and undo behavior remain.
- Ink now saves a version-2 envelope bound to the committed attachment ID. Old array-format marks and null-ID envelopes remain readable on their legacy attachment. When a score is replaced, leftover old marks are not displayed on the new attachment even if cleanup rejects. New marks bind to the new part; delete/reimport cannot inherit old versioned marks.
- `saveInkStrokes` optionally checks the reader's expected attachment ID before writing or removing marks. The root updated `PracticeChartLayer.tsx` persistence/retry calls to pass the captured chart ID. An old reader callback cannot rebind or erase marks on a replacement.
- Delayed native/web score reads now check the committed file path/attachment ID before caching. A read started for A and completed after B commits resolves the current score instead of restoring A to memory. A stale web read cannot delete B's new metadata when MIME validation against A would fail.

## Strongest challenges and resolution

The fresh critic rejected relying only on routine callers clearing annotations after replacement: a failed clear could still put A's accidentals/fingerings on B. The attachment identity envelope fixes that boundary independently of optional cleanup. Actual production storage and ink integration now proves old marks stay unreadable after a failed clear, while failed replacement preserves the old attachment and its marks.

A focused actual-loader test also reproduced a delayed read restoring A after B committed. Before the additional guard, that assertion failed with `OLD_SCORE` instead of `NEW_SCORE`. The final guard makes the same read resolve B and keeps the loaded cache and cold metadata consistent.

No lossy resampling or splitting of long gestures was added: splitting changes undo/eraser ownership, and a new forced representation could alter rehearsed marks. The reader now supports exactly the gesture representation the writer already saves.

## Checks actually executed

All final checks below exited 0 on the changed source:

| Check | Evidence |
| --- | --- |
| `node scripts/verify-practice-chart-native-transaction.mjs` | Legacy canonical metadata, same/different MIME quota rejection, cache and cold reload, partial staged writes on first import/replacement, staged cleanup failure, post-commit retirement failure, retry, versioned export/delete, project/path validation, delayed read, legacy/v2 annotation ownership, failed clear, stale reader nonempty/empty save guards, delete/reimport. Native bridge/storage are controlled fixtures; production source is bundled. |
| `node scripts/verify-practice-chart-ink.mjs` | Existing parsing/thinning/quota recovery/eraser/marked-PDF checks plus a 650-point smooth circle, a 2,200-point complex curve, exact rounded shape/endpoints, old saved long-mark recovery, erasing the formerly truncated tail. Uses actual production ink/export modules with an isolated storage host. |
| `node scripts/practice-qa/regressions/music-web-reload.mjs` | Existing PDF/image fresh-module reload, synchronous index, failed/successful replacement, stale-record cleanup and deletion. IndexedDB is a controlled adapter, not a live browser. |
| `node scripts/verify-routine-program-share.mjs` | Existing linked programs, score placeholders, fresh IDs, meter/tempo pins, current program preservation and malformed/legacy payloads remain compatible with updated score metadata. |

Final logs are under `/private/tmp/besttake-oct6-audit/`: `verify-practice-chart-native-transaction-fixed.log`, `verify-practice-chart-ink-fixed.log`, `music-web-reload-fixed.log`, `verify-routine-program-share-fixed.log`. The root owns final aggregate tests, TypeScript/Vite build, and durable evidence retention.

I reviewed the shared fix diff for `RoutineMusicSetup`, `MusicRoutineBuilder`, `PracticeChartLayer`, `practiceRoutines`, `routineFileOpen`, `balanceEngine` and `useBalanceGame`. No additional material issue remained in that source pass: caller confirmation/validation complements committed annotation ownership; routine reads retain valid progress when migration writing fails; shared URLs separate concurrent/success deduplication from retryable failures; Balance resumes committed result phases and guards queued continuations. This source review does not replace their executable checks or UI/device verification.

## Limits and decision

The owned M1/M4 repair and the requested M2 integrity safeguard pass the executed checks. The seven-defect repair pass should be judged against the root's final aggregate results. Native cleanup remains best effort: a denied cleanup can leave an unreferenced staged/old file, but cannot change the committed attachment or report a successful replacement as failed. Crash-time orphan scavenging was not added.

Live browser/iPhone/iPad checks remain unavailable because the browser runtime cannot start with the configured obsolete `SessionMirror` writable-root symlink. Real Filesystem/quota, Files picker, touch drawing, native audio, purchases and background timing were not exercised. Conditional routine native-background ordering, preview-only browser backing audio durability, and the Balance uninterrupted-hold/Resume contract were outside the seven confirmed repairs and remain explicitly separate.

Decision for the owned repair: **PASS WITH LIMITATIONS**. It is a focused source/executable repair, not release or device certification.

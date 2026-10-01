# Practice fixes and bot verification

The confirmed tuner, duration and browser score-reload failures have been repaired. Routine save/start failures now preserve the draft and support retry. This report supersedes the failed cases in the earlier [workflow verification](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-practice-workflow-verification.md); that report remains a record of the broken version.

GPT-6.1 Sol served as the implementation lead. GPT-6 Luna implemented and tested score persistence; a separate GPT-6 Luna reviewer challenged the integrated changes. The coordinating agent performed the real browser interactions below. The bots executed production utility and callback checks; they did not independently operate the same browser or certify native device behavior.

## Fixes applied

- Tuner settings render in a screen-level dialog above floating practice widgets. A fixed header and one scrollable body keep detection profiles and the complete instrument list reachable. Escape, focus trapping and focus restoration are included.
- Both routine builders and saved-step normalization share the 180-minute limit. Accepted durations no longer silently become 60 minutes.
- Web score bytes persist in IndexedDB, with a durable metadata index for the Music Library. Failed replacement preserves the prior score when rollback succeeds; deletion clears the loaded cache even if optional reading-position/visibility cleanup fails.
- Both builders await launch, prevent duplicate submissions and preserve a recoverable draft after failures. App closes the builder only after successful preparation; missing scores open repair and reject the failed start.
- Score-dependent and hands-free routine launches now request Plus explicitly when access is inactive. Both builders preserve the draft on cancellation and retry the original action after unlock. The central launch gate covers Home continuation, step jumps and Done & next before changing room or session state. Free routines and Save for later remain available.
- Routine and reusable-exercise library saves use a single batch helper with prior-key snapshots and rollback. Tests cover quota failure, unchanged prior data, retry without duplicates, newer saved entries and honest reporting when rollback also fails.
- Failed annotation writes now show a visible warning with retry and PDF export. Drawn marks remain available in memory; failed Clear keeps prior strokes. Annotation persistence still depends on browser storage being available.
- The routine music-picker selection count reflects displayed score rows. Unscored practice projects and repeated occurrences no longer inflate it.

## Real browser workflows

Tests used the actual app on the isolated QA origin `http://127.0.0.1:5218/`, with the test library from the previous run and its development Plus preview. The QA server was restarted to invalidate cached source transforms before testing changed code. No purchase, real-account reset or native entitlement change was performed. Synthetic QA media inputs cannot establish microphone, camera or acoustic accuracy.

Final source fingerprint, SHA-256 over sorted `src` TS, TSX and CSS paths and contents separated by null bytes: `40d128317a68a16b60a7991508cb74fb90f213dfc859cec70455c6d6b3c4fe22`. Native files and other assets are outside this fingerprint.

| Workflow | Observed result |
| --- | --- |
| Short phone tuner, 390 × 600 | Dialog fits between y=16 and y=584; scroll body is 477 px high with 1105 px of content. Instrument profiles appear at the top. This replaces the broken 33 px option viewport. |
| Tuner interaction | Strings/Winds selection stays in the dialog; scrolling reaches D trumpet, which applies and closes it. Reopening confirms the selected key. B♭ trumpet restored afterward. |
| Landscape and tablet | At 844 × 390 the body is 267 px high; at 1024 × 768 it is 645 px. Dialog stays within the available viewport. Close works above the widgets. |
| Keyboard | Shift+Tab wraps from Close to the last option; Tab wraps back. Escape dismisses, removes inert background state and restores focus to the tuner settings trigger. |
| Duration round trip | Set Breathing & mouthpiece to 120 minutes, Save for later, reload, reopen More options: visible value remains 120. |
| Score import and pages | Imported the repository's two-page music-layout-check PDF through the file picker. Library lists it; reader opens both pages and Next changes 1/2 to 2/2. |
| Markup reload | Select red marker, draw, return to Library, reload and reopen: score still appears and the red stroke remains visible. |
| Music into a routine | Choose music in the saved rehearsal, select the imported score, return to setup: all four existing exercises remain and the score becomes exercise five. |
| Save and continue | Saved five-exercise routine returns to active Long tones with configured tools. Done & next moves to Lip slurs at 68 BPM, then the recording exercise, then the imported PDF. |
| Full completion | On the PDF step, Pause and Resume work. Finish routine returns Home showing 5 of 5 exercises completed; reload preserves that result. |
| Final integrated check | After restarting the QA server with the final access fix, the picker shows one selected score among five total exercises. Save & continue succeeds with active preview access; a direct jump opens the retained PDF. |

## Automated and independent verification

Fourteen focused checks passed: routine library transaction, routine start recovery, duration round trip, web score reload, chart ink, practice routines, routine music, routine program sharing, Music Library, Plus access, chart geometry, routine music sharing, routine links and preset tools. Failure injection operates on actual production utilities/callbacks with isolated dependencies; it is not live browser quota injection or a StoreKit test.

The independent Luna reviewer found two post-commit auxiliary-storage failures during score save/delete. Both were repaired and regression-tested, including cache removal and object-URL revocation after committed deletion. The final review found no material blockers in those changes, the corrected selection count or the inactive-Plus gate. Access checks cover cancellation, unlock retry, free-path bypass, remembered hands-free desks and failure before mutation. Inactive access was injected into production callbacks; actual trial expiry and StoreKit remain device release gates.

Production TypeScript and Vite build passed. The final `SENTRY_AUTH_TOKEN='' npm run build` verifies local compilation and bundling without remote source-map upload. An optional Sentry source-map upload failed in an earlier run while the build still completed; release telemetry upload success is unverified. Scoped whitespace checks passed. Other chats are editing the same working tree, so these results describe the tested snapshot, not future changes.

## Remaining release boundary

The repaired browser workflows pass. This is not a universal bug-free or paid-release certification. Native iPhone/iPad Files import, score restart persistence, StoreKit cancellation/restore/revocation, real recording/playback and app/audio interruptions still require device testing. Full storage exhaustion can prevent durable writes; the fixes provide rollback or an honest recovery message rather than guaranteeing unavailable storage.

Dedicated setlists, direct markup placement and library-to-routine shortcuts remain proposed additions from the original map. This pass repairs existing behavior; multitrack remains outside the requested scope.

**Gauntlet decision: scoped browser repair checks reached their bar; native paid-release readiness remains unverified.** Account usage finished at **93% remaining** in the primary window and **100% remaining** in the reserve window, above the requested 80% floor. The temporary browser tab and QA server were closed after verification.

## Fixed evidence

These images show the repaired version, not the original broken layout:

![Fixed tuner settings on a short phone](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-fixed/tuner-short-phone-fixed.jpg)

- [Duration after reload](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-fixed/duration-after-reload-fixed.jpg)
- [Music Library after reload](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-fixed/music-after-reload-fixed.jpg)
- [Marked score after reload](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-fixed/score-mark-after-reload-fixed.jpg)
- [Routine music step](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-fixed/routine-music-step-fixed.jpg)
- [Routine completion](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-fixed/routine-complete-fixed.jpg)
- [Correct music-selection count](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-fixed/music-selection-count-fixed.jpg)

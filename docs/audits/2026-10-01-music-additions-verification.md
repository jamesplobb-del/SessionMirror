# Music additions: workflow and bot verification

All three previously proposed additions are now implemented in local source: independent setlists, direct Mark up shortcuts, and visible routine ordering. The library-to-routine shortcut from the preceding report is also retained. These changes are not in the installed or archived build 18.

## Behavior

- Select library scores, then Create routine or Create setlist. New drafts preserve source scores and start in library order. Cancelling does not overwrite an existing routine or saved setlist. Successful setlist reading exits selection so the saved lists are visible on return.
- Setlists have their own storage and ordered occurrence IDs. One score can occur in multiple lists or repeat in one list with separate cues. Each occurrence snapshots setup at creation; reading opens with metronome, drone, pitch, enhancement, takes and hands-free recording off. The saved tempo remains available for deliberate tool use. Reading uses no timed program and does not complete routine exercises. Same-score reading detaches an active routine sitting so later recordings cannot be attributed to that exercise.
- Rename, move, repeat, add, replace and remove entries in the setlist editor. Missing scores and cues remain visible for replacement. Deleting a saved setlist requires list-only confirmation and never deletes source scores, annotations, recordings or routines. The explicit limit is 100 entries; over-limit saved data remains visible and cannot be silently truncated during a write.
- Save and Read preserve drafts after failure. Read saves before opening; failed persistence prevents launch. Quota failure leaves previous lists intact; retries do not duplicate the list. Unreadable existing storage cannot be overwritten by a new save. Successful manual save displays confirmation.
- Mark up is directly accessible in the score top rail and Workspace. It opens existing annotation controls with a black marker when none is selected. Done marking restores reading mode. Closing controls, hiding the score, or moving to another setlist occurrence clears drawing mode without resetting the reading position/zoom. Existing warning/retry and marked-PDF export controls remain available.
- Routine Up/Down controls sit beside each collapsed lineup row with 44px targets, accessible names and disabled edges. Busy save/start disables editing. Duplicate buried arrows were removed; Remove remains inside the detailed options.

## Team and strongest challenge

GPT-6.1 Sol implemented setlist storage/editor, GPT-6 Luna implemented direct marking and routine ordering, and a separate GPT-6 Luna challenged integration. Root integrated the library/reader and operated the real browser. The strongest review finding was reading an unsaved/edited list without persisting it; save-before-read was implemented and tested. Fresh review found no remaining material blocker. Agent checks were source and isolated production-code tests, not independent bot browser sessions.

The comparison bar was the original musician workflow and domain requirements: repertoire order is independent of daily practice progress, repeats carry different cues, and removing organizational entries leaves source music intact. No new external visual benchmark or competitor comparison was claimed.

## Actual browser checks

Used isolated QA origin http://127.0.0.1:5218/ with development Plus preview and synthetic media, not a real entitlement or acoustic test. Restarted QA after the final integration changes.

| Workflow | Result |
| --- | --- |
| Selected-score actions | Both Create routine and Create setlist are visible, large actions. Two selected existing scores seeded a new list. |
| Rehearsal assembly | Named QA Friday rehearsal, repeated the first piece, and entered Opening and Encore cues independently. Read saved the list and opened the first occurrence. |
| Reader navigation | Previous disabled at the first piece; Next moved to the repeat with its Encore cue and then to piece three; Next disabled at the last piece. No recording or tools started. |
| Marking | Top-rail and Workspace shortcuts each opened Mark up immediately. Done marking changed to Read. Moving to a repeated occurrence while marking closed tools/cleared marking, retaining the same score's page position. A draw gesture was exercised; existing persistence/export geometry was verified by production utility tests. |
| Restart | Reload retained the saved list, all three entries and the two different cues. Reordering the Encore occurrence upward and saving retained its new first position. Manual save confirmation was visible. |
| Library return | After reading, Library showed the saved list with Select available, rather than hiding it behind the previous selection. |
| Routine ordering | Added Warm-up check as exercise three, used visible Up twice, saved QA Visible order, reloaded and reopened: Warm-up remained first, with visible reorder buttons and disabled top/bottom edges. |
| Layouts | Inspected phone 390×844 and 390×600, tablet 1024×768 and landscape 844×390. Editor header/footer and scroll area remained usable. Landscape score/reader buttons measured 44px tall, remained inside the viewport; Done marking was reachable at y257 with height44. |

## Objective checks

Passed: verify-music-setlists.mjs, verify-setlist-reader.mjs, verify-routine-start-recovery.mjs, verify-practice-chart-ink.mjs, verify-practice-chart.mjs, verify-routine-music.mjs, verify-music-library.mjs and verify-routine-library-transaction.mjs. These use real production utilities/callbacks with isolated storage/hooks/dependencies. They include missing-score replacement, confirmed list-only deletion, overlap/repeats, storage errors, retry, double taps, independent identity, quiet navigation, same-score routine detachment and unchanged completion. Missing-file/deletion/quota injection was not performed against the live browser.

TypeScript and production Vite build passed. Local production build excluded Sentry upload and retained existing large-chunk/mixed-import warnings. Whitespace check passed. Unrelated Staff Jumper changes from another chat were preserved. Account allowance was 89% remaining, above the 80% floor.

## Boundary

At the initial browser handoff this was local source. The user subsequently authorized releasing 4.2 build 19; its release outcome is recorded separately. Native StoreKit, device Files/persistence, real audio interruptions, accessibility and update durability still need device verification. Gauntlet verdict: **PASS WITH LIMITATIONS** for the scoped browser additions.

- [Selected-score actions](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-controls/library-routine-setlist-actions.jpg)
- [Direct markup controls](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-controls/direct-markup.jpg)
- [Routine order after reload](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-controls/routine-visible-order.jpg)
- [Setlist reader](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-controls/setlist-reader.jpg)
- [Tablet setlist editor](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-controls/setlist-editor-tablet.jpg)

## Simplified setlist follow-up

The user clarified that a setlist should only put music in order. The editor now shows its name and compact numbered score rows with Up/Down/Remove, Add music, and Save. Cue fields, Repeat controls, and normal replacement menus were removed. A replacement appears only when a score is missing. Reader navigation now shows only list name, current score/position and Previous/Next. Existing stored metadata is preserved when editing prior lists.

At 390×600, the simpler editor showed the first three compact rows and its save footer. Moving a piece down, Save confirmation and Read worked; the reader showed no cue text. Production utilities/callback checks for save/read failure and retry passed, and the independent Luna review found no material regression. This is the version selected for 4.2 build 19, whose archive/upload outcome will be recorded separately.

![Simple setlist](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-controls/setlist-simple.jpg)

## Release preparation

The production build and Capacitor iOS sync passed for 4.2 build 19, including the approved Sentry source map upload. Eight pre-release checks passed: music-setlists, setlist-reader, routine-start-recovery, practice-chart-ink, routine-music, headphone-output, Staff Jumper headphone confirmation, and Staff Jumper native drone ownership. The separately authorized Staff Jumper headphone-notice changes are included. The native archive and App Store Connect upload succeeded. Build 19 has not been installed on the user's phone. See [the build 19 release record](2026-10-01-build-19-release.md) for the upload and listing outcome.

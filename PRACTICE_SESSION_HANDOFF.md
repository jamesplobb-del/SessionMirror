# BestTake session foundation

Functional implementation, September 5, 2026. This shared working tree also contains the earlier guided-builder/instrument-design work. Preserve it. There is no replacement recording engine or new media backend in this change.

## Latest checkpoint — user requested handoff at 17% remaining

Feature work is frozen at the user's request. The second pass implements the previously listed program/passage/journal extensions and a limited UI simplification. **Do not interpret the old follow-up list at the bottom as all still unimplemented.** The status below supersedes it. No browser, simulator, or physical-device interaction pass was done for either session-foundation pass.

### Added in the second pass

- Routine steps now persist an optional `programId`, selected under **Customize tools → Metronome program** in the existing step editor. It refers to the existing timeline library, not a duplicate program definition.
- `src/utils/routineProgram.ts` owns only a program launched by a routine. Starting an item prepares the program paused; the bar's Play button starts it. Camera/Audio capture remains manually controlled by existing controls. A program does **not** automatically record, stop a take, or mark the practice item completed.
- The routine bar exposes Play/Pause program and Open program details. Opening details uses the existing Audio Program screen. Missing/deleted programs show a message and leave ordinary practice usable. Session Home/Pause/finish/switch paths pause or exit the owned program.
- `TimelinePlaybackEngine.subscribe` adds observers without replacing the existing view callbacks. A generation guard prevents a late native start result from reviving a paused/exited program. The underlying shared click engine already cancels its asynchronous starts.
- `PracticeTimelineView.linkedProgramId` loads the linked library program; its library switch is disabled while linked. External file imports remain queued while the linked program is showing.
- `src/utils/practicePassages.ts` stores passage boundaries, a loop flag, and playback position by project ID plus concrete source (`youtube:<video ID>`, `take:<take ID>`, or `library:<library ID>`). Validates finite nonnegative seconds, a half-second minimum passage, and m:ss input. This data is device-local.
- `useYoutubePracticePassage` consumes existing hosted `youtube-status` messages, checking exact origin, iframe window, and video ID. It restores position, seeks/loops through the existing bridge, and throttles persistence. No server change/deployment/key change. Looping is driven by iframe telemetry, so do not claim sample-accurate or musically automatic alignment.
- In split reference view, **Reference passage** opens optional start/end inputs, Use current, Save passage, Listen, Loop, and Clear. Reference playback waits for valid player telemetry. Boundary editing can be saved before readiness; play waits for readiness.
- Existing local audio/video Review now persists loops per source and restores positions. It retains the existing aligned A/B slot-switch behavior. Position is checkpointed every five seconds and on explicit review close/slot switch. Old project-global loop state is retained for backward compatibility but is not applied across unrelated source IDs when source-specific memory is available.
- `RoutineDay.itemsByStep` captures the title and project ID on first practice/check-off that day. Earlier days keep their original titles after editing today's routine.
- Recap includes item journal links and historical item links. `RoutineItemJournal` loads item metadata read-only and reuses `FocusedPracticeHistory` and `ReviewModeOverlay`; browsing history neither switches the active project nor starts a sitting. Selected media resolves only when opened.
- Routine bar has a dismissible last-practice/intention reminder, a reference shortcut, primary Pause/Done actions, and secondary actions under More options. Post-take comparison uses three compact buttons instead of a native select. Added styles use the existing blue accent and inherited light/dark text.

### Verification and remaining priorities

- All three deterministic scripts pass: `verify-practice-routines.mjs`, `verify-focus-practice.mjs`, and new `verify-session-extensions.mjs`.
- The new script exercises production passage persistence/validation, item/source isolation, optional program IDs, archived title snapshots, the real timeline engine with a mocked native click boundary, observer coexistence, and cancellation while startup is pending.
- TypeScript passes. Production build and Capacitor sync are run as the final handoff step; the final conversation message reports their outcome.
- No visual/runtime proof is claimed. Highest-priority next work is an actual camera/audio walkthrough, especially YouTube telemetry/seek readiness and loop behavior, native reference-vs-take audio ownership, program pause/resume/background, linked-program edit/import handling, and journal playback returning to the same workspace.
- Check compact-phone and landscape layout: the draggable bar now has optional program/context rows, and the reference passage disclosure expands above the existing recording dock. The original bar clamp responds to outer expansion/window changes; inner disclosure resizing may need a ResizeObserver after runtime inspection.
- Check memory after recording-file trim/normalization: saved source timestamps are not yet migrated when the source is destructively edited. A follow-up should invalidate or clamp stale passage memory through the existing trim completion path.
- Build note: `RoutineItemJournal` currently imports `ReviewModeOverlay` statically, increasing the main App chunk and defeating its existing lazy boundary. Restore a lazy/Suspense import during the next performance/polish pass. The two edited timeline files are normalized to LF; use a whitespace-insensitive diff to focus on functional changes.
- Broader Home/guide visual polish and animation review remain. There is no new reward/game unlock system and no cloud sync implementation.
- The routine definition writer still follows the preexisting best-effort local-storage behavior. The explicit “Use these tool settings next time” success label should be checked against quota failures in a follow-up; daily-progress and passage failures already surface. Do not claim all preferences are transactionally durable.

### Resume efficiently

1. Read this latest checkpoint, inspect the current diff, and keep all earlier builder/instrument edits.
2. Run the three scripts only if changing their behavior; avoid spending usage on repeated unchanged checks.
3. Review the new program and passage files plus their App/View wiring before adding features.
4. Perform the targeted runtime checks above if authorized/requested, then fix concrete failures and refine presentation.
5. Use `SENTRY_AUTH_TOKEN='' npm run cap:sync` after web changes that must reach iOS. Never copy the YouTube credential into the frontend.

## Product model

- **Routine**: ordered plan, selected instrument, and deliberate starting tool presets.
- **Practice item**: the existing vault Project; its stable ID owns recorded attempts, references, comparisons, and intention memory.
- **Sitting**: an existing SQLite PracticeSession, optionally associated with a routine ID and step ID. Several sittings can contribute to an item's history.
- **Practice day**: the routine's checklist, actual active intervals, sitting IDs per step, temporary tool settings, and resume target. Stored separately for each routine/date.
- **Workspace**: the existing camera/audio/tuner/metronome surfaces and media players. The session layer coordinates them.

## What now works

1. Start, finish, and advance go through one app-level transition gate. Repeated identical taps share an operation; competing transitions fail clearly. Navigation waits for recording finalization and the take's SQLite save.
2. Routine/project links use explicit IDs. A trumpet and flute exercise with the same title no longer link automatically. Existing explicit links are retained; existing recordings are never repartitioned automatically.
3. SQLite can recover a routine item's project and today's open sitting after a missing local checkpoint. Resume validates project, routine, and step ownership. Starting a new sitting and closing the replaced one happen in one transaction. Ending twice preserves the original end time.
4. Pause retains the current item and sitting. The timer counts active intervals and excludes breaks. Opening Home/Today pauses the routine and stops click/drone. Returning to the paused current routine resumes through the same start path. Backgrounding pauses accounting; cold launch offers resume and never auto-starts recording or tools.
5. Every 15 seconds, and on explicit lifecycle actions, the routine saves time and the current desk. A process kill can lose up to one checkpoint interval of measured time. Time away is never fabricated as practice.
6. A resumed item uses today's desk snapshot; a new day's item uses its routine preset. Routine practice does not overwrite a shared project's standalone desk. “Use these tool settings next time” explicitly updates just the current routine step. Editing a starting preset invalidates that item's temporary desk for today.
7. Post-take review offers saved reference, best take, or previous take. No best take means a solo Listen action. Missing references open the existing search dialog. YouTube comparisons use the existing split surface; recorded comparisons use the existing review players. Comparison choices persist per item. Record/retry still call the existing camera/audio recording handler.
8. “Saving take…” remains visible until the vault write succeeds. Next/finish/retry are disabled while it is pending. Save failures remove the false success state and report the error. The existing recording file/card remains available; there is no automatic file deletion.
9. Today has a compact Session progress/recap disclosure: measured active time, completed vs skipped items, actual saved-take count, and recordings currently marked Best. Earlier routine days remain available. No quality scores, streak penalties, or invented rewards.
10. Practice-item updates write only changed fields. Updating an intention cannot overwrite a newer sitting ID, comparison preference, or loop range.

## Code ownership and contracts

| File | Responsibility |
| --- | --- |
| `src/utils/practiceTransitions.ts` | Promise gate for app-level transitions. Keep record/media ownership in existing implementations. |
| `src/utils/practiceRoutines.ts` | Pure checkpoint/pause/start/settle helpers; validated legacy parsing; per-routine daily history. |
| `src/db/practiceRepository.ts` | Validated resume, atomic sitting replacement, field-specific item updates, binding recovery, actual take summaries. |
| `src/db/schema.ts`, `src/db/migrations.ts`, `src/db/types.ts` | Two nullable sitting context columns. Migration is repeatable and preserves old rows. |
| `src/App.tsx` | Existing recorder/players plus routine/session orchestration. `openRoutineStep`/`openFocusedPractice` are internal; UI entry points use `runPracticeTransition`. |
| `src/components/RoutineBar.tsx` | Existing draggable bar, accumulated timer, busy state, explicit preset save. |
| `src/components/ControlDeck.tsx` | Shared camera/audio post-take choice and real saving status. |
| `src/components/RoutineProgressSummary.tsx` | Read-only recap of the day and earlier days; queries saved media by sitting IDs. |
| `src/components/PracticeHub.tsx` | Start/resume target and recap placement. |

Do not invoke the gated public routine starter from inside another gated operation. Internally, the transition already holding the gate calls `openRoutineStep` directly. Keep refs and React state committed together before releasing the gate. Do not replace IDs with title matching.

## Persistence and compatibility

- Existing projects, takes, references, routine definitions, and instrument choices remain readable.
- `practice_sessions.routine_id` and `.routine_step_id` are nullable. Old sessions have null context.
- Existing `practice_item_states` and recorded `practice_session_id` fields remain authoritative for item/take history.
- The current-day local-storage key remains `besttake:practice-routine-day:v1` for compatibility. Extended fields have defaults for old data.
- Historical day records live under `besttake:routine-history:v1:<encoded routine ID>`. Switching plans or dates retains previous records. Only one routine can run at a time.
- Day history, bookmarks, routine/exercise libraries, and temporary desks remain device-local. This is not cloud/account synchronization. Recording media remains in the existing vault/filesystem.
- Storage failure is surfaced. SQLite and local storage are separate stores, not one distributed transaction; SQLite sitting metadata recovers missing links, but cannot reconstruct lost checklist outcomes or elapsed intervals.
- Deliberately changing an instrument does not rewrite old explicit item bindings. There is no destructive migration to “fix” potentially mixed historical folders created by older name matching.

## Reference service and shared build

No API key was changed or copied into frontend code. Existing service:

`https://stalwart-salamander-9451ab.netlify.app/.netlify/functions/youtube-search`

The app uses the public `VITE_YOUTUBE_SEARCH_ENDPOINT` build setting. The credential stays in Netlify's server environment as `YOUTUBE_DATA_API_KEY`; never prefix that credential with `VITE_`, commit it, or embed it in the browser/iOS bundle. Another checkout needs the endpoint configuration and an allowed browser origin, not the Google API key. Restart Vite after changing its environment; run Capacitor sync for native assets after a rebuild. See `FOCUSED_PRACTICE.md` for the existing server configuration and origin rules.

## Verification for this pass

- `node scripts/verify-practice-routines.mjs`: preset compatibility plus pause/resume timing, cold restart, per-plan/day isolation, archived days, skipped outcomes, storage failure, duplicate taps, competing navigation, and retry after rejected work.
- `node scripts/verify-focus-practice.mjs`: actual SQLite repository operations, additive migration from the old schema and repeated migration, explicit resume validation, rollback when the destination project is invalid, checkpoint recovery, field-update isolation, idempotent ending, deduplicated recap counts, and preexisting reference/journal checks. Search boundaries are deterministic mocks; no live quota used.
- `SENTRY_AUTH_TOKEN='' npm run cap:sync`: TypeScript, production web build, and iOS web-asset/plugin synchronization.

No browser/simulator/physical-device interaction pass was performed for this foundation change. Prior historical verification in `FOCUSED_PRACTICE.md` is not evidence of a runtime pass for these new changes.

## Original follow-up plan (historical — see latest checkpoint above)

First refine the **existing** UI. Preserve the session contracts above.

1. Simplify the routine bar's expanded actions and refine the comparison picker; use current app typography/colors and existing motion/reduced-motion support. Keep saving, unavailable-reference, paused, and failure states legible. Avoid more top-level menus.
2. Add a small item-start context card using existing take metadata: last practiced, current Best, and pending intention. Dismiss it in one action and never block recording on filling in notes.
3. Expand the recap with links to the existing per-item journal. Include tool-only items with zero takes. For historical item titles, add stored title snapshots rather than interpreting old step IDs using today's edited routine.
4. Add manual reference passage start/end and per-source playback positions. Key passage memory by project plus reference video/library ID; changing the reference must not inherit unrelated timestamps. Reuse the current player/YouTube bridge seek and loop capabilities. Do not claim automatic musical alignment or download YouTube audio.
5. Integrate an optional existing timeline program into a routine step only after tracing the current timeline start/stop API. Persist a real program ID, show missing-program fallback, and let session finish/pause coordinate the existing engine. The program engine has not been rewritten or wired into this pass.
6. If cloud sync is later wanted, design conflict/ownership semantics for routines, daily progress, bookmarks, and media before adding a second backend. Device-local persistence is intentional here, not a sync protocol.

Useful runtime checks when requested: camera and audio first take; retry after a save failure; repeated Next; pause/resume at a different tempo; app background during recording; cold relaunch; delete current item; change instruments with identically named exercises; a removed/blocked YouTube video; compare best vs previous vs reference; completed tool-only routine; switch routines and return; cross-midnight resume. Current deterministic checks do not establish native media behavior.

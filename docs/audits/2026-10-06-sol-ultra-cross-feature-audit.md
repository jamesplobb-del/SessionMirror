# Cross-feature audit leader — October 6, 2026

Baseline: `cc66c3ee0cf7729f376276518a363dc6a054491a` (`cc66c3e`). Current source is the evidence baseline. This was audit-only: no application-source fixes, commits, deployments, releases, purchases, messages to outside parties, or production-data writes. Existing user changes to `ANTIGRAVITY_APP_CONTEXT.md` and `launch-site/` were preserved.

This report owns the cross-feature lifecycle, data integrity, Plus, permissions, daily/share/setlist/program integration review. The detailed feature findings belong to:

- [Music and routines audit](2026-10-06-sol-medium-music-routines-audit.md)
- [Games audit](2026-10-06-sol-medium-games-audit.md)
- [Fresh adversarial review](2026-10-06-sol-medium-adversarial-audit.md)

The live browser operator could not start: its configured writable roots include an obsolete `SessionMirror` symlink, and the CUA runtime rejects that configuration. Escalated shell reads and isolated checks worked. No live browser walkthrough or iPhone/iPad hardware interaction was performed. Tests below are executable source checks with stated controlled boundaries, not real-device certification.

## Additional confirmed cross-feature defect

### C1 — P2: A recoverable routine import failure permanently suppresses retrying the same link during that app session

**Anchor:** `/Users/jameslobb/Documents/BestTake/src/practiceTimeline/storage/routineFileOpen.ts:170`.

The router adds an incoming `besttake://routine#…` URL to `handledUrls` before decoding or saving it. A failed import does not remove it. The real importer returns `ok: false` on a storage failure and explicitly tells the user to check available storage and try again (`src/utils/practiceRoutineShare.ts:183`). Retapping the same teacher's link then returns at `routineFileOpen.ts:169` before retrying the importer. Closing and relaunching the app resets the set; a different URL also works.

**Exact reproduction:** In the same warm app session, open a valid shared routine link while a routine/program storage write fails. Observe “Couldn't Open Routine” and the retry advice. Restore writable storage and open that identical Messages/Mail link again. Nothing is imported and no second attempt occurs. The same deduplication policy also adds file URLs before read/import (`routineFileOpen.ts:187`), though the identical file-URL retry path was reviewed rather than separately executed.

**Executable evidence:** `/private/tmp/besttake-oct6-audit/routine-link-retry-probe.mjs` bundles the actual exported native routine router and drives its registered App URL listener. The App URL delivery, link decoder, and importer are controlled boundaries. The import fixture produces the real importer's recoverable `ok: false` outcome on its first call. After changing the fixture to succeed, the same URL still produces only **one total decoder/importer call**, no pending routine, and no success announcement. A different URL succeeds as a control. Log: `/private/tmp/besttake-oct6-audit/routine-link-retry-probe.log`.

**Impact/platform/confidence:** A musician or teacher cannot recover a routine import by following the displayed advice without restarting the iPhone/iPad app. High confidence in the router defect; actual repeated `appUrlOpen` delivery was mocked. No bytes are lost by this finding.

**Smallest fix:** Keep separate in-flight and successfully handled identities, or delete the identity on every failed decode/read/import. Make the accept helper return its outcome so the caller can retain deduplication only after success. Keep successful cold/warm launch deduplication.

**Proposed regression acceptance criteria:** A quota/read failure followed by a same-URL retry attempts the import and succeeds once; simultaneous duplicate deliveries still perform one import; a later duplicate of a successful URL does not create another routine; malformed links may show a new error on retry without creating data. These are proposed criteria, not fixes or executed acceptance tests.

## Verified web persistence limitation

### C2 — Web-only P2 if durable browser use is supported: imported reference/backing audio disappears across a reload

**Anchors:** `/Users/jameslobb/Documents/BestTake/src/utils/libraryStorage.ts:105` and `:139`.

The web import branch stores only an object URL in the module-local `browserAudio` Map (`:17`). It returns a file path for the saved SQLite library row but does not persist the Blob in IndexedDB. A fresh module has no entry for that path, so hydration returns an empty playback URL. Native imports use Filesystem and are unaffected by this finding. The source explicitly describes browser imports as session-only previews, so this is a web-product limitation rather than an iOS release blocker if durable web use is intentionally excluded. Imported scores have a durable IndexedDB adapter; reference audio has no equivalent.

**Reproduction:** Import an audio reference/backing track in browser Music or a routine, confirm it is playable, reload, and open the same item. The saved reference identity remains but its playback bytes are unavailable. The DOM reload path was not available; the actual persistence/resolution functions were executed in two independently imported current bundles, simulating the discarded module state of a reload.

**Evidence:** `/private/tmp/besttake-oct6-audit/cross-feature-probes.mjs` imports a WAV Blob through the production web branch, verifies initial playback resolution, loads the actual module afresh, and verifies the same stored path resolves to `''`. Capacitor, native Filesystem, and unused native helper imports are mocked. It does not claim real SQLite or IndexedDB execution. Log: `/private/tmp/besttake-oct6-audit/cross-feature-probes.log`.

**Impact/confidence:** Saved backing tracks cannot play after a browser reload without reimporting. High confidence in the web state-loss behavior. Native persistence was reviewed, not exercised.

**Smallest fix if durable web use is required:** Persist the audio Blob by stable item/file identity in IndexedDB; hydrate a new object URL after reload and delete the Blob with the library item. If web is intentionally preview-only, make that persistence boundary clear before importing so a musician does not mistake the retained row for a durable file.

**Proposed regression:** Real browser import → reload → playback and routine reference selection work; delete → reload remains deleted; failed metadata/database commit removes or restores the newly written Blob. Not run here.

## Conditional native lifecycle risk

### C3 — P2 risk, not an observed device failure: a native pause delivered before WebKit visibility hides can leave routine accounting active

**Anchor:** `/Users/jameslobb/Documents/BestTake/src/App.tsx:6283`.

`appForeground.ts:153` makes native Capacitor `pause` the authoritative background transition and emits `APP_BACKGROUND_SUSPEND_EVENT` without checking WebKit visibility. The routine subscriber returns while `document.visibilityState` is still `visible`. Its own visibility handler then explicitly skips native platforms (`App.tsx:6295`). If the native event precedes the visibility change, the routine loses its pause and no later native visibility event retries it. The routine's periodic/next checkpoint can include time spent away, and `pauseRoutineProgram()` is not called by this handler. Drone silence has its own background handler and is not claimed to fail here.

**Conditional reproduction:** Start a routine step, deliver native background `pause` while WebKit still says visible, then deliver hidden visibility, and return later. The actual routine effect in the isolated harness keeps the step active, calls no program pause, and a later checkpoint includes a synthetic **600,000 ms** interval away. All source logic is current; the event ordering is a controlled test condition.

**Confidence/platform:** High confidence that the handler drops this ordering; medium confidence in frequency on iOS because no native background/lock timing was observed. Do not describe this as a real-device reproduction or add it to the unconditional defect count.

**Smallest fix:** Accept the app's authoritative background event regardless of WebKit visibility. Preserve the visible-page guard for non-authoritative transient events, so system prompts/Control Center do not spuriously pause routine accounting.

**Proposed regression:** Both native event orderings pause elapsed accounting exactly once; native inactive-only overlays do not pause; web hidden/pagehide pauses; time away adds zero after resume; the intended steady-native-metronome lock-screen behavior remains distinct from a timed routine program. A real iPhone/iPad lock/Home/Control Center pass remains required.

## Adversarial judgment of feature findings

The fresh adversarial review upheld all five Music/Routines findings and the Balance duplicate-result defect, and the root independently reran C1. Together these make **seven unconditional source-verified defects**; C2, C3 and the Balance hold-reset contract decision are excluded from that count.

The strongest observed challenge was data integrity: a native score replacement can write new file bytes before its metadata commit fails. The current browser branch has rollback, while the native branch does not (`practiceChartStorage.ts:124–125`). This survives the leader's source challenge and is the highest-priority repair candidate because a failed operation can replace the musician's original score. Native quota/Filesystem boundaries remain controlled in the feature bot's executable proof.

The Music/Routines report's long-ink truncation also survives source review: gesture input is simplified but has no 400-point hard limit, while reload parsing truncates rather than resamples. The migration-quota finding must be described precisely: loading a valid legacy day returns a fresh visible day if its history migration write throws. Its original storage bytes are retained at that moment; permanent deletion was not established. A later successful save of a fresh day could replace them, but that later consequence was not separately executed.

The routine builder's empty-MIME PDF import and stale annotation replacement findings are caller-specific: use the guided builder's `RoutineMusicSetup` path, rather than asserting every import path fails. The normal Music importer already normalizes MIME; the reader's replacement path already clears ink. Their reports identify the mismatched paths.

The Balance completed-target duplication survives source review and the fresh critic: the actual Pause button is present in the reward phase, and background interruption dispatches PAUSE independently. RESUME routes committed-result phases back through acquisition without advancing the target. The executable Games report shows two results for one target and false completion.

The separate Balance accrued-hold reset is an observed behavior requiring a Resume-contract decision, **not an unconditional scoring defect**. The actual hook changes 1,000 ms accrued hold to 100 ms after reacquisition, but resetting could be deliberate if the exercise requires one uninterrupted hold. The UI says Resume/on hold and does not state that the note restarts. Clarify that contract before selecting a fix. If Resume is meant to preserve accrued work, keep prior totals and reset the sample boundary; if uninterrupted performance is required, label the action Restart note. Mocked hook scheduling and synthetic pitch remain limitations for both findings.

One leader candidate was **rejected** after tracing full UI wiring. Testing `handleOpenQuickPractice` alone appeared to resume a held routine timer after detaching its context, but the actual button at `App.tsx:6498` first calls `handlePauseRoutine()`. The corrected executable production-callback probe includes that wrapper: elapsed time remains **30,000 ms** after a further minute in Quick Record, and `activeStepId` is null. This is a passed control, not a reported defect.

The root retained copies of the new probe scripts/logs in [evidence-2026-10-06-sol-audit](evidence-2026-10-06-sol-audit/README.md); the temporary paths above identify the exact executed originals.

No source repairs were applied because the request is audit-only. The derived benchmark was the app's own observable contracts: failed writes preserve existing work, Resume preserves completed/accrued progress, background time does not count as practice, shared routine errors remain retryable, and media identities resolve to playable bytes. No external competitor or hardware benchmark was claimed.

## Coverage matrix

“Executed” means the named script/harness actually ran in this leader pass. Team evidence is attributed separately; source review never counts as an interactive test.

| Integration | Source reviewed | Executed in leader pass | Remaining gap |
| --- | --- | --- | --- |
| Home → routine → Quick Record | App callbacks, JSX caller, routine hold/pause/resume | Actual extracted callbacks including real UI wrapper PASS; rejected candidate | Rendered buttons, touch/double taps, recording attribution on hardware |
| Setlist → same/different score → routine detachment | App music opening, setlist identity and storage | `verify-setlist-reader.mjs` PASS: silence, same-score detachment, occurrence identity, blocked navigation | Reader layout, live audio silence, swipe/scroll and score rendering |
| Daily practice and Games credit | `dailyChallenges.ts`, `dailyChallengePlan.ts`, App temporary challenge restore | `verify-daily-challenges.mjs` PASS; `verify-daily-challenge-plan.mjs` PASS | Real game completion, visible trophy feedback, midnight with suspended app |
| Shared routine + linked metronome program | Routine parser/share/file-open router, fresh ID and active-program contracts | `verify-routine-program-share.mjs` PASS; actual native URL router retry harness FAIL (C1) | Messages/Mail/AirDrop, real Inbox/filesystem, compressed-link handling on iOS |
| Routine program lifecycle | `routineProgram.ts`, timeline engine pause/prepare/exit, App step and pause paths | Sharing parser/state check above; conditional App background effect probe FAIL for controlled ordering | Native metronome transport, section transitions while locked, route changes |
| Routine day history/storage | Day parsing, history migration, checkpoint/hold/pause, App commits | Real pure accounting functions exercised in cross-feature probe; feature bot migration-quota proof reviewed | Native/web storage quota behavior, long-run history size and real cold launch |
| Music score, ink and setup integrity | Native/web save branches, reader versus routine replacement, item settings/order/folders | Feature bot actual-source quota/ink/MIME/replacement proofs reviewed, not duplicated as leader-owned runs | File picker MIME on actual devices, long touch strokes, real SQLite/Filesystem rollback |
| Reference/backing audio durability | Library persistence/hydration, SQLite item row, selection/delete wiring | Actual web persist/resolver fresh-module probe FAIL (C2); native path not executed | Browser DOM reload/playback, native Filesystem bytes and playable output |
| Games interruption integration | Balance reducer/hook result construction and visible Pause; Staff Jumper native inactive handler; shared mic recovery | Feature bot actual-hook scoring proofs reviewed; root independently reran reported proofs | Real pitch/mic, background timing, headphones and audio route ownership |
| Plus → Music/routine/purchases | JS entitlement refresh/expiry/guard, Swift StoreKit purchase/trial/restore, App paid-step startup | Root reports `verify-plus-access.mjs` and source/navigation checks PASS; not claimed as leader-owned purchase tests | App Store product availability, purchase/restore/cancel/pending, expiry during live media, offline entitlements |
| Permissions → Games/tools/music | Permission state threading, tuner-backed Games recovery, development-only skip gate | Source review only; no prompt or actual microphone permission test | Deny → Settings grant → foreground recovery, prompt overlaps, native camera/mic handoff |
| SQLite data integrity | Foreign keys/cascades, library item storage, practice-session identity and resume predicates | Source review only; no live native SQLite execution | Native migration/transaction failures, actual database/media reconciliation |
| Audio background and route integration | App and centralized lifecycle, native-vs-web metronome policy, independent drone suspend | Root reports audio-lifecycle, route, headphones checks PASS; conditional routine effect ordering explicitly probed | Actual lock screen, Control Center, interruption, Bluetooth and unplug/replug |

Leader executed commands:

- `node /private/tmp/besttake-oct6-audit/cross-feature-probes.mjs` — final run passed its assertions: one rejected candidate/control, one conditional state-ordering failure and one web state-loss proof.
- `node /private/tmp/besttake-oct6-audit/routine-link-retry-probe.mjs` — passed assertions reproducing C1 and successful different-URL control.
- `node scripts/verify-daily-challenges.mjs` — PASS: daily caps, rollover, thresholds, old unlocks, routine duration, corrupt storage, failed writes.
- `node scripts/verify-daily-challenge-plan.mjs` — PASS: every instrument, frozen targets, untouched routine, thresholds, exact game settings, midnight, duplicate awards.
- `node scripts/verify-setlist-reader.mjs` — PASS: quiet reader navigation, same-score routine detachment, occurrence identity, preservation and blocked navigation.
- `node scripts/verify-routine-program-share.mjs` — PASS: linked programs, score placeholders, fresh IDs, meter/tempo pins, active program, legacy/malformed payloads.

Initial temporary harness construction required correcting the current factory's name/argument; that was a fixture error, not an app failure. Only the final valid-identity results are reported. The app source remained unchanged.

## Scope and decision

The audit deliverable is a substantive current-source and executable pass with limitations. It does not provide exhaustive live-control coverage. The root census's 1,162 JSX candidate controls and 84 curated groups are an inventory, not 1,162 tested controls. Historical audit results and old check statuses are not proof of the October 6 runtime.

Application readiness is **BAR NOT REACHED**: confirmed material defects remain and real-browser/device checks were unavailable. That judgment is separate from finishing the requested audit-only work. Repair priority is failed score replacement integrity, followed by completed-result interruption and saved progress, routine import retry, and the caller-specific music setup/reload problems. The separate Balance hold-reset behavior requires a product contract decision before calling it a bug. Real device validation should then concentrate on interrupted Games, routine background accounting/program pause, Files MIME/replacement, permissions and purchase expiry. No release, deployment or readiness certification is authorized by this audit.

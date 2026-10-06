# BestTake pitch, tuner/metronome and widgets — Sol Ultra tools audit

2026-10-06. **Audit only.** Baseline HEAD `cc66c3ee0cf7729f376276518a363dc6a054491a` plus the current uncommitted Music/Routines/Balance fixes. No application source edits, fixes, commits, release, hardware interactions, microphone sessions, purchases, or production data writes. Earlier audit, launch-site, ANTIGRAVITY and concurrent recording/multitrack changes were preserved. New report/evidence files only.

## Outcome and evidence standard

Bounded Gauntlet AUDIT pass, using the requested Sol 6.1 Ultra lead and two Sol Medium feature reviewers. Pitch reviewer owns capture/repository/screen; widget reviewer owns layout/state; lead owns tuner/metronome core, lifecycle/audio contracts and review of their findings. Root owns independent integration checks and the fresh final adversarial reviewer. Fresh adversarial review is recorded in `2026-10-06-sol-medium-tools-review.md`: a Medium reviewer independently reran and challenged the three executable logic findings, while root separately reviewed W1 and reran all four probes. The conditional native bridge window and unmeasured keyboard/VoiceOver consequences remain explicit.

Derived benchmark: shared controls agree with playback configuration; async navigation/reset operations settle to a usable screen; capture persistence and visible history reconcile after recovery; closed tool disclosures match accessibility state; explicit Stop and audio lifecycle ownership remain respected. This is a professional behavior rubric, not an external market comparison. No feature redesign or competitive prototypes were necessary for this audit-only scope.

All promoted findings below have a reachable caller and a repeatable isolated production-code/component probe. A successful probe means its assertion about the observed defect passed; it does **not** mean the feature is fixed. Native bridge behavior, persistence failures and React scheduling are isolated fixtures where stated. Source inspection is not live DOM/device/audio validation.

## Ranked bugs

### I1 — P2: Reset All completing after close/reopen strands Pitch Insights loading

**Anchors:** `src/components/audioPractice/PitchInsightsScreen.tsx:1072`, `:1080`, `:1100`, `:1124`, `:1346`; `src/db/pitchInsightsRepository.ts:93`, `:174`.

**Trigger:** open Insights with history, open Days, confirm Reset All, then close/reopen the sheet while its queued deletion/persistence remains pending. Reopen starts a fresh read and sets loading true. The successful deletion dispatches `cleared`, invalidating that read by incrementing `loadSequenceRef`. The stale read's guarded finally block no longer releases loading, and the clear handler neither releases loading nor starts a replacement read.

**Outcome:** the sheet stays on “Analyzing pitch history…” with no replacement read, until another close/reopen. The repository reader waits the write queue, so reopening during queued deletion naturally places the read behind the event-producing write. Same-shape range deletion handlers were inspected, but only Reset All was explicitly reproduced; do not count speculative variants as extra bugs.

**Evidence:** `evidence-2026-10-06-tools-audit/pitch-medium-reset-reopen-probe.mjs` invokes the actual screen, effects and real Days/Reset All callback path, then closes/reopens and resolves the deferred clear event/read. Actual component, analytics and profile code; hook scheduling, repository I/O and visual wrappers are mocked. Medium log plus independent lead rerun `lead-review-pitch-medium-reset-reopen-probe.log` both confirm the spinner and zero replacement reads. No live browser or native timing claim.

**Minimal fix direction:** when a deletion invalidates an opening read, run a new guarded load; or atomically finish loading only when a complete replacement snapshot is available. Merely showing an empty snapshot after a scoped deletion can discard remaining history, so prefer a reload for range deletions.

**Regression criteria:** start Reset All, close/reopen before its write settles, then settle write/read in the actual component harness: loading ends and empty state appears; repeat scoped deletion while initial load is pending and ensure remaining notes survive; close/unmount still rejects stale results; failed deletion remains recoverable. These are proposed fix acceptance checks, not executed repairs.

### T1 — P2: Settings changed during native Start are displayed but never sent to the accepted native playback

**Anchors:** `src/metronome/sharedMetronomeEngine.ts:335`, `:738`, `:1395`, `:1411`; caller `src/components/audioPractice/AudioPracticeMetronomeView.tsx:176`, `:190`, `:222`, `:561`; native parameter consumers `ios/App/App/MetronomePlugin.swift:60`, `ios/App/App/MetronomeEngine.swift:231`.

**Trigger:** on iOS, Start sends the native timing payload and awaits its bridge acknowledgement. While the acknowledgement is pending, use an enabled BPM/meter/sound control. The shared snapshot still has playing=false, so each setter updates UI/preferences but `pushNativeTimingUpdate` returns early. Start then marks playing=true without reconciling timing against the latest snapshot.

**Outcome:** the production engine can report 160 BPM, 3/4, wood while the accepted native Start retained 80 BPM, 4/4, classic. The settings remain unsent until a subsequent control change or new start. The Swift plugin copies the payload into engine timing, so the source contract supports the stale-native-configuration consequence. Actual iOS acknowledgement delays/frequency and audible mismatch were not measured. The window is strictly after payload capture and before JavaScript receives the acknowledgement; edits during route preparation are included in the payload and unaffected. Native startup is synchronous inside its Swift plugin method. Fresh callback challenge found no mitigating native notification: MetronomeEngine only invokes stateHandler(false) on Stop (line 282); JS ignores state events with playing=true or while startInFlight (line 267), and drops pulses (line 282)/bars (line 300) while snapshot.playing=false. The acknowledgement is the first path that sets shared playing=true, and it performs no timing reconciliation.

**Evidence:** `evidence-2026-10-06-tools-audit/lead-metronome-start-settings-race-probe.mjs` bundles the actual shared engine and holds only the native acknowledgement boundary. It records the old accepted payload, new shared snapshot and zero native update calls after success. Matching `.log` exits 0 after asserting the defect. Real UI callers are enabled and route through the shared setters. No production audio or device claim.

**Minimal fix direction:** track the timing revision used for Start and, after a successful current-generation acknowledgement, send/reconcile the latest timing if it changed. Respect existing control-generation Stop guards. Compared repair options: reconciliation preserves usable controls but needs version/order handling; disabling timing controls during a published starting state avoids the race but reduces interaction and requires UI propagation; publishing playing optimistically makes setters active but needs failure rollback and bridge-order guarantees. Reconciliation is the smallest repair compatible with the current public behavior; none was implemented.

**Regression criteria:** with actual engine/native-boundary harness, hold Start acknowledgement, change BPM/meter/subdivision/accent/sound, resolve Start, and verify accepted/current native timing agrees with snapshot; repeat stop-before-ack and ensure reconciliation cannot restart stopped playback. Also retain the existing delayed Start/background test. Proposed repair checks only.

### W1 — P2: A closed Music tools rail leaves its toolbar accessibility state exposed

**Anchors:** `src/components/MusicWidgetDrawer.tsx:24`, `:33`; `src/components/practice-chart.css:70`; `src/components/useCollapsibleWidget.tsx:319`; `src/components/ReferenceWidget.tsx:162`; caller `src/App.tsx:6797`.

**Trigger/guards:** Music score open, dock boundary width at least 700, an enabled tool collapsed and portaled into the dock. Hide the rail using its handle/swipe, or restore its closed preference. Handle announces aria-expanded=false and CSS translates the rail 72px; toolbar and enabled portal buttons remain mounted without inert/aria-hidden/visibility guard.

**Outcome:** disclosure state says closed while the toolbar remains semantically exposed. Enabled portaled buttons retain their ordinary keyboard/accessibility participation under the inspected source contract. Actual Tab traversal, visual offscreen position and VoiceOver behavior were not executed and remain inferred consequences, not measured claims.

**Evidence:** `evidence-2026-10-06-tools-audit/widgets-probe.mjs` renders the actual Drawer via real React SSR and verifies its closed toolbar has neither inert nor aria-hidden while the handle has aria-expanded=false. `widgets-closed-drawer-markup.html`, `widgets-probe.log` and independent `lead-review-widgets-probe.log`. Portal button participation is source-traced; the SSR does not claim to render all live portals.

**Minimal fix direction:** keep owners mounted to retain audio state, but set dock contents inert and hidden from accessibility while closed; keep the Show handle accessible and restore/rehome focus if closing while focus is inside. Do not inert the entire rail including the only reopen control.

**Regression criteria:** real browser keyboard and VoiceOver checks on >=700px Music workspace: focus cannot enter a closed dock, Show remains reachable, closing rehomes inner focus, opening restores access, widget/audio state survives; confirm small-screen portal placement separately. Not run because browser kernel/device validation is unavailable.

### I2 — P3: Web persistence recovery saves a rejected note without notifying open Insights

**Anchors:** `src/db/pitchInsightsRepository.ts:124`, `:154`, `:155`; `src/db/connection.ts:65`; `src/components/LivePitchTuner.tsx:758`; `src/components/audioPractice/PitchInsightsScreen.tsx:1106`.

**Trigger:** capture stable note A; its insert succeeds but web saveToStore rejects. No saved event is emitted, yet A remains in the live SQL database. Capture B after persistence recovers: the successful snapshot saves A+B, while only B emits its saved event. The already-open screen merges saved events and never discovers A until a full reload.

**Outcome:** durable history recovers A, but the open Insights view understates its history until close/reopen. This is a recovery consistency issue, not demonstrated permanent data loss. P3 reflects the failure boundary and available reload workaround.

**Evidence:** `evidence-2026-10-06-tools-audit/pitch-medium-persistence-recovery-probe.mjs` uses actual SQL.js schema/database and repository; initialization/persistence are injected. It asserts live A after rejected persistence, only B event after recovery, and A+B in exported/reloaded durable snapshot. Medium log plus independent `lead-review-pitch-medium-persistence-recovery-probe.log`. The open-screen consequence is derived from its actual merge handler, not an integrated IndexedDB run. Native SQLite unaffected by this web-only saveToStore boundary in the inspected source.

**Minimal fix direction:** deliberately choose an atomic rollback boundary or track dirty writes and issue a reconciliation event/full snapshot after storage recovery. Avoid adding unconditional success events before durability and thereby claiming unsaved notes were stored.

**Regression criteria:** fail one actual repository persistence, recover on next write, and assert durable rows and already-open screen rows match; separately assert repeated persistence failure preserves chosen retry/error policy. Proposed checks only.

## Checks actually executed

Lead existing scripts: all exit 0, saved as `lead-verify-*.log` under the evidence directory.

| Script | Narrow evidence class |
| --- | --- |
| verify-metronome-background.mjs | Actual shared engine with native/audio/lifecycle boundary mocks: lock continuity, stop, native interruption, delayed Start/stale foreground response, 3/8 payload, listen-back recovery |
| verify-metronome-program-review.mjs | Actual tempo/section utilities plus actual TimelinePlaybackEngine with mocked click engine and manually emitted bars/pulses; not native clock integration |
| verify-tuner-microphone-ownership.mjs | Actual ownership module with synthetic permission/stream handoffs, denial/stale results and 100 cycles; no microphone |
| verify-tuner-key-controls.mjs | Actual transposition math and legacy IDs, concert/written round trips |
| verify-tuner-history.mjs | Actual history utilities with synthetic frames: retention, silence, sample rates and anchoring |
| verify-tuner-diagnostic-mode.mjs | Actual diagnostic mode module with isolated env/storage; production mode ignores diagnostics |
| verify-native-tuner-receiver.mjs | Actual native receiver with EventTarget/native enable boundary mock: 10,000 frames, invalid rejection, idempotent cleanup and 50 reopen cycles |

Medium pitch existing checks all exit 0: verify-pitch-insights-capture, verify-pitch-insights-screen-lifecycle, verify-pitch-instrument-profiles. Evidence classes are specified in `2026-10-06-sol-medium-pitch-audit.md`; these combine actual utilities/component/repository with isolated React, native/SQL boundaries, and SQL.js SQLite WASM. They do not prove Capacitor/native durability or DOM rendering.

Widget existing checks both exit 0: verify-widget-ball-placement (actual geometry fixtures) and verify-navigation-response (native/coordinator mocks). Root also owns navigation-response: count that script once when aggregating unique checks. Source review covers visible/suspended/recording guards, one-shot workspace expand/collapse actions, finite/clamped positions and retained tool owners. See `2026-10-06-sol-medium-widgets-audit.md` for exact limits.

Four new feature probes executed: Start/settings race; Reset All/reopen; persistence recovery; Drawer SSR/keyboard handler. Lead independently reran the latter three once and saved separate `lead-review-*` logs; those reruns are not extra unique checks. Root's independent audio/control-center/playback-route/headphone/drone/access/settings/tap-tempo/native detector/pitch-delivery checks are recorded separately by root. Root's final unique existing-check tally is 31: root 20 (19 passed, one old stepped-color assertion failed), lead 7, pitch 3, widget-ball 1, with widget navigation deduplicated against root. Those statuses/limits are owned by root's integration evidence. The four new probes assert defects/semantic gaps, not feature acceptance passes. Root independently reran all four and confirmed their asserted outcomes. Fresh Medium critic reran the three executable logic findings into separate review-* logs; repeated runs are not new unique checks.

## Rejected candidates and optimizations

- LiveMetronomeStage's sound picker writes local preferences without calling the shared sound setter, but this presenter chain currently has no reachable app caller (`MetronomeStagePresenter` has no import/use). Rejected as a current user bug; dead-code cleanup can be considered separately.
- Pending Start double-tap: snapshot remains false and startInFlight rejects another Start. The current accessible button still says Start, so a second tap is not an explicit Stop request. Do not invent cancellation semantics; a published starting state is a possible UX improvement, not an independently proven P2.
- Web/native scheduling emits early bar notifications; TimelinePlaybackEngine explicitly models the early bar advance and conducting pulse catches up. Existing program tests pass their narrow manual-pulse contract. No new clock-integrated truncation bug was established in this bounded pass.
- Same-key pitch profile leakage, wrong current profile after capture switch, unfinished accepted-frame candidate, repeated denied microphone ownership and stale permission leaks were challenged by actual source/capture/profile/ownership checks; no new defect established.
- Hidden widgets retaining owners are intentional; visibility/pointer/inert guards at actual callers keep presentation separate from audio lifetime. The specific closed Music dock semantic omission is W1.
- Keyboard ball geometry overlap, ReferenceWidget's different obstacle strategy and short viewport/software-keyboard clipping were not promoted: manual placement may be intended and no rendered impact evidence exists. Details and narrower handler result remain in the widget report.
- setOutputGainMultiplier currently has no reachable production caller; native gain parity speculation was not counted as a bug.
- Stale native pause visibility risk from the previous routine audit was neither retested nor recounted here.

No performance optimization is promoted without a measured bottleneck. Existing bounded frame/history ownership checks support their tested memory/lifecycle contracts; no whole-app performance run or long tuner soak was repeated.

## Limits and Gauntlet decision

Browser CUA kernel could not start in the enclosing audit session; no live browser/device/microphone/gesture/safe-area/software-keyboard/VoiceOver/audio claims. Native Swift audio playback, actual Capacitor bridge delays, live IndexedDB failures and full cross-feature hardware transitions remain unvalidated. This scope deliberately excludes concurrent recording/multitrack ownership.

**Validated:** named existing checks and four isolated production-code/component probes. **Challenged:** async state races across user settings/navigation, disclosure semantics, and persistence recovery. Strongest confirmed challenge is the Insights reset/reopen race; native Start/settings divergence also breaches the timing contract. **Improved:** repeatable audit evidence and actionable repairs only; application unchanged by audit-only instruction. **Benchmark:** derived shared-state/async recovery/accessibility rubric. **Remaining gap:** two executed P2 logic bugs, one executed P3 repository consistency bug and one P2 source/SSR accessibility contract gap remain unfixed plus stated device/rendered evidence limits. **Feature quality decision: BAR NOT REACHED.** The audit deliverable is complete; request a repair pass separately. The fresh reviewer accepts the three executable findings with the stated pending-read/native-ack/web-persistence qualifiers; root accepts W1 as a narrow source/SSR gap with live accessibility consequences still unmeasured.

Final root check addendum: tuner stability/trace/input advice, Air tuner, meter logic, native plugin registration and practice sounds passed. Reactive-silk stopped at its stepped-color assertion; current smoothing was intentionally introduced by bd5ca35, so this is test drift rather than a proven product defect. Later assertions in that script were not executed. See the consolidated root report and 31-check manifest.

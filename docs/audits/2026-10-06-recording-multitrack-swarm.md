# Recording and multitrack workflow audit

The audit found eight reproducible defects in the source tested on October 6. Seven were subsequently fixed at the user’s request; browser recording startup was excluded. See [the completed fixes and verification](2026-10-06-recording-multitrack-fixes.md). The findings, source references and readiness assessment below describe the original audit snapshot.

Date: October 6, 2026. Source: BestTake at `cc66c3ee0cf7729f376276518a363dc6a054491a`, with concurrent Music, Games, and Routines changes preserved. Relevant file hashes and changed-file observations are in the evidence archive.

## Audit method and usage

The workflow follows the **Map routine audit swarm** chat: one GPT 6.1 Sol lead at ultra effort, two GPT 6.1 Sol reviewers at medium effort, a broad feature map, executable failure probes, and a fresh adversarial review. One medium reviewer covered recording and one covered multitrack; the lead independently covered shared lifecycles and challenged their claims. The coordinator replayed all four defect probe suites independently and ran the TypeScript build check.

The practical standard was to preserve performances and project identities, release resources after cancellation, preserve competing playback owners, report failed saves truthfully, and allow repair of missing media. The feature readiness bar is **not reached**: confirmed defects remain and physical recording, audible output, native rendering, and complete screen flows have not been verified.

Allowance was 91% remaining at dispatch and 87% at the final audit checkpoint. The requested reserve is at least 80%; the dispatch cutoff was 85% to allow room to finish. Usage is shared with other chats and reporting can lag, so this is a measured checkpoint rather than an enforceable account cap. No recurring audit was scheduled.

## Confirmed defects and fix order

P1 blocks a core workflow. P2 affects a normal workflow or recovery path. P3 needs an injected uncommon failure to trigger.

| Priority | Trigger and observed behavior | Production reference |
|---|---|---|
| P1 | Browser Audio or Video Record returns false before MediaRecorder starts because a native file writer is mandatory. | [Recording start](/Users/jameslobb/Documents/BestTake/src/hooks/useCameraSession.ts:2752) |
| P2 | An encoder error during a MediaRecorder take discards the performance and ends recording without a user failure message. | [Encoder error handler](/Users/jameslobb/Documents/BestTake/src/hooks/useCameraSession.ts:1703) |
| P2 | One unavailable received recording makes the entire saved multitrack project fail to reopen, preventing access to healthy parts and repair controls. Stored project metadata is not proven deleted. | [Shared take restoration](/Users/jameslobb/Documents/BestTake/src/multitrack/state/multitrackPersistence.ts:130) |
| P2 | Cancel while native stereo route application is pending; its late completion marks a playback route engaged with no remaining owner. | [Final route release](/Users/jameslobb/Documents/BestTake/src/utils/stereoPlaybackRoute.ts:113) |
| P2 | Start audio preview A, choose B while A is still preparing, then stop B. A never plays but its route hold remains. | [Stale preview completion](/Users/jameslobb/Documents/BestTake/src/utils/audioModeNativePlayback.ts:87) |
| P2 | Share and import a reopened front-camera multitrack part: panel mirroring disappears when the original Vault take lacks its own mirror flag. | [Project importer](/Users/jameslobb/Documents/BestTake/src/multitrack/state/multitrackFile.ts:137) |
| P2 | Keyboard activation of the center Record button invokes zero actions; pointer release invokes one. The long-press hook suppresses the native button click. | [Click capture](/Users/jameslobb/Documents/BestTake/src/hooks/useLongPress.ts:183) |
| P3 | Native video rendering succeeds, but an injected listener removal rejection replaces the successful result with an error. | [Export cleanup](/Users/jameslobb/Documents/BestTake/src/multitrack/export/multitrackExport.ts:281) |

The browser writer gate and keyboard problem were already documented on October 1 and excluded from the previous native fix scope. They are freshly reproduced existing defects. Neither establishes a new native recording regression. Native route defects are confirmed JavaScript ownership failures with explicit native boundary mocks; their actual sound or microphone effects require device testing.

## Proposed repairs and acceptance checks

1. **Browser recording:** allow the existing buffered recording path when running on web; keep native file writer failure actionable. Prove one recorder starts for both audio and video, stop yields a nonempty playable take, and a second take succeeds. Then test save and reload separately: the current web persistence fallback creates an ephemeral URL, and App persistence requires a nonempty file path. Removing the start gate alone will not establish durable browser recording.
2. **Encoder failure:** show one clear message that the take failed and provide a retry action. Clear capture and handsfree terminal state, save no misleading take, ignore late recorder callbacks, and prove the next Record works. Do not claim a permanently stuck recording ref; render synchronization already mitigates that narrower suspicion.
3. **Missing shared media:** restore each received source independently. Open the healthy project parts with a missing-source placeholder that retains its identity and descriptor. Two autosave and reopen cycles must retain that identity, and reconnecting a source must recover the part without replacing subsequent edits.
4. **Pending route cancellation:** reconcile final release with any pending route application, then recheck holds and generation before restoration. A surviving or newer playback owner must keep its route; a camera owner must keep its capture profile. Cover apply failure, `routeApplied:false`, and normal exactly-once release.
5. **Replaced preview ownership:** give each acquired route an idempotent owned release so an abandoned start releases its own hold. Slow A, fast B, stale A completion, then Stop B must leave zero holds and must never interrupt B. Also cover same-source restart, failure and cancellation at every await, and an independent YouTube consumer.
6. **Orientation:** retain sanitized panel mirroring through `.btmulti` import. Roundtrip true, false, and unset flags against original Vault metadata without a mirror flag; imported preview and export must preserve the source composition.
7. **Keyboard Record:** provide guarded button click or keyboard activation alongside long press. Enter and Space must each start or stop exactly once, pointer tap once, long press must toggle handsfree without starting a take, and disabled controls must remain inactive. Confirm the rendered button with actual keyboard input.
8. **Export cleanup:** isolate listener removal as best-effort cleanup. Successful rendering must retain its completed path when removal rejects; failed rendering must retain the original error, and cancellation must remain distinguishable.

For the two route problems, the lead compared local owned leases with a serialized audio controller and a shared capture/playback arbiter. Local leases plus pending-apply reconciliation have the smallest review and regression surface. A broader arbiter would need a separate design and migration review.

## Workflow coverage

Executed means current production modules or extracted callbacks ran with explicit storage, React, media, or native boundary mocks. It does not mean the screen flow ran. Source review and executable tests are kept distinct in the detailed domain reports.

| Workflow group | Audit coverage | Remaining practical check |
|---|---|---|
| Manual audio and video; rapid Record taps; live waveform | Start callbacks fail on web; duplicate and pending starts and waveform modules pass. | Physical capture and encoded output. |
| Handsfree threshold, calibration, quiet finish, replay, Next and rearm | Cycle, monitor, manual promotion, handoff and camera replay checks pass. One older routing assertion fails. | Room acoustics, audible replay, and consecutive saved takes. |
| Camera lens and Audio or Video mode changes | Capture/save locks and rollback reviewed; gesture utility passes. | Actual lenses and camera recovery. |
| Permission denial, revoked input and interruptions | Recovery and lifecycle wiring reviewed. | OS permission changes, lock screen and phone calls. |
| Current and Best preview; compare; library playback | Preview, route and library modules pass; replacement route leak reproduced. | Rendered comparison, timing and audible output. |
| Save, reopen, notes, rating, delete and trim | Persistence/error wiring reviewed; trim and guidance utilities pass. | Real SQLite and filesystem failures, reload and file deletion. |
| Enhance and take sharing | Preview renderer behavior passes; native audio DSP fixture executes on macOS. | Device rendering, output fidelity and native share sheet. |
| Multitrack new, open, duplicate, rename and autosave | Session/persistence modules execute; project controls reviewed. | Screen flows and storage-quota failures. |
| Vault selection, local files and received projects | Sharing, native chunk reads, picker helpers and recovery modules pass; two collaboration defects reproduced. | Files and share-sheet handoff on device. |
| Backing audio and YouTube; scores, PDFs, images and cues | Persistence, preview, layout and recovery modules execute; import controls reviewed. | Picker rendering, network playback and acoustic monitoring. |
| Slots, framing, layouts, overlays, mix, mute and gain | Session actions, geometry and export payloads pass. | Rendered interactions and resulting audio balance. |
| Playback, seeking, alignment and trimming | Timing, source mapping, readiness and transport modules pass. | Exact audiovisual sync on device. |
| Overdub, count-in, stop, retry, keep and cancel | Actual recording hook/callback tests pass with camera and transport doubles. | Capture completion into review and saved project. |
| Undo, reset, unlink, relink and missing-source recovery | Session and recovery checks pass except missing received media. | Full screen and reload behavior. |
| Multitrack render, preview, save, export, share and cancel | Export payload, pre-abort, success and injected failure branches execute. | AVFoundation rendering and cancellation during encoding. |
| Headphones, Bluetooth, background and Plus gates | Route/headphone helpers execute; guards reviewed. | Physical route changes, app lifecycle and access transitions. |

No multitrack Solo or playback-speed control was found in the current source, so those were not reported as tested features. Detailed cases and boundaries: [recording report](evidence-2026-10-06-recording-multitrack/recording/report.md), [multitrack report](evidence-2026-10-06-recording-multitrack/multitrack/report.md), and [ultra review](evidence-2026-10-06-recording-multitrack/ultra/report.md).

## Verification results and limits

The two medium reviewers ran **29 distinct existing verification scripts: 27 passed and 2 failed**. One failure is the browser recording defect. The other is an outdated iPad replay routing expectation requiring clarification; it does not prove silent playback on device. Cases after that failed assertion were not executed. The ultra lead reran two already-counted transport/count-in scripts successfully. The coordinator's TypeScript build check, normal web build, and isolated iOS Simulator build passed. The first native build tool call timed out after five minutes while compilation continued; a subsequent compile-only call confirmed success. The QA app installed and launched successfully.

Four independent coordinator probe suites reproduced all eight defects. Three suites deliberately exit zero after asserting the defective state; that means the reproduction worked, not that the product passed. The browser writer regression correctly exits one. The route suite also passed three controls: normal settled release, a surviving competing consumer, and single-preview cancellation. The orientation probe executes save, reopen against the original Vault take, build and import. A rejected missing source blocks reopen without proving data deletion.

Browser automation could not initialize because the old workspace root `SessionMirror` is a symlink to `BestTake`. Read-only and test commands ran from the canonical repository with the approved sandbox override. Initially all iOS simulators were shut down. The [iOS debugger skill](/Users/jameslobb/.codex/plugins/cache/openai-curated-remote/build-ios-apps/0.1.2/skills/ios-debugger-agent/SKILL.md) requires: “If none are booted, ask the user to boot one (do not boot automatically unless asked).” The user booted iPhone 17 on iOS 26.5. A separate BestTake QA app (`com.besttake.app.practiceqa`) built, installed and launched. The coordinator handled its microphone permission prompt using a current screen target. Its visible welcome screen then produced a settled snapshot with zero interaction targets; the prior reader also failed accessibility translation. Screenshots verify launch, but recording, playback, save/reopen and multitrack screen tests could not proceed. The runtime log reports a duplicate WebKit accessibility class; this may relate to the tool failure but is not established as its cause or a product defect. No browser screen test or physical-device capture is claimed. [Native attempt and setup actions](evidence-2026-10-06-recording-multitrack/root/native-attempt.json) and [launch screenshot](evidence-2026-10-06-recording-multitrack/root/native-welcome.jpg) are saved.

One extra source lead remains unconfirmed: closing multitrack during count-in may defer cleanup of a late cancelled take until another target opens. Routine navigation during arming is guarded, so that suspicion was rejected. Neither was added to the eight confirmed defects.

## Useful improvements

Give every recording failure a consistent message explaining whether a take was saved and how to retry. Extend the standard practice smoke routine to record, listen, keep, reopen and compare two takes, then overdub and exchange a project. This would catch musician-facing failures earlier than isolated helper checks.

Add narrow regressions for the confirmed race and metadata defects to the regular verification set. Preserve identity when a source is unavailable and log owned route leases when investigating device-only handoffs. These improve recovery and diagnosis without adding steps to normal practice.

All reports, original probes, baseline outputs, coordinator replay logs and source fingerprints are saved in [the evidence archive](evidence-2026-10-06-recording-multitrack/). The archive preserves the original harnesses and their explicit boundaries; some use this machine's canonical repository or temporary evidence paths. Product source and configuration were not changed by this audit.

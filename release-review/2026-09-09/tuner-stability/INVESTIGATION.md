# Long-session tuner restart investigation

User reports a restart after approximately 1–2 minutes of playing. Idle reproduction is unknown. The supplied Xcode excerpt was subsequently identified by the user as possibly outdated; it shows a Sentry startup thread warning, not a tuner termination. No Sentry changes were made on that evidence. Available local Jetsam reports do not establish the cause of the reported restart.

Implemented resource safeguards:

- Native PCM delivery is credit limited to two unacknowledged events, including the Capacitor/WebKit delivery stage. Previously only the encoding queue was limited, and dispatch into WebKit could continue accumulating work while the web process stalled. JavaScript acknowledges even ignored or malformed frames in a finally block. Delivery is negotiated, so old native/web bundles retain compatibility. Listener setup precedes enabling acknowledged delivery; fresh sessions invalidate outstanding tokens. Speech feedback receives its original audio path independently.
- Stable held-note sampling retains at most 640 recent samples instead of accumulating indefinitely. Insight measurements still emit when the note ends.
- Live pitch coaching loads/retains at most 2,000 recent observations for the selected transposition. Stored Insights are not deleted.
- Canvas drawing capped at 30fps and 2x pixel density, independent of detection cadence. This reduces work and texture size on high-refresh/3x screens without altering microphone thresholds or instrument profiles.

Validation:

- TypeScript project check passed.
- Swift plugin syntax parse passed; standalone delivery-window test passed one million attempted deliveries during a stall, acknowledgement credit, disable/reset, and stale-token cases.
- Eight-hour accelerated input test at 120 input frames/sec: candidate maximum 640 samples; scrollback 2,401 samples; retained JS heap approximately 5.23–5.30 MiB across hours 1–7. This is a buffer stress test, not an eight-hour iPhone test.
- Existing tuner geometry/color and history tests passed.

Still needed: current termination log and physical-device confirmation beyond the reported failure interval. These changes address demonstrated resource risks; the specific crash has not yet been reproduced or conclusively attributed. No Xcode build or Capacitor sync performed, per user preference.

## Fresh Xcode log

The user supplied a 1,907-line console capture. Lines 1469–1475 show WebProcessProxy / WebPageProxy termination with reason `Crash`, followed by `WebView process terminated`; line 1483 shows `WebView loaded`. This confirms a web-content process crash and Capacitor reload, not a demonstrated native App process crash. GPU exit follows with `IdleExit`; it is not proof of a GPU fault. The console does not contain the WebContent exception stack or an explicit memory-limit-kill reason.

The capture has 1,069 PCM log lines and no `deliveryToken` / `acknowledgeNativePitchFrame` entries. It therefore does not exercise the negotiated bounded-delivery path implemented during this investigation. A one-time `[PitchTap] delivery=bounded-v1 maxInFlight=2` log now identifies that path for the next device test. PCM volume alone does not prove a growing queue.

Next verification: sync native and web changes together and run the physical-device tuner longer than the reported 1–2 minutes (at least 5–10 minutes). If it still reloads, obtain the corresponding `com.apple.WebKit.WebContent` diagnostic report with its exception stack to distinguish WebKit/rendering, JS runtime, and memory-pressure failures. Do not infer those from the console's generic `reason=Crash` alone.

## Delivery regression and v2 correction

The next phone log shows two PCM frames followed by stale/silent recovery loops and no acknowledgement calls. The v1 two-credit mechanism starved delivery in that run; this is a regression introduced by the safeguard, not successful crash prevention. The exact reason the acknowledgement failed is not established by truncated console payloads.

V2 removes the acknowledgement-RPC dependency. Native delivers a JSON-encoded CustomEvent to the existing WebView and releases credit in evaluateJavaScript's completion callback, including error completions. The shared JS receiver is installed before opting into this delivery mode. At most two evaluations can be outstanding; subsequent PCM frames are dropped when saturated. Legacy native/web combinations retain the original listener path. The negotiated mode is logged as `delivery=completion-v2 maxInFlight=2`.

Validation: TypeScript passed, Swift syntax passed, 3,000 consecutive events delivered through the actual JS receiver without an acknowledgement API, removed subscribers receive nothing, lifecycle/rapid-switching checks passed, and native window saturation/reset tests passed. Physical-device validation and original crash attribution remain outstanding. No Xcode sync/build performed.

## Tuner-tab native detector migration

The user approved native pitch processing only for the full tuner tab. AudioTunerTab is the sole opt-in via `nativePitchProcessing`; audio widgets, Quick Tuner, games and playback retain their existing detection paths.

The capture engine now estimates frequency/confidence/RMS on a serial native worker using a 4,096-sample MPM/NSDF window with a 2,048-sample overlap and Accelerate dot products. Only one analysis job can be outstanding. Instrument gates, frequency ranges, smoothing, note hysteresis, transposition, Insights and history remain in the existing tracker presentation pipeline. The full tuner does not acquire the PCM bridge subscription or call JavaScript findPitch on its native-result path. Small result events use bounded WebKit completion delivery; native session monitoring retains existing ownership. Other consumers can still request PCM independently.

Graph drawing targets 60fps for this opt-in path, with 2x resolution cap and timestamp jitter tolerance. Source generations discard old results after stop/reconfigure. Native sample buffers and queued analysis work are bounded.

Validation: 36 pure/harmonic generated-tone cases across 44.1/48kHz and 55–1760Hz passed with worst error 0.235 cents. Silence handled; 20,000 repeated detector windows completed in about 4.85 seconds on the development Mac (not a physical-device performance measurement). Receiver test delivered 10,000 compact results, rejected invalid values and passed cleanup plus 50 reopen cycles. Existing audio lifecycle tests, TypeScript, Swift syntax parsing, and whitespace checks passed. Standalone Swift tests were compiled, but no iOS app build/sync was performed.

Phone verification marker: `[NativeTuner] detector=native-mpm-v1 compact-results-only`. Original WebContent crash still requires sustained device validation; this migration reduces the tuner’s web workload without asserting a proven crash root cause.

## Activation failure: duplicate native method registration (September 9)

User clarified the new native tuner never activates and instead shows “Tap to reactivate tuner.” This is a startup regression, distinct from the earlier unproven long-session WebContent crash.

Found two registrations compiled into the same native class: Swift `CAPBridgedPlugin.pluginMethods` and the legacy Objective-C `CAP_PLUGIN` category. Capacitor's installed `CAPBridgedPlugin.h` macro implements `pluginMethods` in that category, overriding the Swift getter. The category list lacked `setNativeTunerPitchEnabled` (and the earlier acknowledgement method). Capacitor core only exposes commands in its native header; calls to a missing command reject as `UNIMPLEMENTED` before reaching Swift. The pitch tracker swallowed that original attachment error and repeatedly tried recovery.

Removed the redundant Objective-C category while retaining its file in the existing Xcode target. Swift now owns the complete registration list. Added one initial attachment warning so future startup failures preserve the actual error. No change to microphone permissions, graph styling/motion, instrument profiles, widgets, or game detection.

Browser integration fixture: `scripts/fixtures/tuner-startup/index.html`. Run the local Vite server and open this path. It imports the real AudioTunerTab, useLivePitchTracker, renderer and Capacitor proxy. Plugin headers are read from the native source files; only microphone hardware and native result delivery are simulated. `?legacy=1` deliberately hides the new method to reproduce the old header. This fixture is not a production entry point and is not imported by the app.

Before removal: actual tuner UI showed the reported reactivation prompt; monitor started 3 times; 0 pitch frames; native detector method unavailable. After removal: A4/440 Hz visible, changed to B4/493.9 Hz, silence returned to Listening without a recovery prompt. Leaving stopped monitor and result delivery; reopening resumed A4. No WebKit getUserMedia fallback was requested. Fixture warnings from unimplemented Drone hardware and absent native Insights database are expected fixture limitations; those services are not replaced by the startup test.

Added `scripts/verify-native-plugin-registration.mjs`: enforces a single registration, checks all 63 registered native methods have implementations, and exercises start/enable/disable through the real Capacitor proxy. Existing lifecycle, native receiver and generated-tone detector checks passed, as did TypeScript and Swift syntax parsing. No iOS build/sync or physical-device verification was performed. Browser checks establish startup/UI integration, not resolution of the original physical-device crash.

Final styled browser run: 204 seconds, 4,705 compact pitch results, no reactivation prompt and zero WebKit microphone requests. Three deliberate close/reopen cycles resulted in exactly four monitor starts and three stops. Changing Winds to Strings restarted detection without restarting capture. After more than two uninterrupted minutes following the last reopen, changing A4 to B4 still updated the visible readout to 493.9 Hz. Inspected the rendered graph in both light and dark appearance. This is simulated-native browser evidence, not a device crash/performance clearance.

## Full device console after native activation fix

Source: user attachment `7df0b13e-0566-48bf-94bb-a2d3621ca5de/pasted-text.txt` (1,026 lines).

- Lines 483–486 and 554–562 confirm setNativeTunerPitchEnabled reaches Swift, native-mpm-v1 is enabled, and the capture tap delivers. The missing-registration startup regression is no longer blocking this run.
- Lines 566–583 show successful stable-observation SQLite writes, not a reported database exception.
- Lines 584–590 explicitly report WebContent PID 26100 crashing and WebView termination. Capacitor's WebViewDelegationHandler resets its bridge and reloads on that callback, matching WebView loaded at line 598. This is a web process restart; the log does not show the host native app exiting.
- The foreground-UID permission warning occurs in the subsequent startup (line 726), not at the crash. Entitlement/assertion errors after process termination do not establish the initiating failure.
- Device free_memory drops from 2,287,976,448 at initial startup to 317,243,392 after reload. These are device-wide snapshots, not WebContent footprint measurements; they do not establish a leak, jetsam, or the allocation owner.
- No exception type, crashed-thread stack, jetsam reason, or WebContent memory footprint is included. Need the matching com.apple.WebKit.WebContent .ips and/or JetsamEvent report to choose a causal fix. Do not treat native pitch detection as proof that all WebKit-side causes are eliminated, or claim the original crash resolved by the browser fixture.

## Latest reset: overlapping microphone ownership

Source: attachment `f4d1f639-a4e5-4244-975f-1cfd92d78910/pasted-text.txt`.

- Lines 411–433 show the main `useCameraSession.requestCameraAccess.audio` opening a live WebKit microphone. Lines 450–482 then start the native tuner capture and detector. Native processing had not removed the separate recording hook's WebKit capture. The earlier isolated tuner fixture omitted that hook, so its zero-WebKit-requests result did not establish the full app's microphone ownership.
- Lines 536–542 confirm WebContent PID 26348 terminates with `reason=Crash`; line 550 reloads the WebView. Successful SQLite writes precede it; GPU `IdleExit` follows it. None establishes the initiating fault. The earlier foreground-UID warning is not crash-stack evidence.
- Inspected the connected phone's systemCrashLogs using CoreDevice. No matching WebContent report or new App crash report was available. The September 9 01:19 Jetsam report is the previously inspected unrelated overnight event. Device-wide free-memory snapshots do not identify a WebContent leak.

Implemented an explicit native-tuner microphone handoff. Before starting native capture, the main recording hook stops its WebKit stream and invalidates its pending stream generation. Pending microphone requests must settle, and their late tracks are stopped before native startup. Shared microphone acquisition/recovery cannot reopen WebKit while native tuning owns capture. Normal recording capture is restored after leaving the tuner. Record readiness follows native capture availability. This fixes a demonstrated integration defect; the console alone does not prove it caused the WebContent crash.

Added the real useCameraSession hook to the browser fixture behind `?shared=1`. Observed one live WebKit track before tuner entry, zero during native tuning, no extra WebKit request after deliberately invoking microphone recovery, and one restored track after leaving. Record readiness remained true. Native hardware/results are simulated: this validates integration and handoff, not physical-device crash clearance. Ownership tests cover pending, denied and stale permission results plus 100 handoffs; existing lifecycle and native registration checks and TypeScript passed.

Also restored the rounded tuner/widget note font, removed the redundant status pill and visible swipe hint, and moved the readout up. Pitch history remains keyboard accessible. Restored the 60Hz presentation/smoothing clock independently of the 30Hz canvas cap and removed the additional native-result 15Hz throttle that made motion sluggish. Instrument sensitivity/forgiveness logic is retained.

The user will perform tuner testing and Xcode builds. No iOS build or sync performed. The original reset remains unconfirmed as resolved until device validation; do not describe this as a proven root-cause fix.

## Connected-device investigation after handoff fix still crashes

September 9, 15:57–16:07 EDT: phone connected as CoreDevice `D694E1F1-E4B5-5F70-A548-4FB658154D23`, hardware UDID `00008130-000A49203EF2001C`. System crash-log listing still has no WebContent report or App crash from today. No additional production code changes made during this investigation.

Successfully captured a five-minute all-process Activity Monitor trace on the physical phone, `/tmp/besttake-tuner-live-20260909.trace`, 15:58:53–16:03:54 EDT. Exported process metrics to `/tmp/besttake-tuner-process-metrics.xml` and raw samples to `/tmp/besttake-tuner-sysmon.xml`. App PID 26554 and WebContent PIDs 26120/26486 show zero sampled CPU activity and unchanged small footprints; no process replacement observed. This run did not exercise active tuning and is NOT evidence of tuner stability or absence of a leak. User confirmation of active reproduction is needed before starting the next timed capture.

`log collect --device-name 'James Lobb'` requires root. `devicectl device sysdiagnose` exists in this installed Xcode and can collect the archive, but prompts for the Mac administrator password; cancelled without entering or requesting a password in chat. No diagnostic archive was collected. A future sysdiagnose must be authenticated locally by the user, or manually triggered on the phone. Nothing has been uploaded to Apple.

Next capture can use Instruments without rebuilding: `xcrun xctrace record --template 'Activity Monitor' --device 'James Lobb' --all-processes --time-limit 5m --output <new-path>.trace`. Wait for the user to confirm tuner is open and ready, record while they play, and obtain the reset time. Use sysdiagnose/system logs alongside the trace if memory/CPU samples do not identify the initiating failure. The native process and WebContent must be assessed separately.

## Confirmed reproduction: WebContent grows to approximately 2 GiB

User confirmed ready, played into the tuner during the second physical-device capture, then reported “crashed” at approximately 16:16:38 EDT. Capture `/tmp/besttake-tuner-active-20260909.trace`; exported measurements `/tmp/besttake-active-metrics.xml`. Filtered measurements are preserved alongside this report in `device-crash-memory.csv` and `device-crash-memory-summary.json`.

- Native App PID 26743 survived: physical footprint initially 20.7 MiB, peak 22.5 MiB, approximately 21.9 MiB for most of active tuning.
- WebContent PID 26747: initially 1046.1 MiB (tuner was already open), last sample 2007.1 MiB at 56.2 seconds. It disappeared and was replaced by PID 26755 at 57.2 seconds. Replacement settled near 185 MiB by the end of capture.
- GPU PID 26749: active-run footprint approximately 75–96 MiB, last sample 81.9 MiB; also replaced after the WebContent failure.
- Still no new matching system crash report. The trace proves runaway growth in WebContent coincides with the reset. It does not yet distinguish retained JS objects from canvas/compositor/other WebKit allocations or establish a kernel jetsam termination reason.
- Attempting a 15-second Allocations attachment to replacement WebContent PID 26755 failed: Instruments could not acquire privileges for the protected Apple process. The resulting allocations trace is NOT usable allocation evidence.
- Safari launched successfully; Develop → Inspect Apps and Devices sees James Lobb’s iPhone but displays “No inspectable contents.” Asked user to enable Web Inspector in iPhone Safari Advanced settings and reopen BestTake on the home screen. Remote inspector could support targeted live isolation without another build. No app source changes made in this capture step.

## Opt-in isolation build

User enabled phone Web Inspector; Safari still showed no inspectable contents even after foregrounding BestTake. Tried physical-device LLDB attachment to native App PID 26743. Attach succeeded, but evaluating the web controller stalled. Sent interrupt/detach, then terminated only the newly started host LLDB PID 6217 when it remained unresponsive. Brought BestTake back to the foreground with CoreDevice. No debugger expression completed a change; no debugger intentionally left attached.

Added `VITE_TUNER_DIAGNOSTICS=1` build flag. It explicitly enables Capacitor web inspection and shows a small Crash test selector on the full tuner only. Normal builds ignore the saved mode. Four exclusive modes:

- Normal: unchanged baseline.
- Static background: disables the animated page wash; live canvas, detector, history and Insights continue.
- Graph off: reduces the live canvas backing store to 1×1 and bypasses drawing; live pitch readout, animated page wash, history collection and Insights continue. Do not browse history during this test, since the history overlay has its own canvas.
- Insights off: stops the full tuner's stable-observation collection/writes and live coach reads. Existing stored observations are retained; live graph, detector and history continue.

Modes persist locally for a fresh app launch and remount the presentation when selected. Browser verification with the real tuner/shared capture hooks and simulated native results confirmed graph backing store 1×1 in Graph off, full-sized canvas plus `background-image: none`/no transition in Static background, A4/440Hz continuing with Insights off, and no additional fixture Insights errors during that mode. Normal-build flag isolation test, audio lifecycle test and TypeScript pass. These checks validate the diagnostic switches, not a crash fix.

User build command from repository: `VITE_TUNER_DIAGNOSTICS=1 npm run cap:sync`, then build/run in Xcode. First test: choose Static background, fully close/reopen the app to start with fresh WebContent memory, reopen tuner and signal ready for Instruments recording. No iOS build or sync performed by the assistant. Root allocating feature remains unproven until controlled phone comparison.

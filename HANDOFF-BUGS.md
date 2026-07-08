# Bug Batch Handoff — 2026-07-08 (updated)

Repo builds clean: `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, `npx cap sync ios`, and the full `xcodebuild` simulator build all pass after this pass. Cursor co-edits this repo — always read current file state before editing. New plugin methods need registering in BOTH `BestTakeAudioPlugin.swift` `pluginMethods` AND `BestTakeAudioPlugin.m`.

---

## ✅ Bug #1 — Audio recording stop failure — FIXED

`toggleRecording`/`startRecording` in `src/hooks/useCameraSession.ts` now gate on `isRecordingRef.current` instead of the async React `isRecording` state, which could read stale mid-start and turn a "stop" tap into a silent second "start". See prior handoff section for full detail — unchanged this pass.

## ✅ Bug #3 (tuner half) — Fixed with high confidence

**Root cause found in `src/hooks/useLivePitchTracker.ts` `recoverMicGraph()`:** it called `graph.context.resume()` but never awaited it or checked the resulting state — it immediately tested `context.state !== 'closed'`, which is true for `'suspended'` too. On iOS, `AudioContext.resume()` called from a non-gesture callback (`visibilitychange`/Capacitor `appStateChange` are not user gestures) frequently resolves without error yet leaves the context stuck `'suspended'`. The old code treated that as "recovered" and gave up — a permanently silent tuner until something unrelated happened to rebuild the graph. This matches "tuner sometimes stops working after backgrounding" exactly.

**Fix:** `recoverMicGraph` is now async, awaits the resume attempt, and only treats the graph as healthy if `context.state === 'running'`. If not, it disposes and rebuilds via `tryAttach()` (called from the same event, more likely to land inside a live gesture window).

**Metronome half of #3:** `src/metronome/sharedMetronomeEngine.ts`'s `handleForegroundRecovery` was audited and is already robust — retries up to 6 times with backoff, calls `start()` and verifies it actually succeeded, and preserves `resumeOnForeground` intent for a later retry if it doesn't. No changes made; no comparable bug found there.

**If tuner silence still recurs:** the graph is native-tap-based in camera mode (separate from this WebKit path) — if the repro is specifically in camera mode, the bug is elsewhere (the native audio tap's own reconnect logic), not this fix. Confirm which mode (audio vs camera) before re-investigating.

## ✅ Bug #4 — Camera quality degradation — Partial fix + instrumentation added

**Concrete fix applied (`ios/App/App/NativeCameraRecordingEngine.swift`):** the capture session never explicitly asserted continuous autofocus/exposure/white-balance or low-light boost — it relied entirely on AVFoundation's implicit defaults, which are not guaranteed to survive every session reconfigure or a long background/foreground cycle. Added `applyContinuousFocusAndExposure(to:)`, called both at initial session configure AND at every preview-warm/health-recovery pass (`resetVideoZoomIfNeeded`, which already runs on `ensureSessionHealthy`). This directly targets "fast movement blurry" (stale/locked exposure or focus mode) and is low-risk (only re-requests continuous modes, doesn't change resolution/preset).

**Instrumentation added (can't verify further without device):**
- `ProcessInfo.thermalStateDidChangeNotification` observer logs `[CameraQuality] thermalState changed -> <state>` plus a full format/AF/AE snapshot whenever thermal state changes.
- `logActiveFormatDiagnostics(reason:)` also logs a baseline snapshot right after every session configure (`sessionConfigured`).
- **Next step if quality still degrades:** reproduce, then filter Xcode console for `[CameraQuality]`. Compare the "sessionConfigured" baseline line against the line at the moment quality visibly drops. If `format=` shrinks or `minFrameDuration=` grows, it's thermal/format throttling (a real iOS behavior, would need explicit format-lock logic to fully solve). If focus/exposure mode shows anything other than continuous, the new fix isn't holding for some reason — check for another code path that sets a fixed/locked mode. If the log shows no change at all, the degradation is likely NOT in the capture session — check the JPEG frame-bridge JS side next (`src/utils/nativeCameraFrameBridge.ts`, bitmap disposal was already verified correct this pass, so look at `bridgeJpegQuality`/`bridgeMaxPixelDimension` constants in the engine possibly being reduced somewhere, or actual video *recording* quality — as opposed to *preview* quality — which is a separate encoder path).

## 🔶 Bug #2 — Current-take X button needs multiple taps — Hardened, not confirmed fixed

**Investigation (thorough, no device access):** the "Current Take" is the challenger `PipWindow` in `src/components/PipCompareRow.tsx` (`label="Current Take"`). Checked every plausible mechanism:
- The X button (`PipWindow.tsx` lines ~688–748) already has `onPointerDown/onTouchStart/onTouchEnd={stopEventBubble}` + `onClick` with `e.stopPropagation()` — correctly guarded against the sibling drag-to-pin gesture.
- `useDragToPin.ts`'s `handlePointerDown` already bails via `.closest('button, label, input')` before arming a drag or calling `setPointerCapture` — so a genuine button press should never be captured by the drag surface.
- `PipDragGhost` (the drag preview overlay) already has `pointer-events-none` — ruled out as an interception source.
- The delete/unpin logic itself (`handleUnpinChallenger` in `App.tsx`) is synchronous and side-effect-safe.

**Fix applied (defensive hardening, not a confirmed root-cause fix):** widened the drag-hook's bail-out selector from `'button, label, input'` to `'button, a, label, input, [role="button"], [data-drag-ignore]'` — covers any Pressable variant that might render differently than expected, and adds a `data-drag-ignore` escape hatch for future buttons layered over draggable surfaces.

**If the bug persists after this**, it is NOT in the mechanisms above (all verified correct in code) — next step is a device repro with temporary logging: add `console.log('[TapDebug] X pointerdown target=', event.target)` in the X button's `onPointerDown` and `console.log('[TapDebug] drag armed for', event.target)` in `useDragToPin.ts`'s `handlePointerDown` right before `setPointerCapture`. Tap the X a few times reproducing the bug and read which fires, in what order — that will show definitively whether the drag hook is still somehow arming (contradicting the code read) or whether the issue is downstream in React's render/reconciliation (e.g., a key change causing the button to unmount/remount mid-gesture).

## 🔶 Bug #5 — Move Routines + Start Practice to bottom — Re-confirmed already correct

Checked twice this pass from independent angles: the JSX in `src/practiceTimeline/components/PracticeTimelineView.tsx` renders the footer after the scrollable content, and the CSS chain (`practice-timeline { flex:1; min-height:0 }` → `__scroll { flex:1; min-height:0; overflow-y:auto }` → `__footer--dock { margin-top:auto }`) is the textbook correct "sticky footer" pattern — it should reliably pin Routines/Start Practice to the bottom regardless of content length or viewport size.

**I did not change this CSS** — doing so without visual confirmation risks breaking a layout that's already structurally correct. **Please attach a screenshot of what you actually see** next time this comes up; if the buttons appear mid-screen, the most likely explanation is a DIFFERENT screen than the one audited here (e.g., an active-practice-session view, or a Labs entry point) rather than this file.

---

## Build commands
```bash
npx tsc --noEmit -p tsconfig.app.json
npm run build
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx cap sync ios && node scripts/patch-ios-audio-plugin.mjs
cd ios/App && xcodebuild -workspace App.xcworkspace -scheme App -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
```

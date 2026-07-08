# Multitrack "play-along" fixes — engineering handoff

> **STATUS (applied):** All three fixes below are now implemented in code and pass the full build chain (tsc · vite · cap sync · xcodebuild). Bug 2 → `useMultitrackRecording.ts` (0.25s route-settle lead for every take). Bug 3 → `useMultitrackSync.ts` `startAnchoredToClick` now applies `getReferenceChaseLeadSec()`, and the click delay no longer double-compensates. Bug 1 → `playElements` hardened (2500ms ready budget, context resume-to-running retry, post-batch retry pass). The negative-offset export bug is also already fixed (native `renderMultitrackVideo` clamp + corrected sign convention), and export now honors per-panel mixer volume/mute. **What remains is on-device verification** — the sections below are the test methodology and rationale, kept for whoever validates on hardware.

Goal: make it **easy to play along with up to 6 parts**. Three concrete bugs, each diagnosed against the current code with exact file/line references and ranked fixes. All three are iOS-WKWebView audio timing/route problems — the fixes must be verified **on a physical device** (the simulator cannot record real audio and its media latency differs).

## Architecture in one screen (read this first)

- **One master clock:** `multitrackTransport` (`src/multitrack/synchronization/multitrackTransport.ts`) is derived from the shared Web-Audio `AudioContext.currentTime`. Timeline `t` maps to media time `t + trim.start + offset`. Every media element is *slaved* to the transport; the transport never follows a media element except a one-time lock after playback confirms progressing.
- **All take audio funnels through ONE Web-Audio graph:** `takePlaybackSpeaker.ts` wraps each `<video>`/`<audio>` in a `MediaElementAudioSourceNode → gain → ctx.destination` on the single shared playback `AudioContext`. This is what lets >1 element play audio at once on iOS (iOS normally allows only one audible HTMLMediaElement; routing them all into one Web-Audio destination presents them to the OS as a single stream). **This is the key to the 6-box requirement.**
- **Recording timeline 0 = the metronome's first click.** `sharedMetronomeEngine.start({firstBeatDelaySec})` schedules click 1 at `ctx.currentTime + max(START_LEAD_SEC, firstBeatDelaySec)` and records that instant in `getLastStartInfo().firstClickCtxTime`. Overdub references are started via `sync.startAnchoredToClick(firstClickCtxTime)` and the transport epoch is pinned to that click time.
- **Latency model** (`src/multitrack/synchronization/metronomePlaybackCompensation.ts`): a WKWebView HTMLMediaElement's audio reaches the speaker ~`WEBKIT_MEDIA_RENDER_OVERHEAD_MS = 165ms` later than a Web-Audio-scheduled click, on top of shared hardware output latency (`getAudioOutputLatencyMs()`).

Key files:
- `src/multitrack/synchronization/useMultitrackSync.ts` — playback/sync engine (Play All, rAF slave loop, `startAnchoredToClick`, `playElements`, `prepareAtStart`).
- `src/multitrack/recording/useMultitrackRecording.ts` — count-in state machine (`beginCountIn`).
- `src/multitrack/components/MultitrackOverlay.tsx` — wires the two together (`onArmPlayback`, `onAnchoredReferenceStart`, `onPrepareCountInAudio`, etc.).
- `src/metronome/sharedMetronomeEngine.ts` — click scheduler (`start`, `getLastStartInfo`, `prepareForCountIn`).
- `src/utils/playbackRouteCoordinator.ts` — native AVAudioSession route (`preparePlaybackRoute`, `reassertPlaybackRouteForCountIn`).
- `src/utils/takePlaybackSpeaker.ts` — per-element Web-Audio routing.

---

## Bug 1 — "Play All" must play all boxes (video+audio) together, up to 6

**Where:** `useMultitrackSync.ts` → `playAllFromUserGesture` (line ~506) → `playElements` (line ~262).

**Current behavior:** seeks all elements to timeline 0, `await preparePlaybackRoute`, `primeTakePlaybackForUserGesture(...elements)`, `resumePlaybackAudioContext`, `await Promise.allSettled(playNow.map(waitForMediaReady(el, 900)))`, then `Promise.allSettled(playTakeMediaAudible(...))`. It already logs `'[useMultitrackSync] panel refused/failed to start'` per element.

**Most likely root causes (verify with the console logs above):**
1. **Not every element is on the shared Web-Audio speaker bus before `play()`.** If `hasTakePlaybackSpeakerRoute(el)` is false for some panels, those elements are *raw* HTMLMediaElements — and iOS silences all-but-one raw audible element. `primeElementForPlayback` calls `routeTakePlaybackToSpeaker(el, 1, false)`, but confirm it actually creates+connects the `MediaElementAudioSourceNode` for **every** element *and* that the shared `AudioContext` is `running` at that moment (a suspended context connects silently).
2. **`waitForMediaReady(el, 900)` timing out on some of 6** (decode contention when 6 videos spin up at once) → those elements still get `play()`-ed but may not have a decoded frame, and iOS can refuse `play()`. 900ms is tight for 6 simultaneous H.264 decodes.

**Fix steps:**
1. Reproduce with Safari Web Inspector attached to the device; open Console; hit Play All with 6 boxes. Record exactly which panel ids log "refused"/"failed" and whether the shared AudioContext state is `running`.
2. In `applyMixState`/`primeElementForPlayback`, add an assertion/log that `hasTakePlaybackSpeakerRoute(el) === true` for every registered element right before `playTakeMediaAudible`. Any `false` here is the bug — force `routeTakePlaybackToSpeaker` to complete (it may be async/lazy) before starting.
3. Raise the readiness budget for grouped playback: change `waitForMediaReady(el, 900)` → `waitForMediaReady(el, 2500)` in `playElements` (matches the value `prepareAtStart` already uses at line ~396). Grouped 6-box start is not latency-critical the way count-in is, so a longer settle is fine.
4. Ensure `resumePlaybackAudioContext()` has actually resolved to a `running` context before any `play()` — if it resolves while still `suspended`, retry once. A suspended shared context = every box silent even though video advances.
5. If a subset still refuses on the first gesture, add a single retry pass: re-`play()` only the elements whose `.paused` is still true 150ms after the batch, from the same user-gesture task.

**Pass criteria:** 6 boxes, tap Play All once → all 6 videos advance AND all 6 are audible, started within one frame of each other. No "refused/failed" logs.

---

## Bug 2 — First take in the first box: metronome click inaudible (works in later boxes)

**Where:** `useMultitrackRecording.ts` → `beginCountIn`, the `clickEnabled` branch, lines ~236–311. Overlay wiring: `onPrepareCountInAudio` (`MultitrackOverlay.tsx` ~313) calls `reassertPlaybackRouteForCountIn()`.

**Why it works on overdubs but not take 1 — root cause:** timing of the route switch vs. the first click.
- On the first take there is **no reference media**, so `wantsReference === false` and the code deliberately uses `firstBeatDelaySec = 0.05` (line ~266, "use the metronome's minimal lead so the click is audible immediately").
- `sharedMetronomeEngine.start` then schedules click 1 at `ctx.currentTime + max(START_LEAD_SEC=0.05, 0.05) = +50ms` (`sharedMetronomeEngine.ts` line ~902).
- But immediately before this, the native camera start reconfigured the AVAudioSession to a **capture** session, and `reassertPlaybackRouteForCountIn()` (`playbackRouteCoordinator.ts` ~245) reapplies the **loud playback** session. That native category/route switch does **not** become audible in ~50ms. So click 1 (and often 2) render into a not-yet-active output → silence.
- On overdubs, `firstBeatDelaySec = getMetronomeDelayAfterReferenceSec()` ≈ `(165 + outputMs)/1000` ≈ **200–300ms** — enough time for the route to settle, so the click is audible. **This is exactly why "it works in other boxes."**

(Note: the current code comment claims a *long* delay was silencing the first-take click and that's why it was cut to 0.05 — the evidence above says the opposite. Treat the comment as a hypothesis that didn't hold.)

**Fix steps (ranked):**
1. **Give the first take a route-settle lead.** In `beginCountIn`, for the `!wantsReference` case set `firstBeatDelaySec` to a settle-safe value instead of `0.05`. Recommend `0.25` (250ms) as a starting point:
   ```ts
   const firstBeatDelaySec = wantsReference
     ? await getMetronomeDelayAfterReferenceSec()
     : 0.25 // was 0.05 — too short for the reasserted AVAudioSession route to become audible
   ```
   The count-in is bars @ BPM, so a 250ms lead before click 1 is imperceptible.
2. **Make the settle explicit and deterministic** (better than guessing a constant): after `reassertPlaybackRouteForCountIn()` resolves in `onPrepareCountInAudio`, `await` a real "route active" confirmation from the native plugin (or a fixed `await new Promise(r => setTimeout(r, 200))`) **before** returning, so the metronome never starts until the loud route is live. Keep `firstBeatDelaySec` small only if this settle wait exists.
3. Verify the metronome's `AudioContext` is the **same** shared playback context that `preparePlaybackRoute` activates (`primePlaybackAudioContextSync`). If `prepareAudioContextForStart()` lazily creates a *different* context, resuming one won't un-silence the other.

**Pass criteria:** fresh session, first box, click enabled → every count-in click (including the first) is audible on device speaker and through headphones.

---

## Bug 3 — Overdub reference plays "a little later," hard to line up

**Where:** `useMultitrackSync.ts` → `startAnchoredToClick` (line ~451), reached via `onAnchoredReferenceStart` (`MultitrackOverlay.tsx` ~297).

**Root cause:** the reference's *audible* output lags its `play()` call by ~165ms (WKWebView media pipeline), but `startAnchoredToClick` seeks each reference to **exactly** its timeline-0 media position and starts it:
```ts
el.currentTime = Math.max(win.trimStart, win.trimStart + win.offset)   // line ~467
```
The transport epoch is pinned to `firstClickCtxTime`, so the *clock* is correct, but what the musician *hears* from the reference is ~165ms late relative to the click grid → they play late → the new take is misaligned with take 1.

There is already a helper for exactly this — **`getReferenceChaseLeadSec()` (returns 165ms) in `metronomePlaybackCompensation.ts` — but it is defined and never used anywhere.** That is the missing piece.

**Fix steps (ranked):**
1. **Apply the chase lead** so the reference's *delayed audible output* lands on the click grid. In `startAnchoredToClick`:
   ```ts
   import { getReferenceChaseLeadSec } from './metronomePlaybackCompensation'
   ...
   const lead = getReferenceChaseLeadSec()
   for (const [panelId, el] of playNow) {
     const win = clipWindowFor(panelId, el)
     el.currentTime = Math.max(win.trimStart, win.trimStart + win.offset + lead)
   }
   ```
   This seeks the media ~165ms ahead; ~165ms later (when its audio actually reaches the speaker) it is playing the content for timeline 0.
   - **Important interaction:** this compensation and the metronome-delay compensation (`getMetronomeDelayAfterReferenceSec`, which *also* pushes the click ~165ms+ later) are two ways to solve the same skew. Using **both** double-compensates and makes the reference *early*. Pick one:
     - **Recommended:** keep `firstBeatDelaySec` small for overdubs too and let the **chase lead** on the media do the alignment (media-side compensation is more reliable than delaying the click, because the click is sample-accurate and shouldn't be moved).
     - If you keep the click delay instead, do **not** add the chase lead; instead reduce `getMetronomeDelayAfterReferenceSec` to just the *residual* skew and measure on device.
2. **Pre-roll for reliability** (robust but more work): the true source of jitter is that reference `.play()` fires at an unpredictable time after the click is scheduled (async awaits + native calls inside `playTakeMediaAudible`). Instead of starting the reference *at* the click, **start it muted during the count-in** (e.g. one full click before the downbeat), let it reach steady-state progressing, then unmute/reseat at the downbeat. A warm, already-decoding element has near-zero start latency, so its audible position is deterministic.
3. **Empirically tune `WEBKIT_MEDIA_RENDER_OVERHEAD_MS`** (currently 165): record an overdub against a metronome, import both into a DAW, measure the actual click-vs-reference offset, set the constant to the measured value. Do this per device class if needed.

**Pass criteria:** overdub with 1–5 existing takes → the reference audio you play along to is phase-aligned with the count-in clicks (test by clapping on the beat; the new take should line up with take 1 in the grid and in the exported video).

---

## Shared verification method (do this for every change)

1. **Device, not simulator.** Attach Safari → Develop → [device] → Web Inspector for live console.
2. Build/sync chain: `npx tsc --noEmit -p tsconfig.app.json` · `npm run build` · `npx cap sync ios` · `node scripts/patch-ios-audio-plugin.mjs` · open `ios/App/App.xcworkspace` in Xcode → run on device.
3. For timing bugs (2 & 3), the ground truth is a **DAW measurement**: export/record and measure click-vs-audio offset in milliseconds; don't trust "sounds about right."
4. Regression guard: after each fix, re-test the other two scenarios — these three share the route/transport plumbing and fixes can interact.

## Suggested order

Bug 2 first (isolated, one constant / one settle-await, unblocks basic first-take usability) → Bug 3 (apply the unused `getReferenceChaseLeadSec`, pick ONE compensation strategy) → Bug 1 (readiness budget + confirm every element is on the Web-Audio bus). Re-verify all three together at the end.

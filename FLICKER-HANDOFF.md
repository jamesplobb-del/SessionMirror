# One-frame screen flicker on overlay open/close — handoff brief

## The app

BestTake: a music-practice app. Capacitor 8 + React 19.1 + Vite 6 +
framer-motion 12.40, running in a WKWebView on iOS. The app's background is a
live camera preview — on iOS it is a stream of JPEG frames pushed from native
over the Capacitor bridge and painted into a `<canvas>` at ~30fps, not a
`<video>` element. Most UI chrome is translucent and sits over that canvas.

Repo root has `src/` (React), `ios/App/` (native), `src/styles/*.css` +
`src/index.css` (~10k lines of CSS, plus Tailwind utilities used inline in TSX).

## The symptom

A single-frame "blink" of the whole screen, landing **after** an open or close
animation has already visually finished. In the owner's words:

> "screen flicker after leaving homepage, closing workspace, and closing
> settings, the drone flickers as well upon closing but only the drone flickers,
> not the whole screen"

> "for workspace, after the opening animation, blink, then close, after closing
> animation, then blink. after closing animation on settings blink, after closing
> animation after hitting quick start, blink. drone flashes after closing"

> "almost looks like a quick blink after the closing animation happens on all of
> these scenarios"

Five surfaces: **homepage, Workspace popover, Settings, Quick Start, drone
widget**. The drone is the odd one out — only the widget itself flickers, not the
whole screen.

## Hard evidence (from frame analysis of a screen recording)

A 9-second screen recording was decomposed into 552 frames and each frame's mean
RGB computed. Five single-frame outliers (a frame differing from *both*
neighbours in the same direction):

| frame | t | prev → blink → next (mean luma) |
|---|---|---|
| f0055 | 0.917s | 114 → **68** → 109 |
| f0160 | 2.665s | 113 → **68** → 108 |
| f0273 | 4.548s | 119 → **81** → 119 |
| f0219 | 3.648s | 130 → **162** → 134 (brighter) |
| f0422 | 7.032s | 116 → **98** → 114 |

### Finding 1 — it is a WebKit paint, not the native layer

In the blink frames the **iOS status bar (clock, wifi, battery) stays at full
brightness** while everything below it dims. iOS draws the status bar above the
WebView, so this rules out the camera bridge, `AVCaptureSession`, audio-session
routing, and anything else native. An Xcode console log over the same
interactions confirmed it independently: only **3** camera bridge stop/start
cycles across the whole session, nowhere near one per navigation, and nothing
in the log correlates with the five blinks.

### Finding 2 — the dark blinks are a specific CSS scrim, identified by arithmetic

Dividing the blink frame by its neighbour tile-by-tile (4×8 grid) gives a
**uniform 0.60 ratio in every tile**, edge to edge. Per-channel the ratios are
*not* equal — R 0.565, G 0.600, B 0.641 — so the overlay is not pure black.

Solving `out = in·(1−α) + C·α` per channel against candidate CSS colours:

- base `(124, 115, 103)` → blink `(70, 69, 66)`
- `.practice-menu-backdrop` = `rgba(8, 12, 19, 0.46)` predicts `(70.6, 67.6, 64.4)`

Match within ~2/255 on all three channels, and the residuals lean exactly the way
that rule's overlaid `radial-gradient(..., rgba(25,152,255,0.08), ...)` predicts.
That is a positive identification of the element.

### Finding 3 — the bright blink is a different failure

f0219: the Workspace popover renders as **its own card background with every
child missing and the backdrop scrim gone**, for one frame, at identical geometry.
f0218 (the frame before) shows the tray fully populated with eight items and the
scrim present; f0220 is normal again. So it is not a loading state and not part
of the open animation — the subtree paints empty for exactly one frame.

## Mechanism identified, and the fixes already shipped

Framer-motion clears the inline `opacity` it was animating when an exit
completes, and the element paints once more at its **stylesheet** value before
React removes the node. With no `opacity` rule that value is `1`, so a scrim that
had just faded to nothing slams back to full strength for one frame.

Already applied (do not redo):

- `src/styles/practice-hub.css:24` — `.practice-menu-backdrop { opacity: 0 }`
- `src/index.css:2385` — `.native-sheet-backdrop { opacity: 0 }`

Note this fix is only correct for **scrims**, whose resting state is "absent" at
both ends. Applying it to a card or panel would fix a close-blink and create an
open-blink, since a card's correct resting state differs at the two ends.

Separately, a second bug class was found in the same codebase, already documented
in a comment at `src/styles/electric-refinement.css`:

> "Camera overlays use their own surfaces instead of sampling the moving canvas.
> Removing a backdrop-filter on dismissal can invalidate WebKit's camera layer."

A live `backdrop-filter` on the exact element framer-motion fades on exit makes
WebKit resample a blur of the moving camera canvas every frame of the fade, then
destroy the layer at unmount. This was already proven to cause the **drone-only**
flicker (`filter: drop-shadow` on `.drone-widget-draggable`, fixed by moving the
shadow to a non-animated child).

The strip rules for this are gated `html:not(.app-audio-mode)` — **camera mode
only** — so every instance in audio mode was left live. Two were closed this
session:

- `src/styles/electric-refinement.css:401` — `html.app-audio-mode
  .settings-branch-tray { backdrop-filter: none !important }`
  (the base rule at `src/index.css:6202` sets `blur(24px) saturate(1.18)`)
- `src/components/LivePitchTuner.tsx:429` — the drone panel and the transposition
  panel share one `<AnimatePresence>` with **no keys** on either child. Framer-
  motion identifies children positionally, so it saw one slot and treated a panel
  swap as a re-render rather than an exit + enter. Both are keyed now.

**The owner reports the blink is still present after all of the above.**

## Highest-confidence open lead

`src/components/ui/AnimatedBottomSheet.tsx:132` — the sheet surface class for the
default variant is:

```js
'border border-white/70 bg-white/90 shadow-2xl backdrop-blur-2xl'
```

`backdrop-blur-2xl` is Tailwind for `backdrop-filter: blur(40px)`, applied to the
`motion.div` that framer-motion fades and unmounts on exit. Because it is a
Tailwind utility inside a JS string it is invisible to any grep of the `.css`
files — that is why the earlier sweeps missed it.

The only rule stripping `backdrop-filter` from `.native-bottom-sheet` is:

```css
html:not(.app-audio-mode) :is(.native-sheet-backdrop, .native-bottom-sheet, .settings-branch-tray) {
  backdrop-filter: none !important;
}
```

so **in audio mode a default-variant bottom sheet keeps a live 40px backdrop-blur
over the tuner canvas through its entire exit animation.** Settings and Quick
Start are bottom sheets. This is the same bug class as the drone, third instance,
unfixed.

Verified against the shipped bundle: `.native-bottom-sheet--audio-light` *is*
covered (`backdrop-filter: none`), the default variant is not.

## What has been tried and did not work

1. Emptying `motionGpuLayer` (`src/utils/motionPresets.ts`) — the shared
   `will-change: transform, opacity` applied to most animated surfaces. No
   change. This rules out compositor-layer promotion/demotion as the cause: with
   the hint present the surface stays promoted throughout and still blinks.
2. Stripping `filter: drop-shadow` from the drone's animated element — no change
   on its own; that element is promoted by its drag transform regardless.
3. `opacity: 0` defaults on the two scrims above — correct for the mechanism
   proven in Finding 2, verified present in the running build, blink persists.
4. Three earlier CSS attempts on assorted scrims, all wrong.

## Constraints on reproducing it

- **The iOS Simulator has no working audio** — tuner, drone and recording all
  fail there, so the audio-mode surfaces cannot be exercised in the sim.
- The dev server uses a self-signed HTTPS cert that blocks headless preview; the
  static build served on `:4173` has `requestAnimationFrame` effectively frozen,
  so animation timing cannot be trusted there.
- Practical consequence: **this bug has only ever been observed on a physical
  device**, and every diagnosis so far has come from frame-differencing screen
  recordings rather than from a live debugger.

## What would be decisive

A 5-second screen recording of one open/close on the current build, frame-
differenced the same way. The direction and per-channel ratio of the remaining
blink distinguishes between:

- **same dark scrim, same magnitude** → a scrim that has not been defaulted to
  `opacity: 0` yet; solve its composite to name it
- **inverted (bright) blink** → the `opacity: 0` fix is working and has exposed
  the mirror case on an element whose resting state should be visible
- **different colour** → a different element entirely; the composite arithmetic
  will name it

## Questions worth attacking

1. Is the exit-time inline-style clear actually framer-motion 12.40 behaviour, or
   is it React 19's concurrent renderer committing the removal one paint late?
   A minimal repro outside this app would settle it.
2. `src/components/PracticeHub.tsx:374` — `<AnimatePresence initial={false}>`
   whose direct child is a plain unkeyed `<div className="practice-menu-layer">`
   rather than a keyed motion component. Framer-motion's contract wants keyed
   children. Does an unkeyed non-motion wrapper desync presence tracking?
   Other unkeyed `AnimatePresence` children exist at `src/App.tsx:5968`,
   `src/App.tsx:6006`, `src/App.tsx:6082`,
   `src/components/FocusedPracticeCue.tsx:83`,
   `src/components/HandsFreeSettingsCard.tsx:61`,
   `src/components/ReviewModeOverlay.tsx:1441` and `:1502`,
   `src/components/ui/ActionSheet.tsx:65`,
   `src/components/ui/AnimatedBottomSheet.tsx:147`.
3. Is there a single root cause, or is "blink" three different bugs the owner is
   reporting as one? Finding 2 (dark scrim) and Finding 3 (empty subtree) have
   demonstrably different signatures.

## Ground rules

- The owner handles all git commits. Do not commit.
- `npm run cap:sync` needs a UTF-8 locale (`LANG`/`LC_ALL`) or CocoaPods dies on
  a Ruby encoding error.
- Verify any claim about the shipped CSS against
  `ios/App/App/public/assets/index-*.css`, not the source — the minifier merges
  rules with identical declaration blocks into shared selector lists, which
  breaks naive greps. It also folds values (`900ms` → `.9s`).

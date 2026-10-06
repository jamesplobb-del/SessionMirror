# BestTake widget audit — 2026-10-06

Audit-only, bounded Sol Medium widget pass for the Sol Ultra tools lead. Working tree based on cc66c3e with earlier fixes and concurrent recording/multitrack audit files preserved. No app source changes, fixes, commits, releases, or actual user storage writes.

## Ranked finding

### W1 — P2: Closing the Music tools rail does not hide its toolbar from accessibility

Anchor: `src/components/MusicWidgetDrawer.tsx:33` (closed state is applied to the outer class at line 24). Supporting anchors: `src/components/practice-chart.css:70`, `src/components/useCollapsibleWidget.tsx:319`, `src/components/ReferenceWidget.tsx:162`.

Reachable trigger and guards: a Music score is open (`musicRoomActive`, App.tsx:6797), viewport/boundary width is at least 700, and at least one enabled tool is collapsed. `useCollapsibleWidget` selects the existing `music-widget-dock` as its portal host at that width, provided `visible`, `present`, `collapsed`, and `showBall` are true. Clicking “Hide music tools”, swiping its handle right, or restoring the saved closed preference sets `musicWidgetDrawerOpen=false`. This changes the drawer class and handle's `aria-expanded`, while leaving its toolbar and portaled enabled buttons mounted. The relevant CSS only translates the drawer 72px; there is no closed-state visibility/inert/accessibility guard on the toolbar. The drawer preference defaults from localStorage and is persisted (App.tsx:669–676).

Impact: the semantic toolbar remains available when the disclosure announces itself closed, and ordinary enabled buttons retain their keyboard/accessibility participation. This is an accessibility state contract defect. Browser Tab order, actual rendered location, and VoiceOver behavior were not measured and are not claimed as executable evidence.

Executable evidence: `evidence-2026-10-06-tools-audit/widgets-probe.mjs` bundles the actual Drawer component and renders both open and closed markup through real React SSR. The closed toolbar has neither `inert` nor `aria-hidden`, while its handle announces `aria-expanded=false`. Saved output: `widgets-closed-drawer-markup.html`; assertions and result: `widgets-probe.log`. The icon's own `aria-hidden` is correctly excluded from toolbar assertions. The remaining portal-button contract is traced in source, not supplied by a DOM simulation.

Suggested repair for later implementation: keep the toolbar mounted to retain tool/audio state, but make only the dock contents inert and hidden from accessibility while closed; preserve the Show handle as an accessible control. Restore/rehome focus when a drawer closes with focus inside it. Verify with real keyboard and VoiceOver after implementation.

## Verification and coverage

- `node scripts/verify-widget-ball-placement.mjs` — PASS. Existing ball placement across portrait, landscape, and short viewports; expanded panel obstacles; phone/stand workspace tray protection. Log: `widgets-placement.log`.
- `node scripts/verify-navigation-response.mjs` — PASS. Native-status-bar request coalescing, rapid Tools/Camera transitions, and retry after native failure. Log: `widgets-navigation.log`. This does not test actual native display.
- `node docs/audits/evidence-2026-10-06-tools-audit/widgets-probe.mjs` — PASS. Actual Drawer SSR plus an isolated actual collapsed-ball keyboard-handler probe. React hook effects and motion values are mocked for the latter, so it proves handler state only.

Read actual callers and controls for pitch, metronome, drone, takes, ReferenceWidget, MusicWidgetDrawer, useCollapsibleWidget, useMusicDockItem, floatingWidgetLayout, workspace score restoration, routine collapse/expand requests, and recording locks. Parent suspension guards and `visible` options explain hidden tool balls; collapsed widgets have visibility/pointer guards while retaining their audio ownership. Takes controls become inert during recording. Reference playback suspension includes recording/stopping and visibility. Existing persistence validates finite positions, clamps on relevant boundaries, and rejects persistent ball coordinates from substantially changed viewport sizes. Project changes hide the score's takes widget and restore saved desk tool settings with one-shot expand requests.

## Rejected / unpromoted candidates

1. Keyboard movement can geometrically overlap another collapsed ball: `useCollapsibleWidget.tsx:337` explicitly passes `avoidOverlap=false` and saves the new position. Actual handler probe moves y220 to y244 with two ArrowDown calls; a peer at y288 would geometrically intersect. Not promoted: keyboard intentionally allows manual arrangement, no rendered occlusion evidence, and existing placement checks cover initial/settled overlap resolution. The probe records the narrower behavior only.
2. ReferenceWidget does not participate in shared panel obstacle reservations. Its expansion/resize uses clampWidgetPosition rather than the shared obstacle map. Not promoted: source alone establishes differing placement strategies, not an observed inaccessible control or rendered overlap.
3. Expanded panels can exceed a sufficiently short viewport or encounter the software keyboard. Not promoted: no DOM, screenshots, or device keyboard evidence; pure clamp mathematics cannot establish actual visual clipping. Pitch has boundary/widget ResizeObservers and a visualViewport listener; other widgets have their own resize paths.
4. Hidden floating widgets remain mounted. Rejected as a defect: callers intentionally retain owners and independently guard presentation/interactivity; core tuner/metronome/drone lifecycle remains the tools lead's scope.
5. Routine changes collapse tools and workspace actions expand them. Rejected as a defect: documented behavior; effects consume one-shot requests and reopening saved score settings provides expand requests.

## Limits

Browser CUA kernel could not start in the enclosing audit session; this pass made no browser/DOM, real-device microphone, gesture, rendered safe-area, keyboard, screenshot, or audio claims. No unrelated whole-app exploration or optimizations. Evidence files are uniquely named `widgets-*` under the shared tools evidence directory; other agents' evidence and all existing work remain preserved.

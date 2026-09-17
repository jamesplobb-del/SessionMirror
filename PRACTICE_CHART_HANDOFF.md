# Practice on the music — handoff

Updated September 16, 2026. Local and uncommitted, on `launch-prep`.

Replaces the v1 note. v1 imported a PDF and floated a "Music" pill over the page; the storage
survived, the chrome did not.

## What this is

The part is the room. A PDF or a photo of the part fills the screen, the practice tools fold to
the same 56px balls every other tool uses, and the record orbit is unchanged — you play from the
page and hit record without leaving it. It is not a score library and not a forScore clone: no
pencil, no stamps, no setlists, no Scores tab, no `.4sc`.

## The shape of it

**Music is a tool on the desk.** `showMusic` is an app setting, a `DeskSnapshot` field and a
Workspace toggle, exactly like Metronome and Drone — including being cleared by the Camera/Tools
crossing. That one decision is what makes routines work for free: a step's desk already travels
with it.

**Tools only, not Camera.** Camera's chrome is white glass built to read against a dark preview,
and over white paper none of it is visible; Tools is already a light room, so the widgets, the deck
and the balls land there correctly with no second theme. The camera also has nothing to show while
a part covers the viewfinder.

**The page is fitted between the chrome, not behind it.** The tabs above and the record orbit below
are both measured live (they move with the refinement theme, the safe area and text size) and the
page is fitted into the band between them. In a whole-page fit there is nowhere to scroll, so a
page fitted to the full screen would put the last system of every page permanently under the deck.

**Two pages in landscape.** An iPad on a stand in landscape fits two whole pages; showing one with
half the screen white is not what it was put there for. `fit` starts as `auto` and resolves to a
spread when two pages genuinely fit, one page otherwise. A spread is a row: a turn moves on by two
pages, a half turn by half a row.

**One chart per project.** A vault project is the folder for one excerpt; the file sits next to
that excerpt's takes. Switching project switches the music.

**Turning is scrolling.** Pages are laid out in one continuous column with no gap, and a turn
moves the scroller to the next stop — a whole page, or half of one when half turns are on. The
no-gap column is the whole trick: stopping halfway leaves the bottom of the page being played on
top of the screen and brings the top of the next one up underneath it.

## Files

New:

- `src/components/practiceChart/chartLayout.ts` — all the geometry, pure: page fitting, turn
  stops, which pages are in view, reading position as a fraction. Tested by
  `scripts/verify-practice-chart.mjs`.
- `src/components/practiceChart/chartDocument.ts` — pdf.js loading and page rendering, one open
  document cached at a time, canvases capped at 4M pixels.
- `src/components/practiceChart/PracticeChartPaper.tsx` — the page strip: virtualised canvases
  (current ± 1), fit modes, restore-on-open, turns.
- `src/components/practiceChart/MusicWidget.tsx` — the Music ball and its panel.
- `src/components/RoutineMusicSetup.tsx` — pinning music to a routine step.
- `scripts/verify-practice-chart.mjs`

Rewritten: `src/components/PracticeChartLayer.tsx`, `src/components/practice-chart.css`,
`src/utils/practiceChartStorage.ts`.

Touched: `appSettings`, `hudQuickSettings`, `workspaceDesks`, `practiceRoutines` (all gain
`showMusic`); `SettingsBranchWheel` + `ControlDeck` (the toggle); `RoutineBuilder`,
`GuidedRoutineBuilder`, `PracticeHub`, `App.tsx`; `vite.config.ts` and `package.json`.

## pdf.js, on purpose

`<object type="application/pdf">` renders a PDF in WKWebView and gives back no control over it —
no way to turn to a page, and no way at all to show the bottom of one page above the top of the
next. Half turns are the feature; rendering the pages ourselves is the only way to have them.

`pdfjs-dist@4.10.38`, **legacy build**: it carries its own core-js polyfills
(`Promise.withResolvers`, `Promise.try`), so it runs on the iOS 15 WebView this app still targets.
It is its own lazy chunk (410 kB) plus a 1.4 MB worker asset, fetched only when a player opens
music. `npm run copy:pdf:fonts` copies the base-14 font data into `public/assets/standard_fonts`,
the same way `sql-wasm.wasm` is handled, and both `dev` and `build` run it.

## The room stands down

A HUD that paints across the page is the bug this pass exists to fix. While the page is up,
`html.app-music-page` and `.app-shell--music-page` are on, and:

- the audio-mode and tuner washes go transparent (they are declared on `html` with `!important`
  in `practice-system.css` and `audio-mode-tools.css`, so the override has to outrank them there);
- the audio tab bar and the reference tool strip are not rendered — they are pills across the top
  of the part, and Hide page brings them straight back;
- the audio take-card panel stands down, and turning Music on turns `showTakeCards` off;
- camera chrome goes dark glass, because white glass over white paper is invisible.

The camera session keeps running under opaque paper. Nothing stops capture to show a page.

## Routines

`Reference & music` is the third page of the step editor, for `record` and `focus` steps only
(Tuner and Metronome steps open their own tabs, where a page would be a lie). Choosing a file
binds the step's practice project on the spot via `onCreatePracticeItem` — a step with music and
no project is not a state that can exist.

Sharing a `.btplan` carries `desk.showMusic` and nothing else. `parsePracticePlanFile` already
nulls `projectId`, so a student opens the teacher's step with the Music ball offering "Add music".
No bytes, no blob URLs, no copyright in the plan file.

`openRoutinePracticeSession` no longer forces take cards on for a step whose desk opens on music.

## The iPad could never leave portrait

Worth reading on its own, because it is native and it is not mine.

`PortraitBridgeViewController` overrode `supportedInterfaceOrientations` with a flat `.portrait`
and `shouldAutorotate` with `false`, for every device. The root view controller is what UIKit
actually asks, so that quietly overrode three places that all say iPads should rotate:

- `AppDelegate.application(_:supportedInterfaceOrientationsFor:)` returns `.all` on iPad, with a
  comment that iPad "is a two-handed, stand-and-music-desk device";
- `AppDelegate.lockInterfaceToPortrait()` already guards with `!isPad`;
- `lockPortraitOrientation.ts` calls `ScreenOrientation.unlock()` for tablets.

The view controller now mirrors the same rule — `.all` on iPad, `.portrait` on iPhone. iPad
landscape layouts that were already written (Practice Home, Tuner, Metronome, the deck and tab
rails) now actually appear, and a part can be read two pages at a time, which was the point.

**This is a behaviour change beyond the music page** and deserves a look: every iPad surface can
now be seen in landscape for the first time. Practice Home, Record, Tuner and Metronome were
checked and are properly laid out. **Camera in iPad landscape is the one surface not checked** —
framing and the orientation a take is recorded in are worth a look before this ships.

## Second pass: the takes ball, rehearsal view, and the marker

**The takes are a ball.** On a surface where the part is the whole screen the
take cards cannot be a panel across the middle, and they cannot live on the deck
either — the deck is the first thing a player puts away for a rehearsal. So they
fold to the same 56px ball as every other tool and open into the compact pills
the Tuner tab already uses. `DraggableTakesWidget`, `ballSlot: 5`.

**Rehearsal view** (`Full page` in the music widget) stands the tab bar and the
deck down so the part gets the whole screen — on an 834×1194 iPad that is 972px
of page becoming 1079. The balls stay, because they are the tools. It is
deliberately **not remembered**: a setting that survives would mean opening a
part next week to an app with no tabs and no deck and no memory of asking for
that, which reads as broken rather than as a feature. A quiet grab handle at the
bottom edge brings the room back, and so does hiding the page or turning the
tool off.

**The marker** is two colours, one width, an undo and a clear — not a pencil.
Marks are stored per page in **page-normalised coordinates**, so they stay put
through a rotation, a spread, a fit change and any screen the part is opened on.
With the marker out every tap is a mark, so tap-to-turn stands down and the page
stops scrolling under the hand; it is capped by default and never remembered,
because a part that opens in marking mode draws a line across a system on the
first tap meant to turn it.

**Save PDF** writes the marks into the original pages with `pdf-lib` and hands
the file to the system share sheet. It is the same PDF with marks in it, not a
stack of screenshots: page count, page sizes and the original text all survive,
which `scripts/verify-practice-chart-ink.mjs` asserts. A photo of a part becomes
a one-page PDF the same way.

## Bugs this pass found and fixed

Everything below was found by driving the real UI, not by reading it.

1. **Turning Music on silently dropped the Current Take.** It set `showTakeCards: false`, and that
   flag is wired to which take is the challenger — an effect keyed on it calls `setChallengerId(null)`.
   Music no longer touches it; the takes stand down by being drawn as the Tuner tab's compact pills
   instead.
2. **The Workspace toggle lied about its own state.** `hudQuickSettings` is memoised and its
   dependency list never gained `settings.showMusic`, so the tray showed Music as on while it was
   off. Tapping it then did the opposite of what it said. This is the likeliest cause of the
   "bugs entering music and closing it out".
3. **`showMusic` survived the Camera/Tools crossing** when every other tool is cleared by it.
4. **A corrupt PDF left a blank white sheet over the whole room**, with the reason whispered inside
   a folded widget and a stale "1/6" on the ball. It now says what happened on the page, with
   Choose another file and Hide page.
5. **The tab bar sat 35px over the top system.** A hardcoded inset was wrong; it is measured.
6. **The deck and the take pills covered the last system of every page**, unreachably.
7. **Empty "No Best Take" pills were drawn over the staff.** They appear only when a take exists.
8. **Turning the tool off left the room standing down** — a transparent HUD over a live camera with
   no page behind it.
9. **The take-card panel was unmounted, not hidden.** `AnimatedTabPanel` drops its children when
   inactive, and that subtree holds a shared **native audio-tap claim**
   (`useLiveRecordingWaveform`) that the floating tuner and hands-free read through. The app had
   already learned this rule once — the `.widget-is-collapsed` note says folding a tool must never
   take its capture down with it. It is now hidden rather than unmounted. **This is the most likely
   cause of "the pitch graph reads nothing over the music" and it needs a device to confirm**: the
   browser uses a per-consumer WebAudio analyser, so it cannot reproduce the symptom — driving it
   there showed the tuner reading A4/440.0 Hz identically with and without a part up.

Two things that looked like bugs and were not: the app hanging on a splash after
`location.reload()` is a pre-existing web-only IndexedDB lock, and the page not returning after
Games is unreachable, because the tab bar is covered while a game is up.

## Verified

- `verify-practice-chart`, `verify-practice-routines`, `verify-focus-practice`,
  `verify-widget-ball-placement`, `verify-routine-program-share` and `verify-new-features` all
  pass. `verify-focus-practice.mjs` needed `showMusic: false` adding to its desk fixture.
- `npx tsc -b` clean; `npm run build` clean.
- A full pass over the real UI at an emulated iPad viewport: entering with and without a file,
  an unsupported type, a corrupt PDF, replace, remove, hide/show, the widget's ×, the Tuner,
  Metronome and Games tabs, the Camera crossing, the vault and settings sheets, and rotation from a
  landscape spread to portrait. Reading position is exact across every one of them, and no
  transition leaves the HUD or the page in a half state.
- Natively on the iPhone simulator: the part renders under Capacitor's own scheme, tap-to-turn
  works, the page sits below the tabs and above the deck, the balls and deck are in the light Tools
  styling, and a reading position survives a full reinstall.
- Natively on an iPad Air 11": portrait shows one whole page with nothing on the staff; rotating to
  landscape opens a two-page spread; a tap turns it on by two pages; rotating back to portrait
  lands on the same page. That is the whole iPad story end to end.

- Second pass, driven the same way: the takes ball replacing the pill row, rehearsal view hiding
  and restoring the tabs and deck (including the dangerous case — turning the tool off while the
  chrome is away gives the room back), the marker in both colours, tap-to-turn standing down and
  coming back, undo, marks surviving hide/show and a page turn, marks cleared by Replace, marks
  drawn on the **second page of a landscape spread** landing on page 2 in page-local coordinates,
  and Save PDF parsed back with pdf.js: 3 pages, 612×792, original text intact, stroke colour
  exactly the marker's.
- The record control stays hit-testable with a part up, and the page stays visible through a
  record attempt. Whether a take actually lands is a microphone question for a device.

**Geometry in the browser preview is only meaningful with an emulated viewport** — the pane reports
`innerWidth: 0` when collapsed, which reads as "the page rendered nothing".

## Not verified — needs a device

Everything audio, and everything native. In particular:

0. **The pitch graph over a part, on a device.** Fix 9 above is the candidate; it could not be
   reproduced in a browser.
1. A real multi-page PDF on an iPad: render quality, memory under a long part, rotation.
2. **A flattened annotated PDF shared out of forScore** — the actual import path.
3. Native disk persistence across a relaunch (the web build keeps charts in memory for the
   session only, by design).
4. Recording from the page, and playing back a take with the page still up.
5. Half turns with an instrument in hand, which is the only test that matters.
6. Save PDF on device: the share sheet, and the marked copy opening in Files or forScore.

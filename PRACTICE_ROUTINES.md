# Practice routines with stations

## The idea

BestTake is a practice *session*, not a recorder with extras. A player should be
able to lay out a routine — long tones, lip slurs, the excerpt, sight-reading —
and have the app set itself up for each part: the right surface, the right
click, the right drone, the right reference. Then move through it without
hunting for anything.

The word for "one part of a routine, plus the tools it needs" is a **station**.

Almost all of this already exists. `PracticeTimeline` is a routine engine.
`WorkspaceDesk` is a tool preset. The work is joining them and adding a way to
walk the list.

This document is self-contained. **Part 1** is what to build; **Part 2** is
what it looks like, with wireframes, exact tokens and the copy strings. Read
both before starting — several things that look missing already exist.

## What already exists — do not rebuild these

Read this section before writing anything. Several of these were mistaken for
missing in earlier passes.

### Routines

`src/practiceTimeline/types.ts`

- `PracticeTimeline` — `{ id, name, sections, favorite, settings?, createdAt, updatedAt }`
- `TimelineSection` — `{ id, title, bars, bpm, meter, pulseModeId?, feelId?, subdivision, repeatCount, patternSteps?, patternRepeat?, advanced? }`
- `SectionAdvanced` — tempo ramps, tempo markers, swing, click sound, pickup
  measure, per-section count-in, `color`, `markerNotes`
- `PracticeTrackSettings` — count-in bars, count-in timing, whole-track loop

`src/practiceTimeline/storage/timelineStorage.ts` — full CRUD against
`besttake:practice-timelines`, plus an active-routine pointer:
`loadTimelines`, `getTimelineById`, `saveTimeline`, `deleteTimeline`,
`duplicateTimeline`, `toggleTimelineFavorite`, `loadActiveTimelineId`,
`saveActiveTimelineId`, `loadOrCreateActiveTimeline`.

`src/practiceTimeline/storage/routineFile.ts` — `.btroutine` import/export,
`ROUTINE_FILE_VERSION = 1`, strict validation with per-field caps.
`routineShare.ts` and `routineFileOpen.ts` handle sharing and open-from-Messages.

`src/practiceTimeline/hooks/usePracticeTimeline.ts` — `usePracticeTimeline()`
for editing, `useTimelinePlayback()` for running one. Playback already exposes
`goToSection(index)`, `sectionIndex`, `nextSection`, `measure`,
`totalMeasuresInSection`, `countInActive`.

UI already built, under `src/practiceTimeline/components/`:
`PracticeTimelineView`, `TimelineLibrarySheet`, `TimelineSectionCard`,
`TimelineSectionEditor`, `TimelinePracticeSessionView`, `TrackSettingsPanel`,
`MeasureProgressBar`, `SectionTempoDepthPanel`, `MeterPatternEditor`,
`SectionAccentEditor`.

It is reachable today only at `recordingMode === 'audio'` +
`audioPracticeTab === 'practice'`. Nothing else in the app mentions it.

### Tool presets

`src/utils/workspaceDesks.ts`

A `WorkspaceDesk` is already exactly "the tools I want for this kind of
practice". Its own comment says so. `DeskSnapshot` is the same thing without
identity, and is what you want to embed:

```ts
type DeskSnapshot = {
  mode: RecordingMode              // 'video' | 'audio'
  pitchTrackerEnabled: boolean
  showMetronome: boolean
  showDrone: boolean
  showTakeCards: boolean
  autoSoundRecording: boolean
  audioEnhancerEnabled: boolean
  metronome: { bpm, meter, subdivision }
  drone: { pitchClass: number | null, octave: number }
  soundSilenceSeconds: number
}
```

Helpers that already do the work:

- `summarizeDesk(snapshot, transposition)` → one line, e.g.
  `♩76 · Drone B♭ · Pitch · Camera`. **Use this for every station label.**
  Do not write a second summariser.
- `deskMatchesSnapshot(desk, live)` → whether the live setup still equals a
  saved one. Needed for the drift rule below.
- `loadFocusDesk(projectId)` / `saveFocusDesk(projectId, snapshot)` — practice
  items already remember their desk.

In `src/App.tsx`:

- `liveDeskSnapshot` (~2886) — the current setup as a `DeskSnapshot`
- `applyDeskSnapshot(desk)` (~2932) — **the single entry point that puts the app
  into a desk.** Sets settings, metronome engine, drone, and switches
  recording mode. Call this; do not reimplement it.
- `restoreFocusDesk(projectId)` (~2992)
- `handleSaveDesk(name)`, `handleApplyDesk(deskId)`, `handleDeleteDesk(id)`

### Surfaces a station can point at

- `handleRecordingModeChange('video' | 'audio')`
- `setAudioPracticeTab(tab)` where
  `AudioPracticeTab = 'audio' | 'metronome' | 'tuner' | 'practice' | 'games'`
  (`src/types/audioPractice.ts`)
- Games: `PracticeGameId = 'staff-jumper' | 'balance' | 'learn-instrument'`
  (`src/labs/practiceGameInstrument.ts`); routed via `setLabsRoute`
- Focused practice: `onStartFocusedPractice(projectId)` /
  `onResumeFocusedPractice(projectId)` (see `PracticeHub`, wired in App.tsx)
- `saveLastSurface({ mode, tab })` already persists where the user was

### Practice items

`src/db/types.ts` — `Project { id, name, createdAt }` and
`PracticeItemState { projectId, focusArea, comparison, loopStartSeconds,
loopEndSeconds, pendingIntention, lastSessionId, lastOpenedAt }`.

`src/utils/practiceReferences.ts` — per-project YouTube reference selection.

## The model change

One optional field on `TimelineSection`. That is the whole schema change.

```ts
// src/practiceTimeline/types.ts

export type StationKind =
  | 'metronome'   // the click runs this section — today's behaviour
  | 'focus'       // record takes into a practice item
  | 'tuner'
  | 'game'
  | 'freeplay'    // record surface, no focus attached

export interface SectionStation {
  kind: StationKind
  /** kind: 'focus' — the practice item this section records into. */
  projectId?: string
  /** kind: 'game' */
  gameId?: PracticeGameId
  /**
   * Tools to put up when this section becomes active. Embedded, not a
   * reference into the desk library — see "Why the three-desk cap is fine".
   */
  desk?: DeskSnapshot
  /**
   * For stations that are not counted in bars. Null means "stay here until
   * the player taps Next" — see "Open decisions", D2.
   */
  minutes?: number | null
}

export interface TimelineSection {
  // ...everything that is there today, unchanged...
  station?: SectionStation
}
```

`station` is optional and absent means `{ kind: 'metronome' }`. Every routine
that exists today keeps working with no migration, and a routine authored in
the new build still opens in an older one minus its stations.

Work required for the field to be real:

1. `timelineNormalize.ts` — default `station` to undefined, validate `kind`
   against the union, drop `projectId`/`gameId` that do not match the kind.
2. `routineFile.ts` — parse and cap `station` on import; bump
   `ROUTINE_FILE_VERSION` to `2`. Keep reading v1 files. A v2 file opened by a
   v1 build must degrade rather than fail, so keep `station` additive and never
   required.
3. A shared routine can carry a `projectId` that does not exist on this device.
   On import, keep the station but clear the dangling `projectId`, and surface
   the section as needing a focus picked. Do **not** silently create a project.

### Why the three-desk cap is fine

`MAX_WORKSPACE_DESKS = 3`, with the comment "never a gallery". That cap is
about the **Workspace tray chips** — the quick-apply row you reach for
mid-playing. A station's desk is *embedded in the section*, not added to that
library. A twelve-step routine has twelve embedded desks and still exactly
three tray chips. Leave `MAX_WORKSPACE_DESKS` alone.

The section editor should still offer the saved desks as a starting point
("Start from: Warm-up / Excerpt / Sight-read"), because copying a desk the
player already trusts is faster than rebuilding it.

## Navigation

This is the part that does not exist yet, and it is the point of the feature.

### The router

One function, in `App.tsx`, next to `applyDeskSnapshot`:

```ts
const navigateToStation = useCallback(
  async (section: TimelineSection, opts?: { applyDesk?: boolean }) => { ... },
  [...],
)
```

Order matters:

1. Resolve the station (`section.station ?? { kind: 'metronome' }`).
2. Apply the desk **first**, if there is one and the drift rule allows it.
   `applyDeskSnapshot` may change `recordingMode`, so routing after it avoids a
   double surface switch.
3. Route by kind:
   - `metronome` → audio mode, tab `practice` (the timeline view itself)
   - `focus` → `onResumeFocusedPractice(projectId)`; the desk from the station
     wins over `restoreFocusDesk`, since the routine is the more specific intent
   - `tuner` → audio mode, tab `tuner`
   - `game` → `setLabsRoute` into `gameId`
   - `freeplay` → the record surface for the desk's `mode`
4. Persist position so a cold start resumes mid-routine (see D3).

### The drift rule

Re-applying a desk on every step entry will fight a player who just nudged the
tempo. Rule:

> Apply the station's desk when entering a step. While inside a step, never
> re-apply. If the player changes the setup, keep their change — and offer to
> write it back to the section, the way `handleSaveDesk` writes back to a desk.

Use `deskMatchesSnapshot(station.desk, liveDeskSnapshot)` to decide whether to
show "Update this step's tools".

### The routine bar

A persistent, compact bar that stays visible **inside** a station, so the
routine is navigable without going back to a menu. This is what makes it feel
like a session rather than a list of shortcuts.

- Sits with the existing floating chrome, above the tab bar.
- Must use the `.focused-post-take-dock` glass recipe — the same material fix
  Concept 01 applies to the focus strip. Do not invent a new surface. See
  `src/styles/practice-hub.css` around `.focused-post-take-dock`.
- Contents: `3 / 5`, the section title, `summarizeDesk()` of the active tools,
  and prev / next. Gold marks the live step, blue marks a done step, matching
  the app's existing amber-is-live convention.
- Collapsible to a single pill; a routine bar that cannot get out of the way
  will be hated on a phone in a practice room.
- It must not appear when no routine is running.

### Home

Two entry points, from the design deck:

- **Home D — the routine board.** The ordered list, current step gold, done
  steps blue, tap any step to jump. `PracticeHub`, home page.
- **Home A — the bench.** The rail of practice items. Independent of routines;
  build it second.

With no routine saved, the board degrades to one row — "Build a routine" —
and home falls back to the bench. Do not show an empty routine skeleton.

## Open decisions — get an answer before building past step 2

**D1. Does a station own a focus, or does a focus own a desk?**
Both `SectionStation.desk` and `loadFocusDesk(projectId)` can set tools for a
`focus` station. Proposed: the station wins while a routine is running,
and `saveFocusDesk` is not written from inside a routine — otherwise running a
routine silently rewrites the practice item's own desk. Confirm.

**D2. How does a non-musical station end?**
`bars` and `bpm` are meaningless for `tuner` and `game`. Options: a `minutes`
field, or "advance only when tapped". Proposed: `minutes` optional, default
null meaning manual advance, and the routine bar shows elapsed rather than
bars for those. Do not fake bar counting.

**D3. What happens when the app is killed mid-routine?**
There is already `saveActiveTimelineId` and `saveLastSurface`. Proposed: add
the section index to the active-routine pointer, and on cold start offer
"Resume routine at step 3" rather than auto-jumping. Auto-jumping into a
camera surface on launch is hostile.

**D4. Games currently destroy a focused sitting.**
`handleOpenPracticeGames` (App.tsx ~3200) calls `endPracticeSession`, clears
`focusedPractice`, and dismisses the hub. A routine that runs
focus → game → focus would end the sitting halfway through and the second
focus step would start a new one, splitting the takes across two sittings in
the journal. This must be fixed before `game` stations ship: entering a game
from a routine has to suspend, not end, the sitting. Treat this as a
prerequisite, not a follow-up.

## Build order

Each step should build and run before the next starts.

1. **Types and storage.** `StationKind`, `SectionStation`, the optional field,
   normalize, `routineFile` v2 with v1 read support. No UI. Extend
   `scripts/verify-focus-practice.mjs` or add a sibling script covering
   station round-trips, dangling `projectId` on import, and v1/v2 files.
2. **`navigateToStation`** in App.tsx, with the drift rule. Prove it by wiring
   it to a temporary debug button before any real UI exists.
3. **D4 fix** — game entry suspends rather than ends a sitting.
4. **Section editor** — station kind picker, focus/game pickers, "capture
   current tools" and "start from a saved desk", using `summarizeDesk` for the
   label. Extends `TimelineSectionEditor`, does not replace it.
5. **Routine bar** — the persistent navigator, on the dock glass recipe.
6. **Home D** — the routine board in `PracticeHub`.
7. **Home A** — the bench.

Steps 1–3 are the feature. Steps 4–7 are how anyone reaches it.

## Constraints

- **Extend, never replace.** Everything here hangs off `PracticeTimeline`,
  `DeskSnapshot` and the existing surfaces. If a step seems to need a new
  storage system, a second desk type, or a full-screen page with its own tab
  bar, stop and re-read this document.
- **Use the app's tokens.** `--audio-blue` (#1598ff), `--audio-gold` (#f7a600),
  the `--practice-menu-*` set. Gold is the live position, blue is the selected
  or completed one. No new blues. rem, not px.
- **Dark mode is not optional.** Any new stylesheet gets a real dark pass;
  compare against `camera-mode-glass.css` and `vault-ui.css` for the expected
  level of coverage.
- **Do not touch** capture, the metronome engine's timing, the SQLite schema,
  or `MAX_WORKSPACE_DESKS`.

## Verification

- `npm run build` — TypeScript and web build.
- Station round-trip script (step 1) — save, reload, export, import, v1 file,
  dangling project id.
- Browser pass with `VITE_FAKE_MEDIA=1 npm run build` and the `dist-static`
  preview on :4173 — the dev shim gives a synthetic camera and an A440 mic, so
  every surface is reachable without hardware. Do not trust animation or
  timing there.
- Simulator: `npm run cap:sync` (needs a UTF-8 locale) then build and launch.
  Verify the asset hash inside the `.app` before measuring anything —
  `cap:sync` can exit 0 having done nothing.
- A routine that crosses surfaces is the real test: metronome → focus → game →
  focus. Check the journal afterwards; all four focus takes must sit in **one**
  sitting.
- Pitch-dependent behaviour needs a real horn. Hand those checks to James.

---

# Part 2 — Designs

Build from this section, not from taste. Every value below is copied from a
token file or a shipped component; where a number is given, use that number.

## The palette and scale you must use

Nothing new gets invented. Source of truth is
`src/styles/audio-mode-tokens.css`.

| Role | Token | Value |
| --- | --- | --- |
| Live position, "now" | `--sm-gold` / `--audio-gold` | `#f7a600` |
| Gold edge | `--sm-gold-border` | `rgba(247,166,0,0.54)` |
| Gold fill | `--sm-gold-soft` | `rgba(247,166,0,0.14)` |
| Selected, done, chosen | `--sm-blue` / `--audio-blue` | `#1598ff` |
| Blue edge | `--sm-blue-border` | `rgba(21,152,255,0.54)` |
| Blue fill | `--sm-blue-soft` | `rgba(21,152,255,0.14)` |
| Glass edge | `--sm-glass-border` | `rgba(255,255,255,0.22)` |
| Glass fill | `--sm-glass-surface` | `rgba(255,255,255,0.08)` |

Hub surfaces (`.practice-menu-card`), light then dark:

| Token | Light | Dark (`html.app-dark-mode`) |
| --- | --- | --- |
| `--practice-menu-group` | `rgba(255,255,255,0.78)` | `rgba(31,45,65,0.94)` |
| `--practice-menu-control` | `rgba(255,255,255,0.72)` | `rgba(38,53,75,0.94)` |
| `--practice-menu-text` | `#171a22` | `#f8fafc` |
| `--practice-menu-secondary` | `#6c7077` | `#bdc7d5` |
| `--practice-menu-divider` | `rgba(23,26,34,0.09)` | `rgba(226,232,240,0.17)` |

**Type scale — four sizes, three weights, that is the entire set.** The comment
in the token file explains why: the app had drifted to 70 font sizes and 189
off-ladder weights, and 650-vs-700 renders as no hierarchy at all. Do not add a
fifth size or a `650`.

```
--sm-text-title:   0.95rem      --sm-weight-body:   400
--sm-text-value:   0.82rem      --sm-weight-medium: 600
--sm-text-label:   0.76rem      --sm-weight-strong: 700
--sm-text-caption: 0.7rem       (floor — nothing smaller)
```

`0.7rem` is a floor, not a suggestion: smaller is unreadable with the phone on
a stand, which is where this app is used.

## State → appearance, once, for everything

Every list of steps, takes or items in this feature uses this table. Do not
invent per-component variants.

| State | Border | Background | Title colour | Marker |
| --- | --- | --- | --- | --- |
| **Live** (current step) | `--sm-gold-border` | `--sm-gold-soft` over group | text | filled gold |
| **Done** | `--sm-blue-border` | `--sm-blue-soft` over group | secondary | blue with `✓` |
| **Upcoming** | `rgba(255,255,255,0.09)` | group | text | outlined, number |
| **Empty / add** | `1px dashed rgba(255,255,255,0.22)` | none | secondary | `+` |
| **Disabled** | as upcoming | group | secondary | `opacity: .45` |

## The one glass recipe

Anything that floats over the camera or the audio stage uses this, verbatim.
It is lifted from `.focused-post-take-dock` in `src/styles/practice-hub.css`.
Do not write a second material.

```css
width: min(92vw, 24rem);
margin-inline: auto;
padding: 0.55rem;
border: 1px solid rgba(255, 255, 255, 0.2);
border-radius: 1.2rem;
color: rgba(255, 255, 255, 0.96);
background:
  linear-gradient(145deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.025)),
  rgba(8, 13, 21, 0.9);
box-shadow:
  0 16px 38px rgba(0, 0, 0, 0.28),
  inset 0 1px 0 rgba(255, 255, 255, 0.1);
backdrop-filter: blur(24px) saturate(1.16);
-webkit-backdrop-filter: blur(24px) saturate(1.16);
```

`width: min(92vw, 24rem)` and `margin-inline: auto` are not optional — they are
what makes a floating element line up with the tab bar. A different width reads
as a misalignment even when nothing else is wrong.

---

## 1. The routine bar

The persistent navigator. Lives with the floating chrome, directly above the
tab bar, and is the only way to move through a routine without opening a menu.

### Collapsed (default once a step is under way)

```
        ┌──────────────────────────────────────────────┐
        │ ▐ 3/5   Mahler 5 — mm. 12–20            ⌃   │
        └──────────────────────────────────────────────┘
        ╭──────────────────────────────────────────────╮
        │  ⌂      ▤        ●        ▥        ⚙        │   ← existing tab bar
        ╰──────────────────────────────────────────────╯
```

- Height `2.6rem`, same `min(92vw, 24rem)` width, radius `1.2rem`.
- `▐` is a 3px gold rule, `border-radius: 2px`, full text height — the same
  "this is live" mark used on the focus dock.
- `3/5` uses `font-variant-numeric: tabular-nums` so it stops twitching.
- Title truncates with ellipsis; it never wraps in the collapsed state.
- Whole bar is the expand target. `⌃` is a lucide `chevron-up`, not a glyph.

### Expanded

```
        ┌──────────────────────────────────────────────┐
        │ ▐ MORNING ROUTINE               3 of 5   ⌄  │
        │   Mahler 5 — mm. 12–20                      │
        │   ♩76 · 4/4 · Drone B♭ · Pitch · Camera      │
        │   ▓▓▓▓▓▓▓▓░░░░░░   bar 7 of 12               │
        │  ┌─────────┬──────────────────┬───────────┐  │
        │  │ ‹ Prev  │     Next ›       │  Routine  │  │
        │  └─────────┴──────────────────┴───────────┘  │
        └──────────────────────────────────────────────┘
```

- Eyebrow `MORNING ROUTINE`: `--sm-text-caption`, weight `600`,
  `letter-spacing: 0.06em`, `text-transform: uppercase`, secondary colour.
- Step counter `3 of 5` sits right, same size, tabular.
- Title: `--sm-text-title`, weight `600`.
- **Tools line is `summarizeDesk(station.desk, transposition)` verbatim.**
  `--sm-text-caption`, secondary. Never hand-assemble this string.
- Progress bar only for bar-counted stations. For `tuner`, `game` and
  `freeplay`, show elapsed time instead — `7:20 elapsed` — or, when
  `minutes` is null, nothing at all. Never fake bars.
- Buttons: `min-height: 2.4rem`, radius `0.62rem`, `--sm-text-caption`,
  weight `600`. `Next` is the primary and takes `--sm-blue-soft` with
  `--sm-blue-border`; the others are `rgba(255,255,255,0.06)`.
- `Routine` opens the board (section 3).
- Collapse state persists for the session. Do not re-expand on every step.

### Rules

- Never rendered when no routine is running.
- Never rendered while `isRecording` or `isStopping` — the focus strip already
  hides then, and two stacked docks during a take is unusable.
- When a `focus` station is active, the routine bar sits **above** the focus
  strip, and both collapse to pills. If that is still too much chrome on a
  small phone, the routine bar wins and the focus strip collapses first.

---

## 2. The station editor

Extends `TimelineSectionEditor`. Do not build a new editor.

```
┌────────────────────────────────────────────┐
│  Section 3                            ✕    │
│                                            │
│  Title                                     │
│  ┌──────────────────────────────────────┐  │
│  │ Mahler 5 — mm. 12–20                 │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  WHAT HAPPENS HERE                         │
│  ┌────────┬────────┬───────┬──────┬─────┐  │
│  │ Click  │ Record │ Tune  │ Game │Free │  │
│  └────────┴────────┴───────┴──────┴─────┘  │
│                                            │
│  Practice item                             │
│  ┌──────────────────────────────────────┐  │
│  │ Mahler 5 — mm. 12–20            ⌄    │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  TOOLS FOR THIS STEP                       │
│  ┌──────────────────────────────────────┐  │
│  │ ♩76 · Drone B♭ · Pitch · Camera      │  │
│  │                                      │  │
│  │  [ Use my current setup ]            │  │
│  │  Start from:  Warm-up   Excerpt      │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ‹ existing bars / meter / tempo controls › │
└────────────────────────────────────────────┘
```

- The five-way picker is a segmented control on the existing
  `.focus-segments` pattern — but rebuilt on tokens, since that class is one
  of the ones carrying hard-coded hex values. Selected segment takes
  `--sm-blue-soft` + `--sm-blue-border`.
- **Only the row relevant to the chosen kind appears.** `Record` shows the
  practice-item select; `Game` shows a three-way game picker; `Click`, `Tune`
  and `Free` show neither.
- The tools box previews `summarizeDesk()` of whatever is attached. Empty state
  reads `No tools set — this step uses whatever is already up.`
- `Use my current setup` captures `liveDeskSnapshot`. This is the primary path
  and should be the visually heavier control.
- `Start from:` lists the saved workspace desks by name (max three, by
  definition). Tapping one copies it into the section — it does **not** create
  a link, so later editing that desk does not silently rewrite the routine.
- Bars/meter/tempo controls stay visible for `Click` and `Record`, and are
  replaced by a single `Minutes (optional)` field for `Tune`, `Game`, `Free`.

### Copy — use these strings exactly

| Element | String |
| --- | --- |
| Section group label | `What happens here` |
| Kind labels | `Click` · `Record` · `Tune` · `Game` · `Free` |
| Tools group label | `Tools for this step` |
| Capture button | `Use my current setup` |
| Desk copy row | `Start from:` |
| Empty tools | `No tools set — this step uses whatever is already up.` |
| Drift prompt | `Update this step's tools?` |
| Minutes field | `Minutes (optional)` |
| Manual advance hint | `Stays here until you tap Next.` |

---

## 3. Home D — the routine board

In `PracticeHub`, home page, above the tools grid.

```
┌──────────────────────────────────────────────┐
│  ▮▮▮  BestTake                           ✕   │
│       Practice                                │
├──────────────────────────────────────────────┤
│                                              │
│  MORNING ROUTINE · 2 OF 5 DONE               │
│  18 minutes left.                            │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ ✓  Long tones                          │  │
│  │    8 bars · 4/4 · 60 BPM               │  │
│  ├────────────────────────────────────────┤  │
│  │ ✓  Lip slurs                           │  │
│  │    16 bars · 4/4 · 72 BPM              │  │
│  ├────────────────────────────────────────┤  │
│  │ ③  Mahler 5 — mm. 12–20      [Start]   │  │  ← gold
│  │    12 bars · 4/4 · 76 BPM · ×3         │  │
│  ├────────────────────────────────────────┤  │
│  │ ④  Haydn I cadenza                     │  │
│  │    free · no click                     │  │
│  ├────────────────────────────────────────┤  │
│  │ ⑤  Sight-reading                       │  │
│  │    10 bars · 3/4 · 88 BPM              │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌──────┬──────┬────────┬────────┐           │
│  │Games │Vault │ Metro  │ Tuner  │           │
│  └──────┴──────┴────────┴────────┘           │
└──────────────────────────────────────────────┘
```

- Heading `18 minutes left.` is computed from remaining sections
  (bars × meter ÷ bpm, plus `minutes` for non-counted stations). If nothing can
  be computed, use the step count instead — never show `NaN` or `0 minutes`.
- Rows: `min-height: 3.4rem`, `gap: 1px` over a divider-coloured grid so the
  list reads as one object, matching `.practice-menu-list`.
- Markers are `1.35rem` circles. Done = blue fill + `✓`; live = gold fill +
  number in `#23180a`; upcoming = outlined, secondary number.
- Sub-line is `--sm-text-caption`, secondary, tabular numerals. Built from real
  section fields: `bars`, `meter`, `bpm`, `repeatCount` as `×N`.
- Only the live row carries a `Start` button. Tapping any other row jumps to it
  via `navigateToStation` and makes it live — tapping a *done* row is allowed
  and does not un-do the steps after it.
- The tools grid below is the existing `.practice-menu-shortcuts`, unchanged.

### Empty state

With no routine saved, the whole block is one row — do not render a skeleton:

```
│  ┌────────────────────────────────────────┐  │
│  │ ＋  Build a routine                  ›  │  │
│  │    Lay out your warm-up once           │  │
│  └────────────────────────────────────────┘  │
```

Use a lucide `plus`, not the character shown here.

---

## 4. Home A — the bench

Independent of routines. Build after the board.

```
│  ON THE BENCH · 4                            │
│  Pick up where you left off.                 │
│                                              │
│  ┌─────────────┬─────────────┬────────────   │
│  │ TODAY·6     │ 2 DAYS·11   │ 9 DAYS·3      │ → scrolls
│  │ Mahler 5    │ Haydn I     │ Long tones    │
│  │ mm. 12–20   │ cadenza     │ low register  │
│  │             │             │               │
│  │ Lighter     │ Slow to 60  │ —             │
│  │ articulation│ and keep    │               │
│  │ off the D   │ air moving  │               │
│  └─────────────┴─────────────┴────────────   │
│         ● ○ ○ ○                              │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │        Continue · 6 takes in           │  │
│  └────────────────────────────────────────┘  │
```

- Cards `flex: 0 0 9.4rem`, radius `0.85rem`, `gap: 0.5rem`,
  `overflow-x: auto`, `scrollbar-width: none`. The fourth card must *peek* at
  the right edge — that peek is the only affordance saying the rail scrolls.
- Live card takes the gold state from the table above; the rest are `upcoming`.
- Eyebrow per card: relative age from `PracticeItemState.lastOpenedAt`
  (`Today`, `2 days`, `9 days`) + take count. Caption size, uppercase.
- Body line is `pendingIntention`, clamped to three lines. Em dash when empty.
- Last card in the rail is the dashed `+ New focus` card.
- Dots below are position only — not tappable, `aria-hidden`.
- Primary button acts on the centred card and names progress, not the item:
  `Continue · 6 takes in`.

---

## 5. What is being replaced

Delete these while you are in there. They are the reason the current home
reads as a different app.

| Where | What | Why |
| --- | --- | --- |
| `.practice-resume-card` in `src/styles/focus-practice.css` | `border-top: 3px solid #287cda` | Reads as a dismissible alert banner. |
| `src/components/PracticeHub.tsx:314` | `＋` (U+FF0B) | Fullwidth character; everything else is lucide. |
| `src/components/PracticeHub.tsx:318` | `↗` | Same. Use lucide `chevron-right`. |
| `src/styles/focus-practice.css` (whole file) | `#2168b8`, `#287cda`, `#3f94f4`, `#93c6ff` and 20 more hard-coded hexes | None are app tokens. The file has 146 px values and 0 rem, and 2 dark-mode rules where comparable sheets have 19–87. |

Any new stylesheet for this feature must carry a real dark pass. Compare
coverage against `camera-mode-glass.css` and `vault-ui.css`, not against
`focus-practice.css`.

## Accessibility floor

- Every tap target `min-height: 44px`. The routine bar's collapsed pill counts
  as one target; its expanded buttons each need their own.
- Live step gets `aria-current="step"`; the board is an `<ol>`.
- The tools line is real text, not an image, and is announced.
- `prefers-reduced-motion`: step transitions become instant. No sliding rail.
- Focus ring: `outline: 2px solid var(--sm-gold); outline-offset: 2px`.

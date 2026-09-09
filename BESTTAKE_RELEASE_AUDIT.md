# BestTake: release design and interaction audit

September 8, 2026. Working assessment, not release approval.

## The release target

BestTake should feel like one carefully designed musical instrument: immediate,
predictable, and quiet until the musician needs more detail. Preserve the useful
recording and practice features. Unify the interface and the way those features
work together before adding more feature scope.

The owner's priorities are a consistent visual identity, less wording, an
up-to-date introduction, and interaction quality that feels native to iPhone.
Local development is authorized as the browser simulation environment.

## What this pass established

Used the existing local development app at a 390 × 844 phone viewport, with its
existing synthetic camera and A440 microphone mode. Inspected Home, routine
creation and execution, references, Take Vault, camera and audio surfaces, tuner,
metronome, Games, Staff Jumper setup, Settings, and routine Help.

Created a four-item trumpet preset in this preview, selected a named test
reference, skipped other references, saved the routine, started it, and paused
the metronome. Completion persisted as 1/4. The synthetic tuner eventually
displayed written B4 at 440 Hz for trumpet, as expected for that input.

All 11 existing verify scripts passed before the small changes in this pass.
These checks include mocked native audio boundaries; they do not prove iPhone
microphone, Bluetooth, interruption, thermal, or long-session behavior.

Another task is actively changing this same checkout. Live reloads occurred
during inspection. Screen observations and source-level findings below are
useful evidence, but intermittent navigation changes must be reproduced on a
stable build before being labeled release defects. This was not a complete
record/save/relaunch/retry test, a native simulator run, or an iPhone release pass.

## Concrete findings

| Priority | Finding and evidence | Required outcome |
|---|---|---|
| Before beta | The routine widget obscured tuner tabs and the Games header at phone width. Its measured rectangle began at y=0 and was about 132 pixels tall. Competing placement rules exist in `src/index.css` and `src/styles/practice-routines.css`. | Give the routine controls a reserved place in the screen layout. No title, Back button, tab, note, or primary action may sit beneath them. Test active and paused states on every destination. |
| Before beta | The strings pitch profile starts at 82 Hz, although selectable instruments include cello, double bass, bass guitar, and piano. Calling the actual pitch-readout helper with that profile converts 41.203 Hz to E2 and 65.406 Hz to C3. | Correct supported instrument ranges and octave handling, then test sounding pitch and written transposition together. Include low notes, upper notes, noisy input, and octave mistakes; avoid merely broadening every detector without checking its behavior. |
| Before beta | Reference search returned “Could not connect” in the local browser. Pasted-link selection worked. The search service has an explicit origin allowlist. The test reference player reported that its live-stream recording was unavailable. | Verify the configured endpoint and allowed development origins separately from the release app. Test a known playable reference, unavailable video, offline state, quota error, and return to recording. A successful paste does not establish working search or playback. |
| Before release | Core surfaces use different visual systems: routine builder uses Avenir and large editorial headings; general UI uses system fonts; camera has glass controls; Vault has stacked management panels; Games uses a bright arcade shell and rounded display lettering. | Use one system for navigation, typography, surfaces, buttons, spacing, and feedback. Games can retain expressive artwork inside that shared structure. |
| Before release | Vault shows Select, Delete, Clear all, folders, and Takes/Library tabs even with zero takes. The empty state offers no direct recording action. | Empty Vault should explain its purpose briefly and offer Record. Show management actions when they become useful; put destructive bulk actions in an appropriate menu. |
| Before release | The four-item suggested routine required repeated Tools and Reference pages before saving. Much of the setup repeats explanations of familiar switches. | Presets should open to an editable summary with a clear Use routine action. Let musicians inspect or customize a specific item without reconfirming every default. Keep a guided path for building from scratch. |
| Before release | Staff Jumper setup repeats key/range information and separate “tap to change” instructions. The Games character row wraps descriptions into narrow, tall columns at phone width. | One objective, one primary Play action, and a compact settings summary. Put character details in the character picker; keep the entry screen focused on choosing a game. |
| Before release | Routine Help still described the metronome Program editor. Audio Help used an old tab label. Settings promises dark mode on all non-camera screens while Games deliberately retains its light arcade shell. | Audit every tutorial against the actual action. Use one vocabulary and accurate expectations. The routine and tab help mismatch was corrected in this pass; the full tour still needs replacement. |
| Before release | No privacy-policy or support entry was found in the inspected Settings UI; the repository's existing App Store checklist leaves these, device testing, and crash-report verification outstanding. | Resolve the release checklist against current distribution requirements and the actual data behavior. Verify live support/privacy destinations, diagnostics, and the final release build. |

## Recommended BestTake design direction

Use the existing blue and gold identity with more restraint. Blue means an
action or selection. Gold highlights a best take or an earned achievement. Red
means recording or a destructive action. Pitch correctness uses a localized
green indication that preserves text contrast; it should not wash out the whole
interface.

Use the system typeface for the application interface, a small consistent type
scale, and tabular numerals for BPM, time, and tuning. Keep expressive lettering
inside game artwork, not in unrelated navigation and settings. Choose a single
spacing scale and a small family of corner radii. Define opaque content surfaces
and translucent navigation surfaces deliberately, instead of giving every panel
its own gradient, border, shadow, and blur.

The existing shared buttons, sheet implementation, safe-area handling, haptics,
and motion presets provide a useful foundation. Consolidate and apply those
components before creating another styling layer. The 6,700-plus-line App
component and competing style rules make cross-feature behavior harder to
reason about; extract navigation and practice-session coordination incrementally
when touching those areas, with behavior checks around each boundary.

## Screen-by-screen target

| Surface | Target |
|---|---|
| Home | Quick Practice and My Routines are the main choices. Current routine progress is obvious. Challenges are secondary. Takes remains visibly reachable. |
| Routines | Saved routines → preset/custom choice → editable summary → practice. One name for an exercise and one clear rule for Play/Pause and Done/Next. Advanced metronome programs remain optional. |
| Recorder | Recording status is unmistakable. Finishing leads to the latest take, with Listen, Keep best, and Try again easy to find. Switching screens never loses a saved take or silently leaves an armed recorder. |
| Tuner and metronome | Stable top navigation; one readable main instrument; tools arranged consistently. Routine controls reserve space. Starting, stopping, changing a setting, and returning from playback have immediate, truthful feedback. |
| References | Search or paste, recognizable result, selected reference, optional passage. Clearly distinguish My Take from Reference. Error recovery stays inside the current task. |
| Takes | Recent and Favorites first. Tap to play; use a consistent action menu for rename/share/delete. Preserve old recordings and make folders a secondary organization option. |
| Games | Shared application header and exits, expressive play area, one-line objective, Play. Show instruction when the player encounters the relevant mechanic. |
| Settings | Concise grouped controls. Detail appears on demand. One instrument selection should propagate predictably; advanced detection settings should not appear to contradict it. |
| First launch | Pick an instrument, choose quick practice or a routine, and make a first take. Explain listening/comparing after a take exists. The full feature tour becomes optional help. |
| Session finish | Time practiced, items completed, favorite takes when available, and Practice Again. No new dashboard to learn. |

## What “native” must mean in implementation

This is currently a React/Capacitor app with native audio/camera integrations.
Adding springs or blur alone cannot establish native quality. The acceptance
standard is the complete interaction:

- Back returns to the expected screen with scroll position and choices intact.
- Tabs have stable placement and remember useful state.
- A sheet has consistent presentation, dismissal, keyboard handling, and focus;
  a partially dragged sheet follows the finger and settles predictably.
- Tapping a control produces immediate feedback and never requires an unexplained
  second tap. Loading is shown only while real work remains.
- The keyboard never hides the edited field or its completion action.
- Recording, playback, and live pitch remain responsive while screens animate.
- Reduced Motion, larger text, VoiceOver, contrast, and touch targets work on
  the supported devices, not just at the default desktop preview size.
- System sharing, file selection, permission requests, and other platform
  surfaces use appropriate native integrations.

Use the browser to iterate quickly on hierarchy, wording, and ordinary flows.
Validate gesture feel, scrolling, keyboard behavior, haptics, frame timing,
background recovery, and audio routes on an iPhone. If a critical interaction
cannot meet the agreed standard in the web layer, move that particular surface
or navigation boundary to native implementation. Do not assume a full rewrite
is required merely because the project was built with older models.

## Implementation order and stop gates

1. **Establish a stable baseline.** Reconcile the active work, preserve saved
   takes, and run the full checks on the exact build being reviewed. Record
   defects separately from ideas; keep feature scope fixed for this release.
2. **Unify the shared structure.** Build the common screen header, navigation,
   routine-control placement, buttons, sheets, and visual tokens. Apply them to
   Home, Record, Tuner, and Metronome first. Gate: no overlap or navigation drift
   at supported phone sizes, with active routines and open sheets.
3. **Simplify the core loop.** Refine routine setup, record/review/retry,
   favorites, references, and the finish screen. Gate: a new musician can start,
   record, listen, retry, and retrieve the saved take without explanation.
4. **Bring the remaining screens into the same system.** Vault, Settings, Games,
   and context-sensitive help. Gate: consistent controls and terminology, no
   obsolete instructions, and no essential action hidden behind a gesture.
5. **Verify native interaction and reliability.** Real-device audio coexistence,
   denied permissions, interruptions, headphones, long sessions, storage failure,
   relaunch, larger text, reduced motion, and accessibility. Gate: all recording
   preservation, blocker, and major usability failures resolved.
6. **Prepare the public release.** Complete crash reporting, support/privacy
   destinations, store materials, TestFlight feedback, and the final release
   checklist. Gate: evidence belongs to the exact submitted build.

## What Astra adds to this work

Astra is documented for complex reasoning, coding, and computer use. For this
project, the practical use is to keep the screen design, application state,
native boundaries, and tests connected while working through complete user
journeys. It can consolidate repeated UI, trace cross-feature failures, shorten
copy without removing useful guidance, implement targeted fixes, and produce
an evidence-based release assessment. A model upgrade does not itself change
the shipped app or establish that it is ready.

Official model reference: [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra).

## Changes made during this audit

- Added reference thumbnails, an unavailable-image fallback, and a clearer
  Use reference action to the shared search/saved-link result component.
- Corrected Practice Routines Help to describe Home and the current builder,
  Play/Pause, and Done/Next. Corrected the Record tab wording in Audio Help.
- Verified those changes in the local UI. The broader design consolidation,
  full onboarding replacement, pitch-range correction, and native release
  validation remain outstanding.

No publishing, App Store submission, commit, or changes to existing saved takes
were performed in this pass. Preview-only routine/reference data is confined to
the local browser origin used for the walkthrough.

# Whole-app appearance review

Run Vite on **127.0.0.1:5195** and open `/scripts/fixtures/app-design/`.
The separate origin keeps sample Library data, routine choices, and metronome preferences away from the live app on 5194. The frame refuses to mount its storage-owning components on any other port.

The guided-take preview is `/scripts/fixtures/app-design/guided-take.html`. It switches between audio and camera and reuses the current recording header, take player/cards, dock, and production reflection component. Tap the small prompt to open the note and next-take focus sheet. Recording creates local sample takes; voice input is disabled in the preview, and no microphone or camera capture occurs.

## What is real

The review imports production `PracticeHub`, `AudioModeHome`, `PipCompareRow`, `ControlDeck`, `RecordingHeader`, `AudioPracticeTopTabs`, `LiveAudioTunerPane`, `AudioPracticeMetronomeView`, `SettingsBranchWheel`, `SettingsDrawer`, `TakeVaultDrawer`, and `LabsMenu`.

The main proposed styling is **`src/styles/open-lens-system.css`**. It is now imported in `src/main.tsx` following approval for the phone build. Activation requires the `lens-system` class and `lens-design-system` id on the HTML element. `data-lens-finish` selects `glass` or `studio`. Both light and dark are covered. The live app now activates the approved Glass finish.

`Original Electric` does not activate the new skin or load `open-lens.css`. It uses the existing app stylesheet stack with `data-refinement="depth-electric"`, the original ControlDeck, and the optional historical four-tab presentation. It is the current component tree wearing the original styles, not a frozen historical application build. Do not replace it with invented violet/blue gradients.

Best Take retains gold; Current Take retains blue, including camera card borders/labels and audio waveforms. Camera cards stay translucent. The existing recording-concepts fixture has matching take identity accents.

## Comparison controls

The left phone always uses Original Electric; the right uses Open Lens or Studio Edge. The screen buttons load the same screen on both sides. The original is the existing stylesheet stack, not a saved historical app binary.

The proposed tool tabs retain the original icon-over-label sliding control, recolored from the new finish. In full-size tools the fourth dock action is Record and returns to the recorder; the metronome omits the app dock entirely and keeps its own transport. Settings retains its original layout and controls, recolored to the new palette. Home retains the original stacked actions, with subtle blue Record and gold Routine tints; all four Home shortcuts share one row. The recording button sits in a fixed center grid cell with a matching drop-target width.

`ControlDeck.toolsActive` and `libraryAboveRecord` are opt-in (default false). The latter places Library above the centered Record button and Settings at the bottom right. The fixture and production App both enable these options after approval.

The Widgets comparison shows the production Pitch, Metronome, Drone, References, Hands-free, and Music widgets in camera or audio contexts. Tap the collapsed bubble to expand, move, and collapse it. Workspace toggles now show actual widgets in the review. References is only mounted after choosing it in Workspace; it can be collapsed or closed. There is no permanent References shortcut. Music opens its real empty picker; importing a document is intentionally simulated here.

## What is simulated

- A generated local WAV supplies waveform/playback data; it is not a musician's recording.
- Camera background and one-second example video are an illustration; no camera or microphone permission is requested.
- Tuner readings are synthetic. They feed the actual readout, graph renderer, history UI and tool panels without starting or modifying pitch detection.
- The metronome and drone are the actual components/engines and can play when the user starts them. Hands-free is a simulated listening state; no recording starts.
- Record/stop demonstrate the clean-camera transition without capturing media.
- Destructive/source callbacks operate on fixture memory or are explicitly inert. Program/game launch and fullscreen take actions show a preview notice.

Pocket Arcade is the approved Games direction for the new preview. Entering Games disables the recording skin and activates the isolated Pocket Arcade skin; the original comparison retains Arcade Pop. Game components and the back button are retained. Games shows neither top tool tabs nor the bottom recording controls. Do not restyle Games or change its gameplay during integration.

Audio playback buttons sit left of the full waveform. Camera Record uses a thin white ring with no outer glow. Tool tabs sit at the top without an extra heading. Settings keeps its existing icon identities in softer individual colors.

Home shortcuts have restrained purple, amber, teal, and blue icon accents. Workspace has two sections: Widgets (including References) and Views (Expand View and Multitrack). There is no separate Advanced button. `workspaceSections` is opt-in on `ControlDeck` and `SettingsBranchWheel`; production defaults remain unchanged. View callbacks show notices in the fixture; the production App uses its existing `handleToggleSplitView` and `handleOpenMultitrack` handlers.

## After design approval

Reuse the exact components and shared CSS. Do not approximate screenshots with another set of styles.

1. Integrate the reviewed shell composition from `main.tsx`; move applicable shell layout rules out of `fixture.css` into the production skin. Keep fixture-only safe-area simulation, camera illustration and sample-data controls out of production.
2. Opt into the shared stylesheet at the App root. Retire conflicting old skin rules on those surfaces instead of layering an additional recreation.
3. `PracticeHub.showHomeRoutineSummary` is opt-in and defaults false. It is now disabled in the review to match the original Home layout; do not enable it when integrating this revision. `AudioPracticeTopTabs.includeRecording` defaults false and is only used for historical comparison here.
4. Preserve real capture, pitch detection, smoothing, sensitivity, transport, widget persistence, and Library callbacks. This task made no changes to those engines.
5. Compare review and production at the same viewport/theme/state, including loaded/empty cards and open menus. Then check iPhone safe areas, Dynamic Type, actual camera, and recording transitions on device. Browser fidelity does not by itself prove native behavior.

## Verification

The fixture has a targeted TypeScript check (the main app tsconfig normally excludes scripts). Browser checks include the paired tool screens in light/dark, original appearance, loaded camera/audio cards, camera record/stop visibility, and the real Workspace/Settings/Routine/Library surfaces. Type checking and these visual checks do not constitute an on-device media regression test. No Xcode build or sync is part of this concept task.

Vault review: `TakeVaultDrawer.simplified` is opt-in. It gives the library more height, collapses folder management, groups media/sort controls, hides Delete all until Select, and gives audio takes an identifiable microphone thumbnail plus explicit Best/Current labels. Existing tabs, search, filters and expandable take actions remain available. The shared skin covers light/dark.

## Phone build integration — September 19

Approved Glass presentation and Pocket Arcade are activated in the live app. The production App opts into simplified Vault, Workspace sections, centered Library/Record controls, bottom Settings, and existing Tools/Record navigation. References is opened from Workspace and its hidden content stays mounted with playback suspended. The shared game stylesheet is now `src/styles/pocket-arcade.css`; the preview imports that same file.

Verified the live Home, Games, tuner, metronome, Workspace and expanded-view return flow at 390px. Existing hands-free replay, playback-route, and live-waveform checks pass. Web build and Capacitor iOS sync completed; local audio plugin registration was reapplied. Phone build and device media checks remain with the user. Sentry source-map upload failed during this build; Vite still completed successfully.

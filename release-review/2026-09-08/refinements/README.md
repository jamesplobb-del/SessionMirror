> Status update: The user approved integration of the selected Electric, Arcade Pop, fullscreen playback, and Signal identity on 2026-09-08. These have now been integrated into the main project. The notes below record the earlier preview phase; see APPROVED-INTEGRATION.md for build validation.

# BestTake design directions — approval only

Open http://127.0.0.1:5190/refinement-review.html while the preview server is running.

Owner feedback: the initial broad redesign was too far away; the subsequent font/color-only pass was too slight. This revision explores a middle ground using the existing app screens.

- **Studio:** blue-and-white surfaces, waveform recording icon, a compact routine card, tools grouped in two columns, and daily goals in a single card.
- **Playful:** paired start tiles, colored icon buttons, soft corners and tactile edges. Small gold details connect Home with the arcade personality.
- **Earlier font cleanup** remains available for comparison. **Current** removes concept styling from the right panel.

Playful now includes Record, Tuner and Metronome as well as Home, Routines and Games. The main-tab concepts share an icon tab bar, rounded panels and tactile controls. Record keeps equal Best/Current areas with gold/blue headers. Tuner preserves live pitch colors and the chart inside a rounded frame. Metronome keeps its tempo, visualization, selectors and transport, with a coordinated card and button treatment.

Use the screen buttons to open a matching screen in both panels. Studio now has distinct Record, Tuner and Metronome treatments: slim borders, flatter controls and restrained blue accents. Font cleanup applies lighter titles/readouts, while Softer finish adds muted accents and shadows. Games retains its arcade font in the typography-only comparison. All directions remain preview-only. Games retains its original three doors, artwork and characters; their menu proportions are adjusted. Final gameplay transition geometry, dark mode, larger text, motion and device behavior are not approved or release-validated by this visual review.

Only the isolated preview copy has changed. No production UI implementation is approved.

The preview runs from `/private/tmp/besttake-refinement-preview-20260908`, created from the verified release baseline.

To restart the existing preview, run `VITE_HTTPS=false VITE_FAKE_MEDIA=1 npm run dev -- --host 127.0.0.1 --port 5190 --strictPort` from that preview directory.

To reconstruct after temporary files are removed, extract `../source-baseline.tar.gz` into a separate directory, install its locked dependencies, copy all CSS files here into `src/styles/`, copy `refinement-review.html` into `public/`, and append `preview-entry.ts` to `src/main.tsx`. Run the command above. Do not copy these preview imports into the production app without owner approval.

## Fresh — iOS-inspired concept

Owner requested the existing colors with a clean, futuristic iOS 26 feel. Fresh retains the baseline brand tokens and Home blue (#075bd3), with lighter typography, white content panels and translucent rounded navigation/control surfaces. Home, Routines, Record, Tuner, Metronome and the Games menu are included. This is a web visual approximation, not native Liquid Glass. Native materials, motion and accessibility require separate device implementation and review.

Reference: https://developer.apple.com/design/human-interface-guidelines/materials

## Fresh family — selected direction

Owner selected Fresh and requested Playful’s Home layout moving forward. Fresh Original, Fresh Air and Fresh Depth now all use two starting tiles, a tool icon row and grouped daily goals. Air is brighter and flatter; Depth adds more translucent controls and softer elevation. All retain the existing blue/gold identity. The owner additionally requested Camera and bottom controls; all three include these in the isolated preview, accessible via the Camera screen button. No production implementation is approved by these concept requests.

## Vibrant Depth alternatives and transparent Camera

Electric adds saturated blue/cyan and gold; Prism adds blue/violet and gold. Both inherit the Depth design and paired Home layout. The preview-wide tuner color switch starts off, retaining live pitch readings but removing the reactive color wash and rendering the plot without color. This affects only the isolated review copy and can be restored with the checkbox.

Owner clarified Camera should remain see-through like the app. All Fresh/Depth concepts now use translucent dark camera boxes and bottom pills, with light text; Electric uses a squarer bar and outlined secondary buttons, while Prism uses a capsule bar with violet highlights. No production UI or tuner setting is changed.

## Electric refinement

Selected Electric now has clean system typography, plain inline Tuner tools, smooth take-card borders and familiar house/cog/camera/layer icons in a consistent rounded, lightly filled outline style. Record has a blue illuminated finish and a contrasting red stop state. Camera glass and Home remain as selected. To reconstruct, additionally copy `ControlDeck.preview.tsx` to `src/components/ControlDeck.tsx` in the separate preview copy only.

## Electric menus and final control pass

Neutral recording surfaces restored; Tools uses a cyan wrench. Games returns to a full-height hall, centered idle character and compact bottom roster. Workspace, Settings and Pitch widget are directly accessible in the comparison navigation. Settings and Workspace use Electric surfaces and typography; the pitch widget shares tuner readout styling. Fixed tuner-wash cleanup by capturing its owning element before unmount clears the ref, plus isolated Record wash from Tuner. TypeScript check passed. These remain preview changes. For reconstruction also copy `useTunerWash.preview.ts` to `src/hooks/useTunerWash.ts` in the isolated preview.

## Electric routine and tuner detail pass

Extended Electric across routine creation/editing controls, shared secondary sheets, Pitch Insights, Drone and Tuning options. The tuner-specific tool is labeled Tuning with sliders artwork in Electric. Pitch widget static grid is omitted in Electric while retaining the trace/readout; grid cache includes the selected style so switching comparisons updates it. RoutineBar's simple controller now has explicit viewport-safe positioning; pitch widget coordinates are clamped on mount and ResizeObserver updates. TypeScript check passed before the final grid-background and panel-title-only adjustments. Browser visual review covers routine instrument/goal controls, empty Insights, Drone, Tuning and the pitch widget; populated Insights and device-specific layouts still need release testing.

Reconstruction additions: copy LivePitchTuner.preview.tsx and DraggablePitchWidget.preview.tsx to src/components/; TunerTranspositionMenu.preview.tsx to src/components/audioPractice/; useLivePitchTracker.preview.ts to src/hooks/; remove the .preview portion of each destination filename. All changes remain in the separate review copy.

Confirmed the active routine controller is contained above bottom controls in the 390×844 review viewport. Paused the synthetic review routine after checking. Confirmed the Electric pitch widget has no static grid and preserves its live trace.

## Electric icon, camera and Insights polish

Tools bottom icons now use stronger blue/gold and more visible duotone fill. Camera Best Take has translucent gold/cyan reflections. Insights date/instrument controls center their own content; selected date text contrasts with its fill, and content cards have proper padding. A clearly labeled optional sample-data checkbox in Insights supplies seven days of in-memory demo observations without database writes, enabling populated layout review. Copy PitchInsightsScreen.preview.tsx to src/components/audioPractice/PitchInsightsScreen.tsx to reconstruct. TypeScript passed; populated Insights visually inspected.

## Home overflow correction

Home launch tiles no longer flex-shrink under resumed-practice content; disclosure rows have explicit order below the primary actions, tool shortcuts and challenges. Quick Start uses a keyboard instrument glyph in Electric. Vault placement alternatives are proposed separately; the existing bottom grabber already opens takes.

## TakeVault entry and theme

Electric replaces the bottom grabber with a labeled TakeVault glass pill, archive icon and upward chevron; the existing vault handler is retained. Vault header, search, section tabs, empty states, take rows, best-take accents and bulk bar use Electric tokens and surfaces. The routine controller reserves extra clearance. Reconstruct by also copying TakeVaultDrawer.preview.tsx to src/components/TakeVaultDrawer.tsx. The gallery includes direct TakeVault access. Preview only.

## Compact Vault and practice organization concept

Entry reads Vault with a count queried from all saved take database rows (not only the current folder). App passes vaultRevision={takes.length} to ControlDeck to refresh after take changes. Smaller visual pill retains a 44px tap area. Vault now offers Takes, Practice and References; Practice reads the existing saved routine library, expands exercises and opens their linked practice folders. No existing recordings are renamed or migrated. Suggested naming remains an explicitly labeled concept. Delete commands are hidden until Select. Copy the added VaultCount.preview.tsx and VaultPracticeOverview.preview.tsx into src/components without .preview; copy VaultSectionTabs.preview.tsx likewise; add vaultRevision={takes.length} to the ControlDeck invocation in the isolated App.tsx.

Vault capsule slimmed to a 25px visible surface inside a 40px tap target. Removed full-target blur that made the shortcut look taller; camera mode uses translucent blue glass and a cyan edge/count badge.

## Electric motion review

Camera Vault highlight reduced to quiet glass. First motion pass adds a sliding tab highlight, small icon/selection press feedback, brief panel fades, count-change feedback and a shared restrained sheet spring. Sheets drop the extra scale effect in Electric. Shared Pressable and sheet components respect Reduced Motion; CSS motion has matching overrides. No recording/metronome/audio timing or new haptic triggers are changed. Reconstruct by copying AudioPracticeTopTabs.preview.tsx into src/components/audioPractice and AnimatedBottomSheet.preview.tsx / Pressable.preview.tsx into src/components/ui (remove .preview). Native haptic feel and frame pacing require device review.

Vault placement alternative: compact entry now sits centered immediately above the bottom control bar, aligned over Record. Existing behavior/count and neutral camera treatment retained. Preview placement for owner review.

# BestTake iPad companion concept

Open `/scripts/fixtures/companion/index.html` on the Vite development server. This isolated review fixture imports the production LivePitchTuner, DraggableMetronomeWidget, DraggableDroneWidget, MetronomeProvider, and app styles. It does not change the production app entry point.

The companion shell, floating/split arrangement, and illustrative score reader are concept UI. The score engraving is placeholder notation, not an accurate transcription or a captured forScore screen. No forScore integration or native multitasking has been implemented.

The sample-tone button sends a generated 440 Hz stream through the actual tuner. It does not access the microphone or connect the tone to speakers. Recording is an explicitly labeled timer/take-count demo and saves no audio. Metronome and drone retain the existing browser implementation and its native-feature limitations.

The fixture expands the existing widgets and docks their presentation within its own window using scoped preview styles. Widget drag/collapse behavior is replaced by whole-window hide/reopen in this concept. Layout switches, score paging, sample tone, and demo recording are interactive.

Verified in the browser: tuner detects A4 at 440 Hz; floating/split toggle; demo recording start/stop. All files are preview-only.

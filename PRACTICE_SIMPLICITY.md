# Compact practice tools and Home

Home prioritizes the current routine (Build / Start / Continue / Complete), then
Quick Start. Your routines opens the existing saved-plan library. Challenges
start folded; their exercises and character collection are inside the disclosure.
The existing tools remain at the bottom. Dedicated Home classes avoid the old
experimental theme rules that made the two actions compete visually.

Metronome, drone, and floating tuner start as labeled pills. Their existing
widgets remain mounted so collapsing does not stop sound, reset position, or
lose playback-muting ownership. One panel expands at a time; its minus control
collapses it and returns keyboard focus to the pill. Close retains its existing
remove/stop behavior. Routine step and main tab changes fold the panels.
Changing between Camera and Audio during a routine preserves the same tools.
The main tuner/metronome screen remains prominent, with supporting tools compact.
Audio take cards reserve space for the pills rather than letting them overlap.

A routine reference query no longer opens a dialog on launch. The Find reference
pill opens the existing YouTube search/link interface, with the exercise query.
A saved reference opens the existing expanded workspace. No alternate recorder,
player, or reference-search engine was introduced.

## iPhone background audio

The steady metronome uses the existing native sample-clock engine. Backgrounding
no longer stops it or deactivates its shared audio session. UIBackgroundModes
includes audio. Native beat events do not cross into WebKit while backgrounded.
Foregrounding reads native playback state without restarting the beat. Explicit
Stop and stale asynchronous replies cannot unexpectedly restart or cancel it.

A phone call/Siri audio interruption stops the native click. Play resumes it
deliberately after the interruption. Force-quitting terminates playback.
Browser tabs retain the previous suspend/resume policy. Routine time accounting
and drone pause when leaving the app. Timed metronome programs still pause:
their section changes currently depend on foreground JavaScript. Extending
program playback to background requires moving that sequencer into native code.

Apple references:
- https://developer.apple.com/documentation/avfaudio/avaudiosession
- https://developer.apple.com/documentation/avfaudio/handling-audio-interruptions

## Verification

- `node scripts/verify-metronome-background.mjs` runs the real shared engine
  against a controlled native boundary: background continuity, unlock without a
  duplicate start, Stop, interruption, delayed Start and stale foreground read.
- Production web build and unsigned generic-iOS compilation (no simulator).
- Local browser: Home at 390×844, saved routine launch, metronome/drone folded
  state and one-at-a-time expansion without changing their playing state.
- Phone listening check still required: start a steady beat, lock for several
  minutes, switch apps, return, Stop, and repeat with an audio interruption.

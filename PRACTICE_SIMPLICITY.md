# Compact practice tools and Home

Home prioritizes the current routine (Build / Start / Continue / Complete), then
Quick Start. Your routines opens the existing saved-plan library. Challenges
start folded; their exercises and character collection are inside the disclosure.
The existing tools remain at the bottom. Dedicated Home classes avoid the old
experimental theme rules that made the two actions compete visually.

Metronome, drone, floating tuner, and hands-free start as separate 56px balls.
They spawn in distinct positions on the right. Tap a ball to expand its existing
panel; minus folds it again. Panels expand independently. Their existing widgets
remain mounted so folding does not stop sound or lose playback-muting ownership.
Balls support touch dragging and arrow keys; user-placed positions are remembered
for the viewport. Reopening unfolds beside the ball, clamped to the screen.
Keyboard focus follows collapse/expand, and folded controls are hidden from both
touch and accessibility. Close retains its existing remove/stop behavior.
New routine steps start folded. Hands-free shows its phase/timer in the ball.
Changing between Camera and Audio during a routine preserves the same tools.
Both recording modes expose a floating tuner through Workspace. The dedicated
Tuner and Metronome tabs keep their full interfaces without a duplicate widget.

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
- Local browser at 390×844: independent ball expansion/folding, tuner access in
  Audio and Camera, position clamping, and retained drone playback state.
- Phone listening check still required: start a steady beat, lock for several
  minutes, switch apps, return, Stop, and repeat with an audio interruption.

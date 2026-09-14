# Drone and widget audit — September 14, 2026

Implemented fixes in the application source and copied the production web bundle into the iOS project. The final iOS Simulator build succeeded; no phone installation, archive or release upload was performed.

## Findings and changes

- Native drone configuration recovery previously restarted AVAudioEngine and configured the audio session on the main queue. Recovery now runs on one serial control queue, coalescing configuration notifications for 150 ms. Starts and stops share that queue and recheck current note intent so delayed work cannot stop a newly selected note or start an abandoned note.
- The native render callback blocked on a shared NSLock, while volume controls changed an audio mixer under that same lock. The callback now uses nonblocking acquisition, keeps rendering its previous targets during contention, and uses a fixed array of 12 render-owned voices instead of mutating a copied dictionary inside every sample. Volume changes are smoothed in the callback, without changing the audio graph under the state lock.
- Stopping now checks requested notes after allowing the fade to finish, so stale rendered gain cannot keep an idle engine alive. Selecting the already-selected note also requests engine recovery.
- A routine could select a drone before its widget first mounted, then the initial settings restore would issue a silent native restore. First mount now respects an existing command.
- Playback resumes the original chord and octave only if no newer tool or routine action superseded the pause. Explicitly stopping an already-paused drone cancels resumption; hiding/exiting the widget also discards its pending resume.
- Identical drone state responses no longer replace the React external-store snapshot and rerender the app unnecessarily. Preferences still persist on native acknowledgement.

These are concrete failure risks found in code, not a confirmed reproduction of the user's specific phone hang. No device hang trace or exact affected routine was supplied during this audit.

## Verification

34 verification scripts passed; individual outputs and results.json are alongside this report. Coverage includes drone transitions/rendering, widget placement, routine lifecycle and programs, metronome background behavior and sounds, tuner stability/microphone ownership/history/native receiver, hands-free monitoring/cycles, audio lifecycle and playback routes, camera gestures, waveform/trim metadata, navigation, guidance, daily challenges, instruments, sharing, and multitrack regression checks. Many existing scripts are unit tests, mocked integration checks or source assertions, not end-to-end phone tests.

The new Swift renderer stress test compiles the production DroneEngine with audio-device graph setup omitted. It calls the actual stereo render callback, holds the control lock deliberately, checks finite bounded output, exercises 1,200 pitch/octave/timbre/volume/chord changes, and verifies the stop fade reaches silence. Final run generated 6.4 seconds of stress audio in approximately 0.23 seconds on this Mac. This is offline rendering; it does not exercise iPhone speakers, Bluetooth or AVAudioSession route switching. An initial sandbox run could not instantiate a macOS audio component; the same offline test passed with audio-component access.

The tuner-history test initially failed because it required immediate eviction despite the implementation's intentional one-second pruning batch. Its assertion now allows that interval while retaining the hard sample-count limit. No tuner retention behavior was changed here.

Production TypeScript/Vite build: passed. Capacitor iOS asset copy: passed. Final native iOS Simulator compile/link: passed, with two existing CocoaPods build-phase warnings. An earlier web build overlapped separate tuner edits in this shared workspace; the completed web build passed after those edits settled. Those tuner changes were not authored as part of this drone fix.

## Remaining device verification

The reported buzz/freeze has not been reproduced on an installed iPhone build. Run the affected routine on the phone with drone, tuner, metronome and hands-free enabled; advance/back through steps; start/stop recording and take playback; collapse/expand/move widgets; leave/pause/end the routine; and repeat across speaker/headphones/Bluetooth and background/foreground transitions. Capture a device hang/crash log if the failure recurs. No simulator was running during this audit, and no simulator was booted or app launched. This audit does not certify every app feature or every device/audio-route combination for release.

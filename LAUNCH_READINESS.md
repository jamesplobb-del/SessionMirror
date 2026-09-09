# Launch readiness

## Agreed scope

Astra owns audio reliability, hands-free behavior, record/review/retry,
reference playback transitions, routine execution, safe removal of Desks and
exercise-specific take history, and instrument behavior. SOL owns the scoped
presentation work. Preserve all saved takes. No simulator testing requested.

## First pass — September 8, 2026

- AudioTunerTab now shares initial startup and recovery through a cancellable
  operation. Leaving the screen prevents a late failed native start from
  opening a fallback WebKit microphone.
- Removed the independent tuner polling and foreground fallback loops. The
  activation effect owns startup/resume; the existing pitch delivery watchdog
  owns stall detection, with the existing bounded automatic retry budget.
- Native tuner recovery requests for the same input coalesce. Releasing the
  final consumer during recovery stops capture once, without restoring the
  route twice.
- Hands-free consumes each native PCM frame only once. Missing or delayed
  frames break sound/silence continuity; they cannot themselves trigger an
  automatic start or stop. Each new automatic take requires a quiet baseline.
- Pending hands-free starts recheck monitoring, foreground, and playback
  suppression before promoting pre-roll into a visible recording.
- Native PCM encoder backlog is no longer reset while queued encoders still
  own slots. Resetting it caused negative counts after disable/re-enable and
  weakened the existing three-frame bound. No FPS or quality changes.

The previous tuner patch was already uncommitted when this pass began. Its
acknowledgement rollback and Quick Tuner changes remain in the working tree.
Do not confuse those earlier changes with new validation from this pass.

## Automated checks

`node scripts/verify-audio-lifecycle.mjs` exercises real recovery, frame gate,
and pitch subscription code with a mocked native boundary: cancelled startup,
overlapping repair calls, repeated audio frames, genuine sustained audio,
100 subscription switches, reference counting, and release during recovery.

`node scripts/verify-practice-refinements.mjs` covers transient rejection and
existing instrument-specific routine defaults. TypeScript and build checks
do not establish physical-device microphone or long-session stability.

Both scripts, TypeScript, the production web build, and native iOS compilation
passed. The final web assets were copied into Xcode after the last hands-free
guard edit. No simulator was run and this pass was not installed on the phone.
Sentry source-map upload failed in the restricted network environment; the
local production bundle built successfully.

## Phone checks

1. Cold open Tuner, play, visit a pitch game, then return to Tuner repeatedly.
2. Start Tuner then immediately leave; microphone activity should settle.
3. Run tuner, metronome, and drone together; record, review, and retry.
4. Arm hands-free, tap the phone, then play a sustained phrase. Finish, wait
   for listening readiness, and repeat. Background and return between takes.
5. If the microphone drops, verify reconnect and note the precise sequence.

Long-session restarts still require device evidence; this pass does not claim
that every restart cause or all audio coexistence issues have been resolved.

## Remaining work, in order

### Follow-up: hands-free and shared playback

- Corrected the earlier 150 ms silence-reset policy: it could prevent a take
  from ending when native delivery was jittery. Fresh quiet observations now
  tolerate up to one second of spacing; longer outages add only one frame's
  duration. Duplicate/stale packets still cannot start a recording or count
  toward silence. Physical-device verification remains necessary.
- Hands-free now shows preparing, ready, recording, replay countdown, saving,
  and actual playback separately. Finish & listen registers replay intent
  before stopping; Next take ends replay through the existing cleanup path.
- Playback preparation, restoration, count-in reassertion, and lifecycle
  cleanup are serialized. A second player waits for native readiness; an old
  restore/end notification cannot clear a newer playback generation. A failed
  native route hold is cleaned up so later attempts can retry.
- Drone initialization, recovery, and teardown responses respect newer user
  commands. Repeated recovery events share one native restart.
- New checks: verify-handsfree-cycle.mjs, verify-playback-route.mjs, and
  verify-drone-transitions.mjs. These use the actual modules with mocked native
  boundaries, not a simulator. Production build and Xcode asset copy passed.
- Removed the saved Desk UI and its App callbacks. Existing saved data remains
  intact; routines still use internal tool snapshots for presets and resume.
- Routine widget now exposes Play/Pause and Done & next (Finish routine on the
  last item), with the title opening the routine. Pause stays on the current
  tool and preserves a visible Play control. Done also works while paused.
- Removed the routine exercise-journal entry and panel. Routine recordings no
  longer receive practice-session tags or the exercise post-take flow. Takes
  still save to the existing recording library/project; old takes are untouched.
  Daily checklist completion and elapsed practice time remain available.
- Simplification validation: routine/session regression checks, hands-free and
  audio transition checks, TypeScript, and production build passed. No simulator
  was run. Physical-device behavior still needs the user’s verification.

### Still outstanding

1. Audio ownership audit across metronome/drone/reference playback, plus
   explicit hands-free arming/cancel behavior beyond the frame gate fixes.
2. Record/review/retry transitions and favorite-take comparison.
3. Reference search/link flow and per-item passage restoration.
4. Device verification of routine Play/Pause, Done/Next, and preset restoration.
5. Instrument/transposition propagation and rhythm-focused defaults.

Keep edits bounded and check the working tree first: Claude may also be
working here. No broad formatting or unrelated camera changes.

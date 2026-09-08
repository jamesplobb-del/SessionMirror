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

1. Audio ownership audit across metronome/drone/reference playback, plus
   explicit hands-free arming/cancel behavior beyond the frame gate fixes.
2. Record/review/retry transitions and favorite-take comparison.
3. Reference search/link flow and per-item passage restoration.
4. Routine Play/Pause and Done/Next semantics, preset application, then safe
   removal of Desks and exercise-history integration without deleting takes.
5. Instrument/transposition propagation and rhythm-focused defaults.

Keep edits bounded and check the working tree first: Claude may also be
working here. No broad formatting or unrelated camera changes.

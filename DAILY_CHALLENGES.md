# Daily challenges

## User flow

Home shows two small daily challenges and a trophy total. Tap the exercise to
open its existing routine tools, or tap the game to open a ready screen with
its exact instrument and target already set. The collection opens from Home
and lets players equip earned characters for both Staff Jumper and Balance.

- Practice: finish the named exercise with at least one minute of active time.
  Pauses do not count. A saved routine supplies the exercise where available.
  Otherwise an instrument-specific template supplies a temporary one-item
  routine. It does not overwrite the user's saved routine. Leaving returns
  Home to that saved routine; the challenge's elapsed time remains resumable.
- Game: the day assigns a Balance daily run or eight correct notes in a
  specific written major scale in Staff Jumper. Game launches supply the
  correct instrument, clef, transposition, and range through the existing game
  engines. Staff Jumper uses free pace with no lives. Balance uses its existing
  daily note targets. Player preferences are not rewritten by the launch.
- Completion is automatic and shows a small reward notice. The player can
  continue practicing. Repeating a challenge never grants duplicate trophies.
- Each category awards once per local calendar day, across instruments.
  Targets stay frozen for that day and instrument. Editing/deleting the source
  routine uses the frozen temporary version rather than changing the target.
- Written-key, instrument, scale-mode, completed-run, and start-day checks
  prevent unrelated play or yesterday's Staff Jumper run from earning today's
  game reward. Synthetic game test input is excluded.

## Rewards and persistence

Otto the trumpet otter is available immediately. Cumulative trophies unlock
Cleo the violin cat at 3, Riff the drummer raccoon at 7, Pip the flute bird at 12,
Reed the saxophone fox at 20, and Luna the conductor owl at 30. Trophies are never spent,
there is no missed-day penalty, and core music tools never require a reward.
Existing Balance character unlocks and the previously selected player remain
available. Balance achievements are still an alternative character unlock path.

Rewards and definitions use separate versioned local stores. Completed-day
awards remain durable; only today's instrument definitions are retained.
Corrupt reward data is not silently overwritten during an award. A failed
write keeps the pending reward in memory and shows Retry saving; this pending
fallback cannot survive force quit while device storage remains unavailable.
Player-selection failures are shown in the collection as well.

This implementation is local-device progress, not an account or cloud reward
service. Clearing app data resets rewards. Device-clock manipulation is not
prevented. Trophies and unlocks have no monetary value.

## Ownership and extension points

- `src/utils/dailyChallenges.ts`: award ledger, thresholds, existing-player
  migration, retry queue, and reward notifications.
- `src/utils/dailyChallengePlan.ts`: frozen target generation, instrument
  templates, temporary routine resolution, and exact completion validation.
- `src/components/DailyChallenges.tsx`: Home card and character collection.
- `src/components/ChallengeRewardNotice.tsx`: completion and failed-save notice.
- App routine commits and existing game result handlers report outcomes.
  The challenge feature owns no microphone, recorder, or audio timer.

Add characters through the shared character catalog plus its trophy threshold;
add game targets through the plan generator and a matching outcome validator.
Do not display a named scale until both the launch and result check support it.

## Validation

`node scripts/verify-daily-challenges.mjs` checks daily caps, rollover, thresholds,
legacy unlocks, corrupt storage, failed writes and retries.
`node scripts/verify-daily-challenge-plan.mjs` covers every instrument, frozen
plans, saved-routine preservation, changed/deleted routine fallback, minimum
practice time, exact game outcomes, midnight boundaries and duplicate rewards.
Existing routine tests cover pause/resume accounting and transition guards.

No simulator is used. Physical-device checks remain: small-screen Home and
collection, microphone permission prompts, both preconfigured games, temporary
practice pause/return/resume, character equipment, relaunch persistence, and
reward feedback during live play.

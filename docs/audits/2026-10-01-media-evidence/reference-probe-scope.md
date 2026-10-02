# Reference probe scope

`reference-probe.mjs` runs with Node 24's TypeScript stripping and imports the production `practicePassages.ts` and `trimTakeMetadata.ts` helpers. The localStorage implementation is an in-memory test double.

The first case proves that the production save/load helper accepts and preserves a 10–40 second range. Its `loopWouldRun` value evaluates the same end-versus-duration predicate found in `useYoutubePracticePassage`; it does **not** mount React or invoke the hook, iframe bridge, YouTube player, or native playback.

The second case proves the production trim-metadata helper returns a new duration without loop-boundary fields. It does **not** invoke the trim UI, update database state, or prove that current users can create a take loop through the shipped UI. Current source review found no setter for `ReviewModeOverlay`'s `loopStartSeconds` / `loopEndSeconds` and no call to its `onLoopRangeChange` prop; treat the take-trim loop concern as a latent or legacy-state risk until a reachable setup path is demonstrated.

# October 6 audit evidence

These diagnostic probes intentionally assert the observed defects; exit 0 means the bug reproduced. They are not passing acceptance tests. They load current production code and replace external platform/audio/React scheduling dependencies with isolated fixtures. No real app storage, microphone, purchases or files are used.

From `/Users/jameslobb/Documents/BestTake`, create the scratch directory and run each probe:

```sh
mkdir -p /private/tmp/besttake-oct6-audit
node docs/audits/evidence-2026-10-06-sol-audit/adversarial-repro.mjs
node docs/audits/evidence-2026-10-06-sol-audit/games-repro.mjs
node docs/audits/evidence-2026-10-06-sol-audit/routine-link-retry-probe.mjs
node docs/audits/evidence-2026-10-06-sol-audit/cross-feature-probes.mjs
```

The cross-feature probe contains a rejected Quick Record candidate, a conditional native pause ordering case and a web-only session-audio limitation. Native ordering and browser/device workflows remain untested. The original Music/Routines probe is also retained; the adversarial version strengthens it with size-based metadata quota and a continuous circle.

`existing-checks/results.json` records the root's ten existing checks. Nine passed; iPad parity failed because its eight-decibel expectation predates the current eighteen-decibel tablet gate. `typecheck.log` is empty because TypeScript exited successfully.

The bug-asserting probes above describe the original `cc66c3e` baseline and may now fail because the defects are fixed. For current acceptance checks, use [the fix evidence index](../evidence-2026-10-06-sol-fixes/README.md).

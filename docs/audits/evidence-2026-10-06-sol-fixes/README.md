# October 6 fix verification evidence

`results.json` records the final root run: 26 distinct checks passed, zero failed. Each check has its corresponding log in this directory. `production-build.log` is the final successful `SENTRY_AUTH_TOKEN='' npm run build`, including TypeScript compilation; source-map upload was disabled for local verification. The build has bundle-size and mixed static/dynamic import warnings.

The new/strengthened acceptance checks run current production code with controlled filesystem, storage, hook scheduling, audio and native event delivery. They do not certify physical devices or live browser behavior. The independent reviewer also ran these checks against isolated old HEAD and verified that five defect-focused harnesses reject the old implementation.

Primary commands from the project root:

```sh
node scripts/verify-practice-chart-native-transaction.mjs
node scripts/verify-practice-chart-ink.mjs
node scripts/verify-routine-score-recovery.mjs
node scripts/verify-balance-completed-resume.mjs
node scripts/verify-routine-open-recovery.mjs
```

See [the fix report](../2026-10-06-sol-workflow-fixes.md) for scope, changes and remaining validation gaps.

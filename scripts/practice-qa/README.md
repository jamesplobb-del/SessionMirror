# BestTake practice-session QA

This tests the current working tree, including uncommitted changes. It does not use the onboarding concept or alter production app behavior. Synthetic media and touch game input are enabled **only by the dedicated QA config**. Telemetry is disabled there. Do not use that config to build or sync an iOS release.

## Rerun

From the repository root:

```sh
node scripts/practice-qa/make-fixtures.mjs
node scripts/practice-qa/make-multitrack-fixture.mjs
node scripts/practice-qa/run.mjs --include-regressions
./node_modules/.bin/vite --config scripts/practice-qa/vite.config.ts
```

Open `http://127.0.0.1:5217/` for the **actual app**. Open `/scripts/practice-qa/media.html` on that origin for the independent media baseline. Follow [session-protocol.md](session-protocol.md) with Codex browser controls for the live portion.

The Node runner executes reviewed utility/source checks and known-defect regressions, collects logs, fingerprints current `src` TypeScript, and produces a fresh control census. It **does not drive the browser or certify UI coverage**. The first live batch is recorded in [first-batch.md](first-batch.md) and `sessions/2026-09-26.json`.

The confirmed-defect regressions return nonzero while their app defects remain. The suggested-routine entry is now fixed and its regression passes; the two browser media/storage defects remain open. A red run is an accurate result, not an instruction to suppress a test. `--inventory-only` regenerates the census without executing checks. Without `--include-regressions`, the runner executes only the existing reviewed checks.

## Separate native QA build

Build the current app normally with synthetic inputs disabled, then run `node scripts/practice-qa/prepare-native.mjs`. This copies the current uncommitted native tree and built `dist` into the ignored `results/native-workspace`, changes only the copy's bundle/app-group identifiers to `com.besttake.app.practiceqa`, and names it BestTake QA. It preserves the normal installed app and its library. The script refuses to overwrite an existing QA workspace.

Build its `ios/App/App.xcworkspace`, scheme `App`, Debug for the connected phone using Xcode. The QA app requires development signing for its separate app and extension identifiers. Do not claim release-signing, widget integration, or microphone/camera access through iPhone Mirroring is verified by this copy. Native tests and their limitations are recorded separately from browser cases.

Reports and generated media are local under `results/<timestamp>/`; `results/latest.json` points to the latest run. Curated inventories are grouped control/state plans, while `control-census.json` lists individual JSX candidates. The census can include wrappers and unreachable controls, and cannot enumerate every dynamically generated option. Every candidate defaults to untested until semantically reviewed and exercised.

## Isolation and usage

- Port 5217 is reserved for this test library. It has a separate browser origin from the normal app and the concept at port 5201. Never clear or seed the user's normal app storage.
- Reuse this test library for persistence tests. For a fresh first-use run, start the QA server on an unused dedicated port (`--port 5218`, etc.). Do not confuse different tabs on the same origin with isolated libraries.
- Only one UI operator at a time unless each worker has an accessible, isolated browser session and origin. This first batch's subagents could inspect source but could not access the parent's browser; the lead ran all live actions serially.
- Check the weekly account limit before dispatch and between batches. The user's minimum is **40% remaining**. Stop dispatching at 50% remaining, wrap up running work at 45%, and preserve the buffer. The usage tool reports `usedPercent`, so remaining is `100 - usedPercent`. This is a monitoring procedure, not a hard account spending cap; other tasks also consume that allowance.
- Use three Sol/High workers for independent source/control coverage and a lead for coordination and live UI. Do not automatically schedule or start another batch.

## Boundaries

Browser recording is currently blocked by a required native file writer. Do not replace it with a mock and claim the real recording workflow passed. Imported multitrack audio uses the actual app's import and persistence paths and can be tested independently. Browser Music PDF persistence also fails on reload; see the first-batch report. Native capture, export, Bluetooth, interruptions, audio routing, and microphone latency need a device pass.

Do not change app behavior as part of discovery. Report confirmed findings with reproduction and evidence first. Keep suggested UX improvements separate from functional failures.

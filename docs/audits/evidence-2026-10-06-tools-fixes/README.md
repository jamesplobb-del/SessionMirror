# Tools fix evidence — October 6, 2026

See [the fix report](../2026-10-06-sol-tools-workflow-fixes.md) and [acceptance-checks.json](acceptance-checks.json). **18 distinct passing checks**, plus a successful local production build. Duplicate independent runs are additional evidence, not additional unique checks.

## New acceptance regressions

| Script | Evidence |
| --- | --- |
| `verify-metronome-start-settings.mjs` | `lead-verify-metronome-start-settings.log`, `critic-verify-metronome-start-settings.log` |
| `verify-pitch-insights-recovery-screen.mjs` | `pitch-medium-recovery-screen-fix.log`, `critic-verify-pitch-insights-recovery-screen.log` |
| `verify-pitch-insights-persistence-recovery.mjs` | `pitch-medium-persistence-recovery-fix.log`, `critic-verify-pitch-insights-persistence-recovery.log` |
| `verify-music-widget-drawer-focus.mjs` | `critic-verify-music-widget-drawer-focus.log`, `root-verify-music-widget-drawer-focus.log` |

The metronome regression runs the production shared engine with mocked native/browser boundaries. The screen regression runs real component callbacks/effects and live coach callbacks using an isolated React hook scheduler and repository port. The persistence regression executes production repository/schema SQL in isolated SQL.js and reloads exported snapshots; persistence failure is injected. The widget regression renders the actual Drawer with React SSR and runs its actual callbacks/effect and focus helper with isolated element/hook ports. Full widget-hook integration and live DOM behavior were not exercised; callers were reviewed in source.

`lead-metronome-start-settings-baseline.log` intentionally records the new regression failing against the pre-fix module. The corresponding `.mjs` is the preserved baseline module. This defect proof is not a failing acceptance check of the fixed source and is not counted among the 18.

## Existing adjacent checks

- Root: navigation-response, settings-reset, tuner-key-controls, tuner-history, meter-logic, tap-tempo, audio-lifecycle, control-center-audio (eight; `root-checks.json` and `root-*.log`).
- Lead: metronome-background, metronome-program-review (two; `lead-*.log`).
- Pitch bot: pitch-insights-screen-lifecycle, pitch-insights-capture, pitch-instrument-profiles (three; `pitch-medium-*-fix.log`).
- Critic: widget-ball-placement (one; `critic-verify-widget-ball-placement.log`).

Lead reviewed the combined fix sources/callers. The critic reran all three logic regressions, existing pitch lifecycle/capture and widget placement, then authored the widget acceptance test. Root independently reviewed all changes, reran the widget test, and made its temporary SSR bundle independent of audit folders and simultaneous processes. CRLF-aware scoped Git whitespace validation passed; the metronome file retains its existing CRLF endings.

`production-build.log` records `SENTRY_AUTH_TOKEN='' npm run build`, exit 0. TypeScript and the production bundle passed; existing Vite chunk/import warnings remain. No debugging files were uploaded for this verification build.

## Limits

No real microphone, native clock/audio output, device bridge timing, native SQLite, durable IndexedDB failure, rendered browser Tab navigation or VoiceOver was tested. Trusted browser automation was unavailable. I2 reconciliation occurs on the next successful pitch repository write; unrelated database persistence does not emit the pitch recovery event.

No commit, archive, phone installation, App Store upload or deployment occurred. Existing user/concurrent work was preserved. Final account meter: **84% remaining**, above the requested 80% floor.

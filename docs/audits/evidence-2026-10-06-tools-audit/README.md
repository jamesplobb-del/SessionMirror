# Pitch, tuner/metronome and widget audit evidence — October 6, 2026

`existing-checks.json` lists 31 distinct existing checks: 30 passed, one failed. `verify-reactive-silk.mjs` fails its old stepped-color expectation; current source intentionally blends around the boundary, introduced by `bd5ca35` on September 14. The script stops at that assertion, so later assertions in it were not executed. No test or app code was modified to hide that failure.

New probes below intentionally assert observed defects. **Exit 0 means the defect reproduced, not that the feature passed.** From the project root:

```sh
node docs/audits/evidence-2026-10-06-tools-audit/pitch-medium-reset-reopen-probe.mjs
node docs/audits/evidence-2026-10-06-tools-audit/lead-metronome-start-settings-race-probe.mjs
node docs/audits/evidence-2026-10-06-tools-audit/pitch-medium-persistence-recovery-probe.mjs
node docs/audits/evidence-2026-10-06-tools-audit/widgets-probe.mjs
```

These load actual production components/modules, with React scheduling, native bridge, persistence or visual boundaries replaced as described in their reports. The persistence probe executes actual SQL.js SQL and export/reload. The widget probe uses actual React SSR for drawer markup; generated bundles and HTML are evidence outputs. Lead/root and fresh Medium review reruns are not additional unique checks.

Native detector and delivery-window checks compile extracted Swift helpers and exercise synthetic samples on this Mac. The drone renderer check compiles production synthesis with audio graph setup omitted. No microphone/device/audio output, Capacitor native SQLite, actual IndexedDB failure, DOM navigation, keyboard or VoiceOver was exercised.

See [the consolidated report](../2026-10-06-sol-tools-workflow-audit.md) for source anchors, reproductions, proposed repairs and limits.

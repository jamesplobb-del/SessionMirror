# Tuner controls, named Insights and video layout verification

Implemented the follow-up controls and reproduced, then repaired, the take-card displacement. GPT-6.1 Sol implemented instrument identity and capture isolation; GPT-6 Luna implemented the layout repair; a separate GPT-6 Luna reviewed the final changes. The coordinating agent operated the actual browser. The bots ran focused production-code regressions, not independent browser sessions.

## Changes

- Sensitivity is a native three-stop slider: Smooth, Balanced and Responsive. The stops retain the existing Voice, Strings and Winds detector profiles exactly; DSP constants are unchanged. Tuner, Settings and Quick Tuner share this control.
- Tuning shows one button per currently supported key: C, D, E♭, F, G, A and B♭. Optional octave adjustment preserves all 14 historical transposition IDs and their pitch math.
- Pitch Insights supports named instrument profiles with a key and optional octave. C trumpet and flute receive separate stable identities despite sharing C. Observation rows snapshot identity, name and full transposition; additive SQLite migration leaves historical rows in explicit Legacy/default history. Selecting a profile selects the capture destination, without relabeling old observations.
- The capture control reads **Pitch Insights**, **On/Off**, and one short instrument/key line. Long explanatory text was removed.
- Take cards restore the user's saved offset, or zero for untouched cards, after geometry settles. They use the current rendered offset only to recover the base position before clamping. Framer's resize remapping no longer becomes accidental placement intent. Hidden/small bounds and active drag/resize gestures are excluded; automatic correction is not persisted.
- Noisy-session cleanup uses the warning's original session, profile and key, so switching instruments cannot erase another instrument's observations from that session. Failed profile-storage writes retain the active profile and surface a retry error.

## Actual browser workflows

The isolated QA origin was `http://127.0.0.1:5218/`, with development Plus preview and synthetic media. The server was restarted to invalidate cached transforms before final verification.

| Workflow | Result |
| --- | --- |
| Sensitivity keyboard input | Home selected Smooth, ArrowRight selected Balanced, End selected Responsive; exact underlying profile IDs retained. |
| Unique key and octave | Seven key buttons; B♭ octave adjustment changed written B4 to B5 without a duplicate key button. Existing IDs remain available. |
| Keyboard dialog | Focus trap reaches range, visible octave select and Close; closed disclosure contents are excluded. |
| Named instruments | Created QA C trumpet, QA flute and QA B♭ trumpet using the actual form. C trumpet and flute displayed different held-note totals despite sharing C. B♭ capture displayed the effective written key. |
| On/Off | Switch visibly changed Off and On with one short caption. On and selected QA flute persisted through reload. |
| Direct key selection | Tapping the current C retained QA flute; changing to D selected Default · D. Returning to QA C trumpet preserved its separate history. |
| Video layout reproduction | Portrait 390×844 → multitrack → landscape 844×390 → camera → portrait displaced untouched cards by opposing ±42.9254 px horizontal shifts and +23.0546 px vertically, causing overlap before the final fix. |
| Video layout after repair | The same sequence passed twice. Best card returned to x=14.3984, y=626.8047; Current returned to x=201, y=626.8047, each 174.6016×112. Both transforms were `none`, with a 12 px gap, matching the initial baseline exactly. |

## Verification and limits

Five focused verifiers passed: `verify-pitch-instrument-profiles.mjs`, `verify-pitch-insights-capture.mjs`, `verify-pitch-insights-screen-lifecycle.mjs`, `verify-tuner-key-controls.mjs`, and `practice-qa/regressions/take-card-layout-bounds.mjs`. These cover real SQLite migration/isolation, same-session scoped deletion, legacy data, profile storage failure/reload, context changes, old capture behavior, transposition round trips, hidden/stable bounds, Framer-remapped defaults and preservation of deliberate saved offsets. The screen lifecycle fixture executes the actual component function/effects using isolated hooks; it is not a DOM renderer.

Browser and compiler checks caught two integration regressions during development: a stale Settings variable and a missing Insights lifecycle ref. Both were repaired before the final browser pass. The independent final Luna review found no material blockers. TypeScript and `SENTRY_AUTH_TOKEN='' npm run build` passed; Vite reported chunk-size and mixed-import warnings. Remote source-map upload was intentionally excluded from this local verification.

Native iPhone/iPad rotation, recording transitions and real acoustic behavior still need device verification. This is evidence for the scoped repaired workflows, not universal bug-free certification. Other chats share the working tree; unrelated changes were preserved. No real-account reset, purchase, deployment or commit was performed. Usage finished at **91% remaining** in the primary window and **100% remaining** in reserve, above the requested 80% floor.

## Final evidence

These screenshots show the fixed version:

![Final tuner settings](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-controls/tuner-settings-fixed.jpg)

![Short Pitch Insights control and separate C profiles](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-controls/pitch-insights-on.jpg)

![Take cards after repeated rotation and multitrack return](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-controls/video-layout-fixed.jpg)

The [before screenshot](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-controls/video-layout-before.jpg) records the reproduced overlap and is intentionally broken evidence.

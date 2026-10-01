# Library selection to routine verification

Subsequent implementation: [Music additions verification](/Users/jameslobb/Documents/SessionMirror/docs/audits/2026-10-01-music-additions-verification.md) now covers dedicated setlists, direct markup, visible routine ordering and library selection. This document remains a record of its earlier scope.

Build 18 included the existing-routine repairs but not the library-selection shortcut. The original planning map also left dedicated setlists, direct markup placement, and more visible lineup reordering as proposed work. This report records the new shortcut only; the other additions remain unimplemented.

## Implemented

Music Library selection now offers **Create routine**. Selected existing scores become a fresh, unsaved lineup in library order with saved score tools/reference/program settings. The current routine is not replaced until the user saves or starts. Cancelling retains the library selection. Empty and busy selections cannot open a draft. More than 12 selected scores produces an explicit error without silently dropping scores. The builder uses the existing save/start and Plus recovery paths. Imported-plan handling clears the selection seed to avoid mixing drafts.

## Evidence

The coordinating agent operated the actual app at isolated QA origin http://127.0.0.1:5218/ using development Plus preview and synthetic media. At 390 × 600, Create routine is a full-width visible button. A one-score draft opened; cancelling preserved QA Trumpet rehearsal and its 3-of-5 progress, and returning to Music retained selection. A second fixture PDF was imported. Selecting both scores opened a two-exercise lineup. Naming it QA Library selection and starting opened score one. Done & next, reload, and Continue resumed score two with 1-of-2 progress preserved.

GPT-6 Luna independently reviewed the changed production code and found no actionable blockers. This was a source review plus focused regressions, not an independent bot browser session.

`verify-routine-start-recovery.mjs` passed including new checks against the actual selection/handoff callbacks for library order, retained filtered selections, stale IDs, empty selection, Plus cancellation/unlock retry, blocked handoff, busy state, and the 12-score limit. Existing start/storage failure recovery tests passed. `verify-routine-music.mjs`, TypeScript, production Vite build, and whitespace checks passed. Local build excluded Sentry upload; Vite retained existing chunk-size/mixed-import warnings. Final import-seed cleanup passed TypeScript and targeted regressions after the production build.

This change is local source, not installed on the phone or included in the archived/uploaded build 18. Native purchase, Files and audio behavior are outside this verification. Unrelated Staff Jumper edits from another chat were preserved. Usage meter was 90% remaining, above the requested 80% floor.

![Create routine in the selected-score toolbar](/Users/jameslobb/Documents/SessionMirror/docs/audits/evidence-2026-10-01-controls/library-create-routine.jpg)

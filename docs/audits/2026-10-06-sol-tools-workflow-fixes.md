# Tools audit fixes — October 6, 2026

Implemented the four findings from [the tools audit](2026-10-06-sol-tools-workflow-audit.md) in the current BestTake project. Sol 6.1 Ultra owned the metronome fix and reviewed the combined changes; Sol Medium owned pitch fixes and independently challenged the fixes. Root implemented the Music dock fix, reviewed the other changes, and ran adjacent checks and the production build. Earlier Music/Routines/Balance fixes and concurrent recording/multitrack work were preserved.

## Resulting behavior

| Finding | Change | Regression evidence |
| --- | --- | --- |
| I1: Reset All / close / reopen can strand Insights loading | A deletion that invalidates a pending history read now starts a guarded replacement read. Scoped deletion retains the complete surviving history. Settled views still apply local filtering. | Actual screen callbacks/effects with deferred reads and Reset All, scoped/session deletion, replacement read failure/retry, and stale close/unmount responses. |
| T1: pending native metronome Start can accept outdated settings | Start captures a settings revision at payload dispatch. A successful current-generation acknowledgement sends the latest timing once if settings changed in the meantime. Stop invalidates the reconciliation. | Actual engine with controlled native boundaries: BPM, meter, subdivision, accents, sound; pre-dispatch edits; delayed acknowledgement after Stop and subsequent Start; failure/retry; synchronous subscriber Stop. Same regression fails against the pre-fix module. |
| W1: closed Music tool dock remains exposed to focus/accessibility | Closed dock contents are inert and aria-hidden; the Show handle stays outside that guard. Closing while focus is in the dock returns to the handle. Collapsing an expanded tool into an already-closed dock also uses the visible handle, including References. Dock/tool state remains mounted. | Actual drawer SSR, controlled callbacks/effects and focus helper; see the widget regression and evidence index for exact coverage. Browser/VoiceOver behavior is not certified by these fixtures. |
| I2: a recovered web save can leave open Insights missing earlier rows | Failed pitch persistence still rejects and sends no success event. The next successful pitch repository write emits its specific mutation followed by a reconciliation event. Insights and live coach reload the complete recovered snapshot. | Real repository/schema with isolated SQL.js exports/reloads and simulated persistence rejection; repeated failures; recovered notes; scoped/session/full deletion recovery without resurrection; normal successful event behavior; actual screen/coach reconciliation callbacks. |

New regressions:

- `scripts/verify-pitch-insights-recovery-screen.mjs`
- `scripts/verify-pitch-insights-persistence-recovery.mjs`
- `scripts/verify-metronome-start-settings.mjs`
- `scripts/verify-music-widget-drawer-focus.mjs`

## Validation and limits

**18 distinct checks passed:** four new acceptance regressions and fourteen existing adjacent checks. Repeated lead/critic/root runs are counted once per script. The local production build passed: TypeScript plus Vite, with Sentry uploads disabled. Existing Vite chunk/import warnings remain. Independent lead and critic review found no material regression in the combined changes. Check results and repeatable logs are collected in [the fix evidence](evidence-2026-10-06-tools-fixes/README.md).

Account usage was 15% used / 85% remaining at the start of this fix pass and 16% used / **84% remaining** at final verification. This is a shared account meter; the 80% remaining floor was preserved.

These are source, SSR, actual component-function/effect, shared-engine, and SQL.js tests with controlled boundaries. Live browser automation remains unavailable because the trusted CUA kernel fails to start. Real Tab/VoiceOver, native metronome audio/bridge timing, native SQLite, durable IndexedDB failures, device interruptions and microphone behavior were not exercised. No phone installation, native archive, App Store upload, commit or deployment was performed for this fix pass.

I2 reconciliation is observed on the next successful **pitch repository** persistence. An unrelated repository saving the shared web database does not emit this pitch-specific recovery event. Manual history reopening still queries the complete current database. This bounded fix covers the audited next-pitch-save/delete recovery.

The earlier audit's `verify-reactive-silk.mjs` failure remains a known stale color expectation against deliberately blended colors; that unrelated test was not changed or counted as passing here.

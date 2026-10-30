# Music half-page turns and zoom — 2026-10-30

Fill Width now uses the same stationary half-turn interaction as One Page: the lower half stays in place while the upper half shows upcoming music, then the next turn advances the lower half. Screen-sized reading bands cover tall and mixed-size PDF pages, including the final partial band. Existing One Page and Two Pages navigation is preserved.

The Page menu provides zoom out, zoom in, and a percentage/reset control in every fit mode, from 50% to 300%. Pinch uses the same zoom state. Turning a page resets zoom to 100% and advances from the saved unzoomed reading position. Returning to 100% restores that position. Zoom anchoring considers the visible clipped portion of each page, including when the menu covers the anchor. Saved half-turn positions survive closing and reopening the score.

## Verification

Browser checks passed at 1194 × 834:

- Fill Width half-turns kept the lower pane fixed at 417px while the upper pane advanced.
- Zooming to 125%, then turning forward, restored 100% and reached the intended next stop. Zooming to 75%, then Previous, also restored 100% and navigated backward correctly.
- With the Page menu obscuring the zoom anchor, the corrected scroll offset was 104.5px; the previous incorrect jump was 1147px.
- Closing and reopening restored the saved half-turn stop at 417px.

Automated checks passed:

- `scripts/verify-practice-chart-zoom.mjs`: 31 scenarios exercising production callbacks, including all fit modes, half-turns, bounds, reset, continuous-scroll positions, panning, saved origins, clipped/obscured anchors, pinch cancellation, rotation, and listener cleanup. These use isolated DOM ports, not native touch input.
- `scripts/verify-practice-chart.mjs`: geometry, unchanged fitted stops, tall/mixed pages, final partial bands, forward/backward traversal, fraction restoration, and zoom out.
- `scripts/verify-music-control-menus.mjs`, `scripts/verify-practice-chart-ink.mjs`, and `scripts/verify-music-reading.mjs`: menu controls, markings, and reader gesture regressions.
- TypeScript, production web build, and iOS Simulator build.
- iPhone Simulator smoke check: a saved score opens with temporary Plus; Page zoom changes 100% to 125%, and Next restores 100%.

Native pinch behavior has not been verified on a physical device. The in-app browser's CDP touch path was unsupported, so callback tests do not substitute for that device check.

## Release status

Build 28 archive and upload are pending. The temporary Plus preview remains restricted to the internal-only TestFlight configuration and expires November 13, 2026 at 11:59:59 PM Eastern (`2026-11-14T04:59:59Z`). This music fix does not resolve or validate the App Store purchase catalog.

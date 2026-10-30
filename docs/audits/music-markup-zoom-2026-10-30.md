# Music markup and zoom limit — 2026-10-30

Build 29 limits reader zoom to 100–300% of the selected page fit. Inward pinch gestures clamp at 100%, and the Zoom out button is disabled there. Build 28's half-page turning and zoom reset behavior is retained.

The markup palette hides on the first valid pen or eraser gesture after pointer capture is acquired. The active tool remains selected and the full first stroke is preserved. Reopening Markup keeps the pen/eraser choice. A compact Done control exits marking while the palette is hidden. Escape works even when the closed palette leaves focus on the document body; it defers to other visible menus and modal dialogs.

The score subtree disables selection, native image callouts, tap highlighting, image dragging, and context menus. Starting a mark clears existing selection only if it touches the score. The exact blue item reported by the user has not been identified or reproduced on a physical device; the implementation treats it as a selection highlight. Keyboard focus styling remains intact.

## Verification

Passed: TypeScript, production web build, markup interaction regressions, all 31 zoom/turn callback scenarios, menu tests, page geometry, ink/PDF export, and reader gesture checks. Internal-preview configuration guards passed.

Browser verification used the actual production components and a two-page PDF. A complete red stroke survived the palette closing; reopening retained red; erasing removed the stroke while hiding the palette; Escape from document focus exited marking. The Page menu disabled Zoom out at 100%. At 390px width the compact toolbar stayed in bounds. Physical iOS selection UI and pinch gestures have not been verified on a connected device.

## Release

Build 29 archive/upload pending. The update remains InternalPreview / internal-only TestFlight with temporary Plus through November 13, 2026 at 11:59:59 PM Eastern. The App Review submission using build 23 and the Apple support draft are unchanged.

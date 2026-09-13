# Interaction responsiveness — September 12, 2026

Request: occasional delayed tab/menu animation and haptics, particularly Tools and Settings. Preserve the approved look. User builds/syncs Xcode themselves.

## Changes in this pass

- iOS haptic feedback now has a one-way WKScriptMessageHandler in PortraitBridgeViewController. It bypasses Capacitor's serial plugin queue, which also runs synchronous audio-routing operations. The handler holds reusable feedback generators, no controller/WebView references, accepts only capacitor://localhost main-frame messages while active, and discards requests older than 250ms. Existing preference gating remains in haptics.ts; older hosts or unavailable handlers fall back to the existing plugin. No extra re-prime bridge traffic after each direct tap.
- Pressable uses CSS :active for its standard pressed appearance, without a JS spring/frame delay. Custom whileTap animations remain supported. Reduced motion disables the standard scale. Primary pointer checks exclude right-click/secondary touches. Keyboard activation still supplies feedback.
- Workspace items, Settings section tabs/switches, metronome menus, and simple segmented controls use that shared touch-down feedback. Camera/Tools retains its rigid tick but sends it on touch-down rather than click.
- Tools tab selection is optimistic and urgent, while the screen update uses an interruptible React transition. No hidden live media panels are retained; this does not alter pitch tracking or tuner memory management.
- Shared bottom-sheet entrance/exit uses a complete transform so Motion can select its browser animation path. Dragging has a separate inner surface, preserving the sheet ref, responsive outer dimensions, backdrop, safe-area padding, and dismiss gesture.
- Drag backdrop opacity is a motion value, removing per-pointer React renders of the sheet. Short drags restore it, down/flick dismissal rules are unchanged. ActionSheet and Review continue using the shared hook's motion value.
- Practice Home entrance and metronome dropdown transforms use the browser-eligible path. SettingsDrawer is memoized to skip unrelated parent updates.

## Evidence

- `npx tsc -b` passed.
- `node scripts/verify-interaction-feedback.mjs` passed: single direct pulse; preference gating; no queued re-prime per direct pulse; old/disposed host and Capacitor fallback; repeated drag updates, distance/velocity dismissal, upward/disabled guards.
- `xcrun swiftc -frontend -parse ios/App/App/PortraitBridgeViewController.swift` passed.
- The new ImmediateHapticsHandler was extracted (with UIKit/WebKit imports) and type-checked against the installed iPhoneOS SDK targeting iOS 15. This is not a full app/native build.
- Chrome checked the real Settings, Workspace, top tabs and metronome components via `/scripts/fixtures/interactions/`. The load check detects an actual active browser transform animation on the sheet, then deliberately blocks JS for 180ms. PASS observed for light and dark Settings sheets; responsive layout and Settings section scrolling inspected. Workspace Take Cards toggled correctly; the metronome Time menu opened.
- Desktop native CUA drag cannot model a held touch here: it delivered one pointermove with buttons=0. The same failed on a plain isolated drag control, so this is not evidence of a sheet regression. Actual phone touch dismissal remains to verify; callback rules pass the executable check.

## Phone check / limitations

No iOS build, Capacitor sync, device install, or live audio-route timing capture was performed. The direct handler needs a native rebuild, not just refreshed web assets. Test Tools tab changes, Workspace toggles, Settings sections, opening after a few seconds idle, and both short/long sheet drags while microphone/metronome work is active. Check haptics-off and VoiceOver/keyboard as appropriate. These changes remove specific delay sources; they do not establish a zero-dropped-frame guarantee on iPhone.

This workspace also received unrelated edits from other work during this pass (App, Practice Home content, widget and metronome behavior). Preserve them. Only the three outer PracticeHub transform lines are owned by this pass there.

## References

Installed Capacitor dispatch implementation: `node_modules/@capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift`, `handleJSCall` serial dispatch queue. Installed Motion eligibility: `node_modules/motion-dom/dist/es/animation/waapi/supports/waapi.mjs` and `utils/accelerated-values.mjs`.

[Motion animation performance](https://motion.dev/docs/performance) explains the full-transform path and device/browser limits. [Apple WKScriptMessage](https://developer.apple.com/documentation/webkit/wkscriptmessage) describes the native message delivery mechanism.

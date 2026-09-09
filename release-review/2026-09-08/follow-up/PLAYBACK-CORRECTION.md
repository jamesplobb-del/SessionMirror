# Playback correction

The user reported dark styling, glitches, and failure to open fullscreen. They clarified that video was visible, including older takes; a decoder failure was not established.

Changes:
- Take-box and Vault playback open directly fullscreen. Focused practice no longer forces a sheet. The extra quick-preview entry step was removed from the main app.
- Playback renders into document.body so recorder stacking, pointer handling and layout do not contain the fullscreen player.
- Fullscreen fills the dynamic viewport. Safe-area spacing remains on controls. The video wrapper no longer scales during entry/exit; its content uses the available flex height.
- Playback controls, menu and comparison/pitch panels use light Electric. Older dark-mode selectors explicitly exclude Electric playback, including their important camera overrides. Video edges keep no gradient or blur overlays.

Browser checks with generated video and the actual playback component:
- Comparison and Vault playback measured 1280 by 720 in a 1280 by 720 viewport, top/left 0, rooted in BODY, no sheet.
- Video reached its end without a media error; switching takes worked.
- With the app-dark-mode class present, controls remained light, header background remained transparent, and the actions menu was pale with dark text.
- Back removed the player completely in the fixture.

TypeScript, playback-routing and trim-metadata regression checks passed. The first simulator build timed out at the tool boundary while compiling dependencies; a later build/run succeeded and the main app launched. The simulator contains no test video takes, so native playback of the user's older files has not been verified. No recordings were modified by this correction.

Final playback correction verification: production build and Capacitor sync passed; 72 built files match iOS assets; final generic-device Debug build succeeded with signing disabled; final simulator build/install/launch succeeded. Xcode reopened. Native playback of the user’s older video remains a phone test; browser sample playback, full viewport sizing, dark-preference override and dismissal were verified.

# Quiet multitrack workspace

Implemented the approved portrait workspace in the production React/Capacitor app.

- Keeps the performance grid and Play all. Layout supports 1–12 base boxes, four movable/resizable extras, ordering, spacing, and rounded content. Draft layout changes can be cancelled without losing takes.
- Click, tuner, backing, sheet music, and the actual practice routine live in Tools or inline workspace controls. Multitrack has no Best Take ranking flow.
- Recording uses the same grid with a dock for Take Vault, recording, and Setup. Setup contains existing click/count-in controls only.
- Editor groups the portrait preview with Preview playback and Timing/Mix tabs. Waveform edge dragging trims each part without shifting retained audio in song time. Arrow keys adjust a selected trim edge by 50 ms, or 500 ms with Shift. Cancel restores timing and mix; Done saves.
- Selection controls no longer resize the preview. Track menus disappear from the editor preview. The finish, extra-box geometry, and portrait format persist through saving/sharing and are sent to native export.

Verification completed:

- Production TypeScript/Vite build and iOS simulator-target Xcode workspace build.
- Existing multitrack editor, upgrade, sharing, native-read, and transport-handoff checks, plus `scripts/verify-multitrack-quiet.mjs`.
- Actual production components at 390×844 and 375×667 in the in-app browser: start/end edge drags, saved trim restoration after reload, cancelled volume/mute edits, layout and extra-box movement, expanded click widget, recording dock, and setup. Light and dark layouts inspected.

Review fixture: `http://127.0.0.1:5197/scripts/fixtures/multitrack-workspace/`. Uses an isolated origin with generated media and no hardware capture. It does not validate physical Bluetooth recording or final exported video playback; those still need an iPhone pass.

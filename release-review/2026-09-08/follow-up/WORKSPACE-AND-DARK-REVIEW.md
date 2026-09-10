# Workspace fixes and dark concept

Implemented in the app: Audio Enhance naming restored; simpler workspace frame and standard lightweight tool icons; workspace opening preserves Vault layout height and avoids tray scaling; take-card drag ignores buttons and portal dialogs, and viewport clamping skips YouTube dialogs and active text inputs.

Validation: TypeScript check, production build, Capacitor iOS sync, and unsigned device build passed. In browser Camera mode, both take cards retained coordinates while opening/typing in YouTube reference. The Tools workspace anchor retained its position and height on menu opening. Intermittent phone flicker and keyboard behavior still require physical-device retesting.

Dark mode remains a review-only concept in the isolated preview, under Dark mode review. Home, Tools, workspace, cards and settings have midnight surfaces and blue/gold accents. This is an initial direction for approval, not a completed app-wide dark migration. CSS is saved alongside this note.

## September 9 approval
User approved the Midnight Electric direction conditional on readable Tuner/Metronome text and removal of the white edge above controls. Corrected tuner note/details/status/direction/tool colors; metronome tempo, beat numbers, selectors and transport labels; replaced white glass borders and inset highlights with subtle dark edges. Verified both screens in the live browser preview. Integrated as src/styles/midnight-electric.css, gated by the existing app-dark-mode class and Electric direction. Light mode remains separate.

# First-use feature guidance

Implemented contextual, two-step guides for Best Take, Workspace, and hands-free recording. Each step has Next/Done and Skip guide. Relevant actions advance the guide; no recording or setting change is required to proceed. Escape dismisses the current guide. Guide history is separate from Welcome and the disabled legacy tour.

Only two automatic guides may start per app mount, with 45 seconds between guides. Pending triggers expire after two minutes. Successful use before a guide appears suppresses that guide. Dismissals persist, with an in-memory fallback if local storage is unavailable. Settings → Help includes Feature tips and Reset feature guides.

Guides hide during recording, saving, playback, active practice sessions, dragging, and competing app surfaces. Placement follows visible targets without scrolling the app or blocking the highlighted control. Offscreen or covered targets do not display guidance. Phone safe areas, dark appearance, reduced motion, 44px buttons, polite announcements, and keyboard dismissal are supported.

Small text-only confirmations cover persisted takes, successful Best Take updates, Workspace changes, hands-free on/off, and routine updates. One result is retained at a time, repeated messages are limited, and expired results are discarded rather than replayed after playback. Confirmations are independent of the Feature tips preference.

## Validation

- Production web build passed (Sentry upload disabled for this local check); existing chunk-size/import warnings remain.
- TypeScript passed after the final queue-expiry change.
- `node scripts/verify-feature-guidance.mjs` passed: progression, skip, learned actions, cooldown, session limit, expiry, preferences, and unavailable storage.
- Browser fixture: Workspace action advances, manual Next, Best Take pin advances, Done, Skip across reload, playback hides guidance, save/pin feedback, light/dark at 375×667 and small-screen fit at 320×568.
- Real app: Workspace guide visible at 375×667, with nonoverlapping target/card bounds; Skip and Settings Help controls verified.
- No iPhone build or Capacitor sync performed. Real microphone recording/save feedback, native camera layering, VoiceOver, and physical-device rotation still need device verification.

Fixture: `scripts/fixtures/feature-guidance/`. At the local dev server, open `/scripts/fixtures/feature-guidance/`.

Existing unrelated work in App, Settings, Workspace, and other files was retained. Native offer-code changes made concurrently were not part of this work.

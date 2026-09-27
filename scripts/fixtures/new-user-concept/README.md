# Premium browser concept

Run `./node_modules/.bin/vite --config scripts/fixtures/new-user-concept/vite.config.ts` and open `/scripts/fixtures/new-user-concept/`.

Automatic reloads are disabled so parallel app builds do not reset the concept. Restart the preview server, then reload the browser after editing it.

The preview uses the app's production styles, Home, recording screen, take playback, dock, tuner presentation, metronome, games menu, routine builder, settings and library. The preview starts at Home with three synthetic audio takes. First launch replays the two-screen introduction with an empty library; Reset samples restores the example recordings. Home, Record, Workspace, and Library share the introduction’s color, surface, and motion treatment. Feature explanations reuse the existing popup markup and stylesheet with concise, preview-only copy. Tips appear once per feature in the current preview session; First launch resets them.

Capture and tuner readings are simulated. The local WAV samples support real playback; no microphone or camera is opened. The metronome can play on request. Workspace opens the real draggable metronome and drone. Pitch and Music add shortcuts to their feature screens; hands-free and enhancement remain simulations. Other workspace actions demonstrate explanatory tips without opening their full feature. The music picker and game launches show preview notices. Sample playback, pinning, renaming, ratings, notes, sorting, and deletion work in memory. Refresh or Reset samples restores the examples. Motion respects reduced-motion preferences. Production components may initialize preferences on the dedicated 5201 origin, separate from normal app previews.

The approved finish, two-screen introduction and shared motion are now integrated into `src`. This fixture consumes those production components and styles; only its sample state and phone frame remain preview-only. Home uses today’s Air layout with the side-by-side Record / Routine cards, including for a new musician.

Targeted type check:

```
./node_modules/.bin/tsc --noEmit --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution bundler --jsx react-jsx --strict --skipLibCheck --noUnusedLocals --noUnusedParameters --allowImportingTsExtensions src/vite-env.d.ts scripts/fixtures/new-user-concept/frame.tsx
```


Motion preview: tool screens use an exclusive handoff: the old readout fades out in 162 ms before the next screen arrives over 684 ms. Rapid taps resolve to the latest destination; exiting controls are inert. Home settles over 720 ms, and the Library/Settings sheets use an 738 ms glide with a subtly receding background. First-use tips wait until the motion has settled. Reduced-motion users get short fades. Workspace's existing motion is unchanged. Control presses respond on contact and release over 432 ms; transport icons settle over 432 ms. These are presentation-only timings: Play, Stop, recording and beat clocks are never queued behind animation.

The preview now imports the shared production motion helpers directly. The old Vite source-transform plugin has been removed. Production media panels mount immediately and animate their arrival, removing the old readout synchronously; the fixture retains its exclusive scene handoff. No production audio work waits for animation.

The tuner wash uses the production renderer and color mix on a dedicated 390×800 full-device backing, including safe areas and the dock. The registered color property stays non-inheriting to avoid invalidating every child each frame. Games retain their existing appearance and bypass the shared interaction overrides.

Validation: production TypeScript and Vite build; interaction-feedback, feature-guidance, tuner ownership and audio-lifecycle checks. Browser checks covered full-device wash bounds, exclusive tuner/metronome scenes, immediate metronome Start/Stop, time-signature selection, tuner settings and Insights. Workspace motion, game artwork and Music artwork remain owned by their existing components.

Motion surfaces and scrims become inert as soon as they start exiting, so the next tap reaches the destination while the old panel finishes its visual departure. Verified by closing Tuning and immediately opening Insights.

The follow-up refinement uses shared production controls: Home instruments, metronome choices, drone notes and linked programs open in the same searchable (where useful) choice sheet. Routine page arrivals use 684 ms motion; form sections and disclosures expand over 504 ms, retaining form values while hidden controls become inert. Routine cards inherit Home's soft blue surfaces. Existing game controls are unchanged.

Follow-up validation: production build and routine/music/preset, interaction-feedback, audio lifecycle and tuner ownership checks. Browser checks covered instrument search and empty results, keyboard selection, focus wrap and restoration, reduced motion, light/dark sheets, routine creation and save/reopen, nested metronome menu selection during playback, sharing-dialog presentation without sending, and rapid exercise-section close/reopen. The full-app test used a separate development origin with synthetic media; production was built with fake media disabled. iOS web assets were copied after the production build; this is not an on-device performance result.

Recording refinement: Record → Stop previews the shared saving indicator and completion checkmark, then the real optional reflection sheet. Notes and the next-take focus work in memory. Only the fixture simulates 1.4 seconds of preparation; production follows stopping, persistence and playback-readiness state directly. Success still comes from the existing saved-take event, and errors take priority on the same surface. Camera resume, hands-free preparation and native take playback use the shared activity indicator.

Recording checks: preview saving/success in light and dark, reduced-motion static activity, reflection note persistence, and immediate Record again; TypeScript/build plus feature guidance, take guidance, live waveform, interaction feedback, audio lifecycle and microphone ownership checks. A separate synthetic full-app browser did not begin capture, so recording-device performance was not validated here. No recording or audio engine was changed.

Motion pace refinement: premium transitions and entrance staggers are 10% shorter, preserving their easing, travel and spring character. Reduced-motion behavior, press-down response, spinner cadence, notification reading time, recording and audio clocks are unchanged.

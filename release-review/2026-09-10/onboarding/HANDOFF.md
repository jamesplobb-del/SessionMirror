# Premium introduction — continuation
User requests a polished, concise, current app tutorial. User has 5% usage remaining: keep this handoff current. User builds/syncs Xcode themselves. Do not modify tuner/crash work (user says fixed), overwrite unrelated changes, or delegate.

Plan: replace OnboardingTutorial with six screens (welcome, instrument, tools, recording/review, workspace, routine). Keep real instrument + routine callbacks. Eliminate automatic legacy 18-step camera tour and its recording-settings overrides. Include light/dark, reduced motion, keyboard focus containment, responsive safe areas, explicit navigation. Preserve existing completion storage so returning users are not forced through a tour; Settings replay remains available.

Status: implementation starting. Remaining: component/styles/content, App callbacks, browser fixture, TypeScript and browser verification, update this file with results.

## Implemented
- Replaced `src/components/OnboardingTutorial.tsx`; new scoped `src/styles/practice-introduction.css`.
- Six short screens, explicit Back/Continue/Skip, instrument picker applies existing settings, preset/custom buttons use existing builder callbacks. Saved preferred instrument initializes picker.
- `src/utils/tutorialContent.ts` has current content; old coach definitions retained but no automatic activation. Completion key unchanged to avoid forcing returning users into intro.
- `src/App.tsx` completion/routine/replay handlers no longer reset recording preferences or enable old camera checklist. All completion paths mark old coach steps seen.
- Body scroll lock, inert background restored on exit, focus containment/restoration, reduced motion, light/dark, safe-area spacing, scrollable body with fixed navigation.
- User requested LESS copy and less AI-looking design during review. Applied: removed slogans, uppercase numbered kickers, fake wave illustration, decorative example routine card; simpler typography and short feature descriptions. Preserve this direction.

## Verification
`npx tsc -b` passed after both initial and simplified versions; scoped git diff check passed. Browser fixture exercised instrument selection (Trumpet B-flat), all six screens, preset/custom callbacks and Skip. Dark phone preview at 375x667 inspected. Fixed discovered overflow with explicit 100dvh shell height. Browser checks exercise the actual component with stub navigation; real App wiring inspected, not a physical-device test. No Xcode build or sync performed.

## Preview
Server port 5194, running from actual workspace (existing 5190 server is a different /tmp checkout—do not use it for these changes).
Light: http://127.0.0.1:5194/scripts/fixtures/onboarding/
Dark: http://127.0.0.1:5194/scripts/fixtures/onboarding/?dark=1
Fixture in `scripts/fixtures/onboarding/`; its end screen reports callback destinations, does not open real builder.

## Remaining / future verification
User can review simplified introduction then build themselves. In real app, Settings → Reset Tutorials replays it. Confirm first launch, preset/custom routine destinations and instrument persistence on phone. Other detailed HELP_TOPICS still contain legacy material outside this short-intro scope; audit separately if requested. No known TypeScript errors. Do not claim physical iOS verification.

## Final approval
User approved implementation with no suggested first session on the final screen. Final screen retains heading, Choose a routine (presets), Build my own routine, and standard navigation/skip. Removed supporting final-screen copy. Already wired into real App; no sync/build to Xcode requested.

## Latest refinement
Removed the duplicate floating logo from welcome, centered the welcome copy vertically and enlarged Get started. Added prominent Quick Play above the two routine buttons; Explore on my own remains. Required onQuickPlay callback is wired in App to mark intro finished, disable old coach, pause routine, and use existing handleOpenQuickPractice. Browser fixture Quick Play callback verified. TypeScript passes. No native sync/build.

Welcome refinement: user likes current layout but requested logo restored with more polish. Added 104px mark aligned above headline with 24px gap and subtle shadow; 80px on short screens. Kept layout/copy/navigation. Browser screenshot inspected and TypeScript passed.

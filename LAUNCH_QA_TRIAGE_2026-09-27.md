# BestTake launch QA triage — September 27, 2026

The complete four-round QA scratchpad is preserved at
`/Users/jameslobb/Documents/BestTake-QA/2026-09-27-round4/` (61,196 files).
The working source started at commit `96623de` with existing routine-builder edits.

## Changes prepared in this workspace

| Finding | Change | Verification |
| --- | --- | --- |
| Denied mic/camera covered the entire app | Recording permission notice appears only on a recording surface and is a compact panel. Home, Settings, metronome, Games, Vault, and other independent screens remain navigable. Purpose string now names tuner and games too. | TypeScript and production build passed. Native denied-permission walkthrough remains required. |
| Staff Jumper Easy opened Plus | Free policy accepts the exact instrument-graded Easy/Medium range, including ranges over 12 semitones, while keeping wider custom ranges gated. | `node scripts/verify-plus-access.mjs` passed. Native/free-account launch check remains required. |
| Reset All Settings wiped the chosen instrument and written pitch | Reset now confirms first, then preserves tuner instrument and transposition; the sound gate returns to that instrument's baseline. | `node scripts/verify-settings-reset.mjs` passed. |
| Daily challenge reopened an empty folder | Temporary challenge folders no longer replace the remembered real folder. Finishing awaits restoration. When no matching routine project exists, the challenge gets a clearly named separate folder rather than silently binding an unrelated instrument's same-named folder. | `node scripts/verify-last-practice-destination.mjs` and `node scripts/verify-daily-challenges.mjs` passed; challenge/relaunch UI walkthrough remains required. |
| Stand tools covered the Workspace tray | Expanded widget placement protects the tray and chart top bar; open panels reposition when those controls change. | `node scripts/verify-widget-ball-placement.mjs` passed, including a three-panel placement case. Music-stand visual check remains required. |
| Privacy/support and Plus review metadata | Draft support page, regenerated privacy page link, Plus disclosure in description and review notes, and two-product submission checklist. Nothing has been deployed or submitted. | Listing length check and plist lint passed. Public URLs must be checked after deployment. |

## Findings needing no app change from this QA evidence

- The Staff Jumper results actually showed **Correct 13**. The QA script used a case-sensitive `Correct\n` match against text emitted as `CORRECT\n`, so its parsed number became `NaN`.
- Imported “Lip slurs” showed **68 BPM** in the QA log. The script searched only for the old `♩68` label.
- One phone metronome capture inferred **50.5 BPM** after closing the tuner; the same log recorded only two intervals (1189 ms and 599 ms), while iPad measured 99.2 BPM. Treat this as unconfirmed until an audible rerun.

## Release checks still needed

- On iPhone and iPad, deny microphone and camera on a fresh install. Confirm Home, Settings, privacy, metronome, Vault playback, and independent Games navigation stay usable, while recording offers a permission path.
- With a free account, start Staff Jumper at its default Easy setup for trumpet and flute. Confirm it starts without the Plus sheet.
- Finish a daily challenge, relaunch, and check that Home and Vault return to the previous real take folder. Check same-named routine/challenge steps do not confuse recordings.
- Open three widgets on phone and the music stand on phone/iPad. Confirm panels and Workspace controls remain tappable.
- Review `netlify-youtube-proxy/privacy.html`, `netlify-youtube-proxy/support.html`, and `APP_STORE_LISTING.md`; deploy both pages and confirm the public URLs, then enter metadata and both Plus products in App Store Connect.
- Verify that the new `BestTakeSupport@gmail.com` inbox receives a test message before publishing the support URL.
- Complete the QA report's native recording, playback, hands-free, drone, multitrack, purchase, restore, and promo-code pass. The web snapshot cannot establish these native behaviors.

No iOS simulator was booted during this pass, so the fresh-install permission walkthrough was not run here. The supplied browser-targeting QA scenarios were not rerun; the checks above are source/unit/build checks.

## Automated checks run

`npm run build`, `node scripts/verify-plus-access.mjs`,
`node scripts/verify-settings-reset.mjs`,
`node scripts/verify-widget-ball-placement.mjs`,
`node scripts/verify-last-practice-destination.mjs`,
`node scripts/verify-daily-challenges.mjs`,
`node scripts/verify-practice-routines.mjs`,
`node scripts/verify-routine-music-share.mjs`,
`node scripts/check-listing-lengths.mjs`, `plutil -lint ios/App/App/Info.plist`,
and `git diff --check` passed.

The repository's existing production-build configuration automatically uploaded this build's source maps to Sentry. No Netlify page or App Store metadata was published.

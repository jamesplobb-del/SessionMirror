# BestTake Plus

Product decision, 27 September 2026. This replaces the free/paid boundary dated 16 September 2026.

**BestTake Plus — $9.99 once, for lifetime access.** The app is free to download. One non-consumable unlock, with Family Sharing available as an optional App Store Connect setting. No subscription and no automatic charge.

New users can explicitly start a seven-day Plus preview from the paywall. On iOS, Apple verifies a $0 non-consumable “7-day Trial”; its original purchase date anchors the seven days. When it ends, users keep the free features unless they choose to buy Plus. No subscription or automatic charge. The purchase price is read from StoreKit in the user’s currency.

StoreKit and Apple offer-code implementation notes live in `PROMO_CODES.md`. The StoreKit bridge, trial, paywalls, and restore flow are implemented. All custom access-code shortcuts have been removed. The current lifetime product is `com.besttake.app.plus.lifetime.v2`; the trial is `com.besttake.app.plus.trial7days`. The user confirmed keeping the saved $9.99 US lifetime price on October 22, 2026. Product review configuration and real sandbox purchase validation remain release prerequisites. Apple-managed offer campaigns are optional after approval.

Build 26 keeps a 15-second deadline across the initial StoreKit product lookup and one retry for each missing product. Restore reloads products after synchronizing Apple transactions. A user-triggered purchase check produces a local, copyable diagnostic report without making a purchase, uploading the report, or changing entitlements. The October 30 build 26 iPhone report returned no products from StoreKit 2, and StoreKit 1 marked both IDs invalid. Earlier reported iPhone availability on build 25 has not been reproduced. Paid Apps, bank, tax, product configuration, explicit App ID capability, and signing were checked; the exact cause remains unconfirmed. Live purchase and restore still require validation.

## Temporary internal testing access

At the owner's request, build 27 has a separate `AppInternalPreview` scheme and `InternalPreview` configuration. Its native-only `BESTTAKE_INTERNAL_PLUS_PREVIEW` flag enables complimentary Plus access through November 13, 2026 (expires November 14 at 04:59:59 UTC). The UI identifies temporary test access. It does not record a purchase, consume the seven-day StoreKit trial, or write a permanent access grant. The existing data-preservation rules also apply when this access ends.

Only the dedicated internal configuration includes this flag. Normal `App` Debug/Release builds keep Apple-verified purchase/trial access. The preview upload must use Apple's `testFlightInternalTestingOnly=true` export option and the existing internal **Me** group. Such an upload cannot be submitted for App Review or assigned to external testers. Preview access is for testing features; it does not prove that App Store purchases or restore work. Keep build 26 and the existing App Review submission separate from this internal preview.

## Always free

- Live tuner (pitch, transpose, needle), metronome, and drone
- Manual audio and video recording
- Playback, Best Take, two-take split/compare, sharing, and export
- All saved takes remain accessible; BestTake imposes no count limit on local takes (device storage still applies)
- Create, run, and share routines without attached music or YouTube references
- Open a routine someone shared with you; its non-music steps remain usable
- Learn and Balance, including their earned characters and full gameplay
- Staff Jumper's free set below

## Free with a cap

- **Multitrack:** up to 2 boxes
- **Routines:** 1 saved routine; shared routines still open
- **Hands-free:** available during the seven-day Plus preview

## Plus (the $9.99 lifetime unlock)

- Unlimited hands-free record → playback → repeat
- Music Library and Music Stand: import and display PDF/photo scores while practicing
- Add scores, backing audio, and YouTube references to practice and routine steps
- Pitch Insights history, tendencies, and progress over time
- Multitrack 3–12 boxes and additional box options
- Unlimited saved routines
- Staff Jumper depth below

Pitch observations continue to be recorded while Plus is inactive so a later purchase can show earlier history.

## Staff Jumper

**Free**

- Easy level with any instrument, key, scale, or range

**Plus**

- Medium and Hard levels

Learn and Balance stay fully free. Do not gate earned characters or add a separate character paywall at launch.

## Music boundary

“Music” here means imported PDF/photo scores, backing audio, YouTube references and play-alongs, and their use in the Music Library, Music Stand, multitrack, or routines. It does not include the user's own recorded takes, take playback, the tuner, metronome, or drone.

A free user can build and run a routine with exercises, timing, and practice tools. Adding or opening a score, backing track, or YouTube reference shows the Plus prompt; the preview begins only after the user explicitly confirms the free trial. A shared routine still opens for free; preserve its music references so they become usable with Plus, while the remaining steps run without them.

## When a preview ends or a cap is reached

Keep every existing take, routine, multitrack project, and imported music file; do not auto-delete anything. Existing files need a way to be retrieved or removed even when Plus is inactive. Complete any take already in progress. Prompt for Plus only when the user next tries a Plus action or exceeds a free cap. Manual recording, take playback/share/export, the live tuner, two-take comparison, and the non-music parts of a shared routine always work.

Existing multitrack projects can still be opened, played, and exported after a preview. Recording new parts with paid media or into a third or later box requires Plus. Shared routines are excluded from the one authored-routine cap; existing routine IDs remain editable after a downgrade. Original scores can be exported or deleted from Music Library → Tools without Plus.

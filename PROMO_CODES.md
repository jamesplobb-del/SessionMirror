# BestTake Plus purchases and Apple offer codes

Current resubmission: version 4.2, build 24, October 30, 2026. StoreKit is the authority for iOS entitlements. The `OfferCodes` Capacitor bridge handles purchase, trial, restore, transaction updates, refunds/revocations, and Apple's official redemption sheet. Dismissing the sheet never grants access. Custom code entry and developer/test unlocks have been removed from every build.

## Products in App Store Connect

| Product ID | Type | Display name | US price |
| --- | --- | --- | --- |
| `com.besttake.app.plus.lifetime.v2` | Non-consumable | BestTake Plus | $9.99 (confirmed October 22, 2026) |
| `com.besttake.app.plus.trial7days` | Non-consumable | 7-day Trial | $0.00 |

The original `com.besttake.app.plus.lifetime` was accidentally created as a consumable (Apple record 6826009047). Leave it unused. The replacement lifetime record is 6826010031. Do not weaken the non-consumable type checks or reuse the original ID.

Supply localization, review screenshot, availability, pricing, and review notes for both valid products, then include them with the corrected app version. Family Sharing is currently off for the replacement product; do not describe it as enabled. Prices in the app come from StoreKit, never a hardcoded purchase amount. Purchase controls stay disabled when Apple has not returned the product.

The trial starts only when the user confirms the free Apple transaction. Its verified original purchase date fixes the seven-day window across reinstalls and restores. It never renews or charges automatically.

## Optional free access for friends

Use an Apple-managed Free Offer for the lifetime product. A redeemed verified lifetime transaction grants permanent Plus access. Customer campaigns can be prepared after the app and product are approved; campaign creation is not a resubmission prerequisite. A Free Offer named BestTake Plus already exists with zero codes as observed October 22; no customer code campaign has been verified.

Customers open the App Store offer-code control in Settings or the Plus screen. Apple's sheet handles redemption and StoreKit verifies the result. The app does not accept or validate custom unlock strings. Old local flags never grant access.

## Verification before submission

Run `node scripts/verify-plus-access.mjs`, `node scripts/verify-handsfree-monitor.mjs`, and `npm run cap:sync`.

On an iOS sandbox device with both products configured, verify:

- Confirm/cancel the $0 trial; only a verified purchase starts access. Restore preserves the original expiry.
- Confirm/cancel the lifetime purchase; pending approval stays locked, then unlocks through transaction updates.
- Restore on another device and check refund/revocation behavior. Test Family Sharing only if it is deliberately enabled.
- Redeem an Apple sandbox offer, dismiss without redeeming, and try an invalid code.
- Legacy custom-code flags must not unlock Plus in any build.
- Expire the trial between takes: complete the current recording and listen-back; block the next hands-free take. Keep manual recording, Learn, Balance, recordings/export, original-score export/delete, and non-music shared routines usable.

Real sandbox purchase, restore, and redemption checks remain unverified. Simulator checks and local JavaScript tests do not establish live StoreKit availability.

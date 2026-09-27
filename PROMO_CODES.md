# BestTake Plus purchases and promo codes

Implemented September 27, 2026. StoreKit is the authority for iOS entitlements. The existing `OfferCodes` Capacitor bridge now handles purchase, trial, restore, transaction updates, refunds/revocations, and redemption. Dismissing Apple's code sheet never grants access.

## Product setup required in App Store Connect

| Product ID | Type | Display name | US price |
| --- | --- | --- | --- |
| `com.besttake.app.plus.lifetime` | Non-consumable | BestTake Plus | $9.99 |
| `com.besttake.app.plus.trial7days` | Non-consumable | 7-day Trial | $0.00 |

Enable Family Sharing for the lifetime product. Supply descriptions, review screenshots, availability, and review notes, then submit the products with the app. Prices in the UI come from StoreKit, never a hardcoded purchase amount. The purchase button stays disabled when Apple has not returned the product.

The trial starts only when the user confirms the free trial transaction. Its verified original purchase date fixes the seven-day window across reinstalls and restores. It never renews or charges automatically. Apple requires a $0 non-consumable for a time-limited trial in a non-subscription app: [App Review Guidelines, 3.1.1](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase).

## Testers: `alpha`

In a Debug build, a verified TestFlight/sandbox installation, or a Vite development preview:

1. Open Settings → Help → Promo codes (also available on the Plus screen).
2. Enter `alpha` in **Test code** and tap **Unlock**.
3. Plus stays unlocked on that installation. Whitespace and capitalization are ignored.

The native shortcut is gated by `#if DEBUG` or Apple's verified `AppTransaction` sandbox environment. A public release ignores the locally saved alpha flag. Browser production builds ignore development entitlement storage. Test and production trial caches are separate. Test alpha is intentionally uncapped; it is not the public offer-code campaign.

## Public release: capped `ALPHA`

Create a **free offer** for the lifetime product, then a **custom code** named `ALPHA`, in App Store Connect. Set the desired redemption quantity and optional expiry there. Include new users and users with prior purchases, so customers who already redeemed the $0 trial remain eligible. No public code or redemption count has been created by this implementation.

Customers open Settings → Help → Promo codes → **Redeem App Store code** and enter `ALPHA` in Apple's sheet. StoreKit verifies the redemption and grants the same permanent lifetime entitlement. The app cannot prefill Apple's sheet. Apple enforces the campaign cap across devices and accounts; there is no client-side usage counter.

Custom codes require the app to be Ready for Distribution and the IAP approved. Apple's current limit is up to 25,000 redemptions per custom-code batch. Sandbox redemption uses separately generated sandbox codes. See [Apple's IAP offer-code setup](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/create-offer-codes-for-in-app-purchases).

## Verification before release

Automated checks: `node scripts/verify-plus-access.mjs`, `node scripts/verify-handsfree-monitor.mjs`, and `npm run build`.

On an iOS sandbox device, with both products configured, verify:

- Confirm/cancel the $0 trial; only a verified purchase starts access. Restore preserves the original expiry.
- Confirm/cancel the lifetime purchase; pending approval stays locked, then unlocks through the transaction listener.
- Restore on another device; check Family Sharing and refund/revocation.
- Redeem a sandbox offer, dismiss without redeeming, and try an invalid code.
- In a public Release installation, a saved test alpha flag must not unlock Plus; redeem the configured public ALPHA through Apple instead.
- Expire the trial between takes: complete the current recording and listen-back; block the next hands-free take. Keep manual recording, Learn, Balance, recordings/export, original-score export/delete, and non-music shared routines usable.

These device/StoreKit checks require Apple's product setup and have not been substituted by the local JavaScript tests.

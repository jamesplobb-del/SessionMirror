# BestTake promo codes

## Implemented September 13, 2026

Settings → Help → Promo codes → Redeem a code opens Apple's native offer-code
sheet on iOS 16.3+. Browser builds explain that redemption requires the iOS app.
Duplicate taps are guarded. Opening or dismissing the sheet never grants access.
Apple handles code entry, eligibility, expiration, and any payment confirmation.

This is the redemption entry point, not a completed purchase/entitlement system.
No live offers have been created. No paywalls or character unlock rules changed.

Validation: TypeScript/production web build and native iOS Simulator compilation
passed. The optional Sentry source-map upload failed because sentry.io could not
be resolved. No app installation, UI interaction, or real redemption was tested.

## Offers to configure

- Full app: non-consumable purchase, regular US price $9.99, no subscription.
- Financial assistance: free offer for the same full-app product. Privately
  distribute unique one-time codes; recipients need no assistance label in-app.
- Beta thank-you: discounted offer for that same product, proposed $4.99 pending
  owner choice. Use individual codes for a closed group, or a custom code with a
  redemption limit and expiry. A TestFlight purchase is a sandbox transaction,
  not a permanent production purchase. The offer is for the released app.
- Optional character pack: separate non-consumable product with a free offer.
  Add one or two new cosmetic characters rather than removing existing earned
  characters. Artwork, character identities, and product pricing remain undecided.
  Cosmetics should not affect game scores or musical difficulty.

## Required before distributing working codes

1. Create the full-app product in App Store Connect and configure offers there.
   Production codes require the app to be Ready for Distribution and the product
   approved. Sandbox codes can be prepared before launch.
2. Implement StoreKit verified entitlements for the exact approved product IDs,
   transaction updates (including redemption outside the app), restoration,
   revocation/refunds, and startup/foreground refresh. Finish transactions only
   after delivering their content. Do not use local booleans or embedded master
   codes as purchase authority.
3. Connect the full entitlement to the free/paid feature boundaries in
   `BESTTAKE_PLUS.md`. Preserve playback/export access to existing recordings.
   Do not lock compare, recording, live tuner, hands-free, or opening a
   shared routine. Caps keep existing items; never cut off a take in progress.
4. If adding the character pack, connect its verified entitlement to character
   selection and both game renderers. Preserve all existing earned unlocks.
5. Verify on a physical device with sandbox accounts: free and discounted
   redemption, cancellation, invalid/expired/already-used codes, interrupted
   redemption, out-of-app redemption, reinstall/restore, and revoked purchases.

Codes are generated in App Store Connect, not in the customer's Settings screen.
Custom marketing names are examples until actually configured with Apple.

## Apple references

- https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/create-offer-codes-for-in-app-purchases
- https://developer.apple.com/documentation/storekit/appstore/presentoffercoderedeemsheet(in:)
- https://developer.apple.com/app-store/review/guidelines/#in-app-purchase

Apple supports free and discounted offers for non-consumable purchases. Its
guidelines restrict custom mechanisms that unlock digital content; use the
StoreKit route for these offers rather than a home-grown license-key bypass.

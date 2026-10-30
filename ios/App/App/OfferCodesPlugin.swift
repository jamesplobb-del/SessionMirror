import Capacitor
import StoreKit
import UIKit

/// Only verified StoreKit transactions grant access in every build and environment.
@objc(OfferCodesPlugin)
public class OfferCodesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OfferCodesPlugin"
    public let jsName = "OfferCodes"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "redeem", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startTrial", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
    ]
    // Create both exact product IDs in App Store Connect before release.
    private let lifetimeID = "com.besttake.app.plus.lifetime.v2"
    private let trialID = "com.besttake.app.plus.trial7days"
    private let trialSeenKey = "besttake.plus.trial-first-seen.v1"
    private let clockKey = "besttake.plus.last-clock.v1"
    private var products: [String: Product] = [:]
    private var loadingProducts = false
    private var presenting = false
    private var updatesTask: Task<Void, Never>?

    public override func load() {
        updatesTask = Task { @MainActor [weak self] in
            for await result in StoreKit.Transaction.updates {
                guard let self else { return }
                guard case .verified(let transaction) = result,
                      [self.lifetimeID, self.trialID].contains(transaction.productID) else { continue }
                await self.rememberTrial(transaction)
                let status = await self.snapshot()
                self.notifyListeners("plusChanged", data: status)
                await transaction.finish()
            }
        }
        Task { @MainActor [weak self] in await self?.loadProducts() }
    }

    deinit { updatesTask?.cancel() }

    @MainActor private func usesSandboxStorage() async -> Bool {
        #if DEBUG
        return true
        #else
        if #available(iOS 16.0, *),
           let result = try? await AppTransaction.shared,
           case .verified(let transaction) = result {
            return transaction.environment == .sandbox
        }
        return false
        #endif
    }

    @MainActor private func rememberTrial(_ transaction: StoreKit.Transaction) async {
        let trialSeenKey = self.trialSeenKey + (await usesSandboxStorage() ? ".test" : ".production")
        guard transaction.productID == trialID else { return }
        let timestamp = transaction.originalPurchaseDate.timeIntervalSince1970
        let previous = UserDefaults.standard.double(forKey: trialSeenKey)
        if previous == 0 || timestamp < previous { UserDefaults.standard.set(timestamp, forKey: trialSeenKey) }
    }

    @MainActor private func snapshot() async -> [String: Any] {
        var purchased = false
        var trialStart: Date?
        for await result in StoreKit.Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  [lifetimeID, trialID].contains(transaction.productID) else { continue }
            await rememberTrial(transaction)
            guard transaction.revocationDate == nil else { continue }
            if transaction.productID == lifetimeID { purchased = true }
            if transaction.productID == trialID { trialStart = transaction.originalPurchaseDate }
        }
        let test = await usesSandboxStorage()
        let trialSeenKey = self.trialSeenKey + (test ? ".test" : ".production")
        let clockKey = self.clockKey + (test ? ".test" : ".production")
        let now = Date().timeIntervalSince1970
        let lastClock = UserDefaults.standard.double(forKey: clockKey)
        UserDefaults.standard.set(max(now, lastClock), forKey: clockKey)
        let storedTrial = UserDefaults.standard.double(forKey: trialSeenKey)
        let start = trialStart?.timeIntervalSince1970 ?? (storedTrial > 0 ? storedTrial : nil)
        // A revoked trial or a clock moved backwards cannot grant access.
        let end = trialStart.map { $0.timeIntervalSince1970 + 7 * 24 * 60 * 60 }
        let expiry: Double? = end.map { lastClock > $0 ? min(now, $0) : $0 }
        return [
            "purchased": purchased,
            "trialStartedAt": start.map { $0 * 1000 } as Any? ?? NSNull(),
            "trialExpiresAt": expiry.map { $0 * 1000 } as Any? ?? NSNull(),
            "price": products[lifetimeID]?.displayPrice as Any? ?? NSNull(),
            "purchaseAvailable": products[lifetimeID]?.type == .nonConsumable,
            "trialAvailable": storedTrial == 0 && trialStart == nil && products[trialID]?.type == .nonConsumable && products[trialID]?.price == 0,
        ]
    }

    @MainActor private func loadProducts() async {
        guard !loadingProducts else { return }
        loadingProducts = true
        defer { loadingProducts = false }
        do {
            for product in try await Product.products(for: [lifetimeID, trialID]) { products[product.id] = product }
        } catch { /* Access remains restorable offline; an unavailable product cannot be purchased. */ }
        notifyListeners("plusChanged", data: await snapshot())
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        Task { @MainActor in
            call.resolve(await snapshot())
            if products.count < 2 { await loadProducts() }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) { buy(lifetimeID, call: call) }
    @objc func startTrial(_ call: CAPPluginCall) { buy(trialID, call: call) }

    private func buy(_ productID: String, call: CAPPluginCall) {
        Task { @MainActor in
            guard !presenting else { call.reject("Please finish the current App Store request."); return }
            presenting = true
            defer { presenting = false }
            if productID == trialID {
                let current = await snapshot()
                if !(current["trialStartedAt"] is NSNull) {
                    call.reject("This seven-day trial has already been used."); return
                }
            }
            do {
                let product: Product
                if let cached = products[productID] { product = cached }
                else if let fetched = try await Product.products(for: [productID]).first {
                    product = fetched; products[productID] = fetched
                } else {
                    call.reject("This purchase is not available from the App Store yet. Please try again later."); return
                }
                guard product.type == .nonConsumable else { call.reject("The App Store product is not configured as a one-time purchase."); return }
                guard productID != trialID || product.price == 0 else { call.reject("The free trial is unavailable. You have not been charged."); return }
                switch try await product.purchase() {
                case .success(let result):
                    guard case .verified(let transaction) = result,
                          transaction.productID == productID,
                          transaction.revocationDate == nil else {
                        call.reject("Apple could not verify this purchase. Try Restore Purchases."); return
                    }
                    await rememberTrial(transaction)
                    let status = await snapshot()
                    notifyListeners("plusChanged", data: status)
                    await transaction.finish()
                    call.resolve(status)
                case .userCancelled:
                    var status = await snapshot(); status["outcome"] = "cancelled"; call.resolve(status)
                case .pending:
                    var status = await snapshot(); status["outcome"] = "pending"; call.resolve(status)
                @unknown default: call.reject("The App Store has not completed this purchase.")
                }
            } catch { call.reject("The App Store could not complete the request. Please try again.") }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard !presenting else { call.reject("Please finish the current App Store request."); return }
            presenting = true
            defer { presenting = false }
            do {
                try await AppStore.sync()
                let status = await snapshot()
                notifyListeners("plusChanged", data: status)
                call.resolve(status)
            } catch { call.reject("Could not restore purchases. Check your App Store account and try again.") }
        }
    }

    @objc func redeem(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard #available(iOS 16.3, *) else { call.reject("Code redemption requires iOS 16.3 or later."); return }
            guard !presenting else { call.reject("A redemption window is already open."); return }
            guard let scene = self.bridge?.viewController?.view.window?.windowScene,
                  scene.activationState == .foregroundActive else { call.reject("Return to BestTake and try again."); return }
            presenting = true
            defer { presenting = false }
            do {
                try await AppStore.presentOfferCodeRedeemSheet(in: scene)
                notifyListeners("plusChanged", data: await snapshot())
                call.resolve()
            } catch { call.reject("Could not open code redemption. Please try again.") }
        }
    }
}

import Capacitor
import StoreKit
import UIKit

/// Purchase and trial access require verified StoreKit transactions.
/// A separately compiled internal build may expose a clearly dated beta preview.
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
        CAPPluginMethod(name: "diagnosePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "copyPurchaseReport", returnType: CAPPluginReturnPromise),
    ]
    // Create both exact product IDs in App Store Connect before release.
    private let lifetimeID = "com.besttake.app.plus.lifetime.v2"
    private let trialID = "com.besttake.app.plus.trial7days"
    private let trialSeenKey = "besttake.plus.trial-first-seen.v1"
    private let clockKey = "besttake.plus.last-clock.v1"
    private var products: [String: Product] = [:]
    private var productLoadTask: Task<Void, Never>?
    private var productError: String?
    private var productAttempts: [PlusProductAttempt] = []
    private var statusRevision = 0
    private var lastVerifiedSnapshot: [String: Any]?
    private var lastPurchaseReport: String?
    private var diagnosing = false
    private var presenting = false
    private var updatesTask: Task<Void, Never>?

    public override func load() {
        updatesTask = Task { @MainActor [weak self] in
            for await result in StoreKit.Transaction.updates {
                guard let self else { return }
                guard case .verified(let transaction) = result,
                      [self.lifetimeID, self.trialID].contains(transaction.productID) else { continue }
                self.statusRevision += 1
                await self.rememberTrial(transaction)
                let status = await self.snapshot()
                self.notifyListeners("plusChanged", data: status)
                await transaction.finish()
            }
        }
        Task { @MainActor [weak self] in await self?.loadProducts() }
    }

    deinit { updatesTask?.cancel() }

    @MainActor private func internalPreviewExpiresAt() -> Double? {
        #if BESTTAKE_INTERNAL_PLUS_PREVIEW
        #if targetEnvironment(simulator)
        let simulator = true
        #else
        let simulator = false
        #endif
        let receiptFilename = Bundle.main.appStoreReceiptURL?.lastPathComponent
        guard simulator || receiptFilename == "sandboxReceipt" else { return nil }
        let key = "besttake.plus.internal-preview.2026-11-14.last-clock"
        let now = Date().timeIntervalSince1970
        let previous = UserDefaults.standard.double(forKey: key)
        guard now.isFinite, previous.isFinite else { return nil }
        // Keep a separate watermark; this never consumes or extends the StoreKit trial.
        UserDefaults.standard.set(max(now, previous), forKey: key)
        return PlusInternalPreviewPolicy.expiry(now: now, lastObserved: previous,
            receiptFilename: receiptFilename, simulator: simulator).map { $0 * 1000 }
        #else
        return nil
        #endif
    }

    @MainActor private func immediateInternalPreviewStatus() -> [String: Any]? {
        guard let expiresAt = internalPreviewExpiresAt() else { return nil }
        // Access to the internal preview must not wait for any StoreKit request.
        // Reuse only previously verified purchase/trial facts, if any are available.
        var status = lastVerifiedSnapshot ?? [
            "purchased": false, "trialStartedAt": NSNull(), "trialExpiresAt": NSNull(),
            "price": NSNull(), "purchaseAvailable": false, "trialAvailable": false,
            "productError": NSNull(),
        ]
        // Do not relabel older verified facts as a newer transaction revision.
        if status["statusRevision"] == nil { status["statusRevision"] = statusRevision }
        status["internalPreviewExpiresAt"] = expiresAt
        return status
    }

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
        let revision = statusRevision
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
        let paymentsAllowed = AppStore.canMakePayments
        let status: [String: Any] = [
            "statusRevision": revision,
            "internalPreviewExpiresAt": internalPreviewExpiresAt() as Any? ?? NSNull(),
            "purchased": purchased,
            "trialStartedAt": start.map { $0 * 1000 } as Any? ?? NSNull(),
            "trialExpiresAt": expiry.map { $0 * 1000 } as Any? ?? NSNull(),
            "price": products[lifetimeID]?.displayPrice as Any? ?? NSNull(),
            "purchaseAvailable": paymentsAllowed && products[lifetimeID]?.type == .nonConsumable,
            "trialAvailable": paymentsAllowed && storedTrial == 0 && trialStart == nil && products[trialID]?.type == .nonConsumable && products[trialID]?.price == 0,
            "productError": (paymentsAllowed ? productError : "In-app purchases are not allowed on this device. Check Screen Time or device restrictions.") as Any? ?? NSNull(),
        ]
        if revision == statusRevision { lastVerifiedSnapshot = status }
        return status
    }

    @MainActor private func loadProducts() async {
        if let task = productLoadTask { await task.value; return }
        let task = Task { @MainActor in
            // Clear before waking waiters so a post-restore load cannot join this completed task.
            defer { productLoadTask = nil }
            let result = await PlusProductLookup().fetch([lifetimeID, trialID])
            // Only this lookup's recognized products can enable a purchase.
            products = [:]
            for product in result.products { products[product.id] = product }
            productAttempts = result.attempts
            let missing = [lifetimeID, trialID].filter { products[$0] == nil }
            if let issue = result.issue {
                productError = issue
            } else if products.isEmpty {
                productError = "The App Store returned no purchase options. Please try again shortly."
            } else if !missing.isEmpty {
                productError = "Some Plus purchase options are unavailable from the App Store. Please try again shortly."
            } else if products[lifetimeID]?.type != .nonConsumable || products[trialID]?.type != .nonConsumable || products[trialID]?.price != 0 {
                productError = "A Plus purchase option is temporarily unavailable. Please try again later."
            } else {
                productError = nil
            }
            statusRevision += 1
            for attempt in productAttempts { NSLog("[BestTake Plus] %@", attempt.reportLine) }
        }
        productLoadTask = task
        await task.value
        notifyListeners("plusChanged", data: await snapshot())
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        Task { @MainActor in
            let preview = immediateInternalPreviewStatus()
            if let preview {
                notifyListeners("plusChanged", data: preview)
                call.resolve(preview)
            }
            // Keep verified access usable while the storefront request is pending.
            notifyListeners("plusChanged", data: await snapshot())
            if !presenting && (call.getBool("refreshProducts") == true || products.count < 2 || productError != nil) {
                await loadProducts()
            }
            let status = await snapshot()
            if preview == nil { call.resolve(status) }
            else { notifyListeners("plusChanged", data: status) }
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
                    statusRevision += 1
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
                if let task = productLoadTask { await task.value }
                try await AppStore.sync()
                statusRevision += 1
                await loadProducts()
                let status = await snapshot()
                notifyListeners("plusChanged", data: status)
                call.resolve(status)
            } catch { call.reject("Could not restore purchases. Check your App Store account and try again.") }
        }
    }

    @objc func diagnosePurchases(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard !diagnosing else { call.reject("A purchase check is already running."); return }
            diagnosing = true
            defer { diagnosing = false }
            // Observe an existing lookup, but never refresh or publish catalog state.
            if let task = productLoadTask { await task.value }
            let latestAttempts = productAttempts
            let storefrontProbe = PlusStorefrontDiagnostic()
            let legacyProbe = PlusLegacyProductDiagnostic()
            async let storefront = storefrontProbe.read()
            async let legacy = legacyProbe.read([lifetimeID, trialID])
            let (storefrontReport, legacyReport) = await (storefront, legacy)
            let info = Bundle.main.infoDictionary ?? [:]
            var lines = [
                "BestTake purchase diagnostic",
                "Recorded: \(ISO8601DateFormatter().string(from: Date()))",
                "App: \(info["CFBundleShortVersionString"] as? String ?? "unknown") (\(info["CFBundleVersion"] as? String ?? "unknown"))",
                "OS: \(UIDevice.current.systemName) \(UIDevice.current.systemVersion); device: \(UIDevice.current.model)",
                "Bundle ID: \(Bundle.main.bundleIdentifier ?? "unknown")",
                "Requested IDs: \([lifetimeID, trialID].joined(separator: ", "))",
                "Receipt filename: \(Bundle.main.appStoreReceiptURL?.lastPathComponent ?? "none")",
                "Payments allowed: \(AppStore.canMakePayments)",
                storefrontReport,
                "Latest StoreKit 2 lookup:",
                latestAttempts.isEmpty ? "No completed lookup recorded." : latestAttempts.enumerated().map { "\($0.offset + 1). \($0.element.reportLine)" }.joined(separator: "\n"),
                "Read-only StoreKit 1 diagnostic (not used for purchases):",
                legacyReport,
                "This report contains no Apple Account identity, receipt contents, transaction data, or credentials."
            ]
            #if BESTTAKE_INTERNAL_PLUS_PREVIEW
            lines.append("Internal build: BESTTAKE_INTERNAL_PLUS_PREVIEW_BUILD_1; preview ends 2026-11-14T04:59:59Z")
            #endif
            let report = lines.joined(separator: "\n")
            lastPurchaseReport = report
            call.resolve(["report": report])
        }
    }

    @objc func copyPurchaseReport(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let report = lastPurchaseReport else { call.reject("Run the purchase check before copying its report."); return }
            UIPasteboard.general.setItems([["public.utf8-plain-text": report]], options: [.localOnly: true])
            call.resolve()
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

// MARK: - Bounded product loading

/// Include only error domains/codes; never copy arbitrary userInfo or descriptions.
private func plusErrorChain(_ error: Error) -> [String] {
    var current: Error? = error
    var chain: [String] = []
    for _ in 0..<3 {
        guard let error = current else { break }
        let detail = error as NSError
        chain.append("\(detail.domain) (\(detail.code))")
        if let storeError = error as? StoreKitError {
            switch storeError {
            case .networkError(let underlying): current = underlying
            case .systemError(let underlying): current = underlying
            default: current = detail.userInfo[NSUnderlyingErrorKey] as? Error
            }
        } else {
            current = detail.userInfo[NSUnderlyingErrorKey] as? Error
        }
    }
    return chain
}

private struct PlusProductAttempt {
    let requestedIDs: [String]
    let returnedIDs: [String]
    let errorDomain: String?
    let errorCode: Int?
    let errorChain: [String]
    let durationMilliseconds: Int

    var reportLine: String {
        let error = errorChain.isEmpty ? "none" : errorChain.joined(separator: " -> ")
        return "requested=[\(requestedIDs.joined(separator: ", "))]; returned=[\(returnedIDs.joined(separator: ", "))]; error=\(error); duration=\(durationMilliseconds)ms"
    }
}

private struct PlusProductLookupResult {
    let products: [Product]
    let attempts: [PlusProductAttempt]
    let issue: String?
}

/// One deadline covers the batch and every recovery request. Late responses are ignored.
@MainActor private final class PlusProductLookup {
    private var continuation: CheckedContinuation<PlusProductLookupResult, Never>?
    private var request: Task<Void, Never>?
    private var timeout: Task<Void, Never>?
    private var expectedIDs: [String] = []
    private var found: [String: Product] = [:]
    private var attempts: [PlusProductAttempt] = []
    private var currentAttempt: (identifiers: [String], began: TimeInterval)?
    private var hadFailure = false
    private let timeoutNanoseconds: UInt64

    init(timeoutNanoseconds: UInt64 = 15_000_000_000) {
        self.timeoutNanoseconds = timeoutNanoseconds
    }

    func fetch(_ identifiers: [String]) async -> PlusProductLookupResult {
        expectedIDs = identifiers
        return await withCheckedContinuation { continuation in
            self.continuation = continuation
            request = Task { @MainActor in
                let batchSucceeded = await attempt(identifiers)
                guard self.continuation != nil else { return }
                if batchSucceeded {
                    // A missing product may be transient; retry each missing SKU once.
                    let missing = identifiers.filter { found[$0] == nil }
                    for identifier in missing {
                        _ = await attempt([identifier])
                        guard self.continuation != nil else { return }
                    }
                }
                finish(timedOut: false)
            }
            timeout = Task { @MainActor in
                do { try await Task.sleep(nanoseconds: timeoutNanoseconds) }
                catch { return }
                finish(timedOut: true)
            }
        }
    }

    private func attempt(_ identifiers: [String]) async -> Bool {
        currentAttempt = (identifiers, ProcessInfo.processInfo.systemUptime)
        do {
            let returned = try await Product.products(for: identifiers)
            guard continuation != nil else { return false }
            let returnedIDs = returned.map(\.id)
            for product in returned where identifiers.contains(product.id) {
                found[product.id] = product
            }
            record(returnedIDs: returnedIDs, error: nil)
            return true
        } catch {
            guard continuation != nil else { return false }
            hadFailure = true
            record(returnedIDs: [], error: error)
            return false
        }
    }

    private func record(returnedIDs: [String], error: Error?) {
        guard let currentAttempt else { return }
        let detail = error.map { $0 as NSError }
        attempts.append(PlusProductAttempt(requestedIDs: currentAttempt.identifiers,
            returnedIDs: returnedIDs, errorDomain: detail?.domain, errorCode: detail?.code,
            errorChain: error.map(plusErrorChain) ?? [],
            durationMilliseconds: max(0, Int((ProcessInfo.processInfo.systemUptime - currentAttempt.began) * 1000))))
        self.currentAttempt = nil
    }

    private func finish(timedOut: Bool) {
        guard let continuation else { return }
        // Freeze the result before cancellation can produce a late response.
        self.continuation = nil
        if timedOut {
            record(returnedIDs: [], error: NSError(domain: NSURLErrorDomain, code: NSURLErrorTimedOut))
        }
        let products = expectedIDs.compactMap { found[$0] }
        let issue: String?
        if timedOut {
            issue = products.isEmpty
                ? "The App Store took too long to respond. Please try again."
                : "Some Plus purchase options took too long to load. Please try again."
        } else if hadFailure {
            issue = products.isEmpty
                ? "Could not load App Store purchases. Please try again."
                : "Some Plus purchase options could not be loaded. Please try again."
        } else {
            issue = nil
        }
        let result = PlusProductLookupResult(products: products, attempts: attempts, issue: issue)
        request?.cancel(); timeout?.cancel()
        request = nil; timeout = nil
        continuation.resume(returning: result)
    }
}

// MARK: - Read-only purchase diagnostics

@MainActor private final class PlusStorefrontDiagnostic {
    private var continuation: CheckedContinuation<String, Never>?
    private var request: Task<Void, Never>?
    private var timeout: Task<Void, Never>?

    func read() async -> String {
        await withCheckedContinuation { continuation in
            self.continuation = continuation
            request = Task { @MainActor in
                let storefront = await Storefront.current
                finish(storefront.map { "Storefront: \($0.id); country: \($0.countryCode)" } ?? "Storefront: unavailable")
            }
            timeout = Task { @MainActor in
                do { try await Task.sleep(nanoseconds: 5_000_000_000) }
                catch { return }
                finish("Storefront: lookup timed out after 5 seconds")
            }
        }
    }

    private func finish(_ report: String) {
        guard let continuation else { return }
        self.continuation = nil
        request?.cancel(); timeout?.cancel()
        request = nil; timeout = nil
        continuation.resume(returning: report)
    }
}

/// This legacy API is used only to expose valid/invalid identifiers for diagnosis.
/// Its products never enter the purchase catalog or any entitlement calculation.
@MainActor private final class PlusLegacyProductDiagnostic: NSObject, SKProductsRequestDelegate {
    private var continuation: CheckedContinuation<String, Never>?
    private var request: SKProductsRequest?
    private var timeout: Task<Void, Never>?
    private var began: TimeInterval = 0
    private let timeoutNanoseconds: UInt64

    init(timeoutNanoseconds: UInt64 = 10_000_000_000) {
        self.timeoutNanoseconds = timeoutNanoseconds
        super.init()
    }

    func read(_ identifiers: [String]) async -> String {
        began = ProcessInfo.processInfo.systemUptime
        return await withCheckedContinuation { continuation in
            self.continuation = continuation
            let request = SKProductsRequest(productIdentifiers: Set(identifiers))
            self.request = request
            request.delegate = self
            timeout = Task { @MainActor in
                do { try await Task.sleep(nanoseconds: timeoutNanoseconds) }
                catch { return }
                finish("error=\(NSURLErrorDomain) (\(NSURLErrorTimedOut)); timed out")
            }
            request.start()
        }
    }

    nonisolated func productsRequest(_ request: SKProductsRequest, didReceive response: SKProductsResponse) {
        let valid = response.products.map(\.productIdentifier).sorted()
        let invalid = response.invalidProductIdentifiers.sorted()
        Task { @MainActor [weak self] in
            self?.finish("valid=[\(valid.joined(separator: ", "))]; invalid=[\(invalid.joined(separator: ", "))]; error=none")
        }
    }

    nonisolated func request(_ request: SKRequest, didFailWithError error: Error) {
        let chain = plusErrorChain(error).joined(separator: " -> ")
        Task { @MainActor [weak self] in self?.finish("error=\(chain)") }
    }

    private func finish(_ report: String) {
        guard let continuation else { return }
        self.continuation = nil
        let elapsed = max(0, Int((ProcessInfo.processInfo.systemUptime - began) * 1000))
        request?.delegate = nil
        request?.cancel(); timeout?.cancel()
        request = nil; timeout = nil
        continuation.resume(returning: "\(report); duration=\(elapsed)ms")
    }
}

// MARK: - Internal Plus preview policy

/// The export pipeline separately restricts this opt-in build to internal TestFlight.
/// Receipt naming is an environment check, not proof of an internal tester's identity.
private enum PlusInternalPreviewPolicy {
    static func expiry(now: TimeInterval, lastObserved: TimeInterval,
                       receiptFilename: String?, simulator: Bool) -> TimeInterval? {
        #if BESTTAKE_INTERNAL_PLUS_PREVIEW
        let startsAt: TimeInterval = 1_793_318_400 // 2026-10-30T00:00:00Z
        let expiresAt: TimeInterval = 1_794_632_399 // 2026-11-14T04:59:59Z
        guard simulator || receiptFilename == "sandboxReceipt",
              now.isFinite, lastObserved.isFinite, lastObserved >= 0,
              now >= startsAt, now < expiresAt, now >= lastObserved else { return nil }
        return expiresAt
        #else
        return nil
        #endif
    }
}

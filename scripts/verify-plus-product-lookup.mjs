import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Exercise the actual production helpers, replacing only Apple's external APIs.
const production = readFileSync(resolve('ios/App/App/OfferCodesPlugin.swift'), 'utf8')
const marker = '// MARK: - Bounded product loading'
assert.equal(production.split(marker).length, 2, 'Expected one native helper section')
const helpers = production.slice(production.indexOf(marker))
const stubs = String.raw`
import Foundation

private enum StoreKitError: Error {
    case networkError(URLError)
    case systemError(Error)
}

private struct Product {
    let id: String
    @MainActor static var fetch: ([String]) async throws -> [Product] = { _ in [] }
    @MainActor static func products(for identifiers: [String]) async throws -> [Product] {
        try await fetch(identifiers)
    }
}

private struct Storefront {
    let id: String
    let countryCode: String
    @MainActor static var fetch: () async -> Storefront? = { nil }
    static var current: Storefront? { get async { await fetch() } }
}

private struct SKProduct { let productIdentifier: String }
private struct SKProductsResponse {
    let products: [SKProduct]
    let invalidProductIdentifiers: [String]
}
private protocol SKProductsRequestDelegate: AnyObject {
    func productsRequest(_ request: SKProductsRequest, didReceive response: SKProductsResponse)
    func request(_ request: SKRequest, didFailWithError error: Error)
}
@MainActor private class SKRequest: NSObject {
    var cancelled = false
    func start() {}
    func cancel() { cancelled = true }
}
@MainActor private final class SKProductsRequest: SKRequest {
    static var started: (SKProductsRequest) -> Void = { _ in }
    let identifiers: Set<String>
    weak var delegate: (any SKProductsRequestDelegate)?
    init(productIdentifiers: Set<String>) { identifiers = productIdentifiers; super.init() }
    override func start() { Self.started(self) }
}

@MainActor private final class SuspendedProducts {
    private var continuation: CheckedContinuation<[Product], Error>?
    var returned = false
    func wait() async throws -> [Product] {
        let result: [Product] = try await withCheckedThrowingContinuation { continuation = $0 }
        returned = true // Intentionally ignore cancellation to model a late SDK reply.
        return result
    }
    func finish(_ products: [Product]) {
        guard let continuation else { fatalError("Request never started") }
        self.continuation = nil
        continuation.resume(returning: products)
    }
}
@MainActor private final class SuspendedStorefront {
    private var continuation: CheckedContinuation<Storefront?, Never>?
    var returned = false
    func wait() async -> Storefront? {
        let result = await withCheckedContinuation { continuation = $0 }
        returned = true
        return result
    }
    func finish() {
        continuation?.resume(returning: Storefront(id: "late", countryCode: "USA"))
        continuation = nil
    }
}
`
const checks = String.raw`
@main private struct VerifyPlusProductLookup {
    @MainActor static func drain() async { for _ in 0..<20 { await Task.yield() } }
    @MainActor static func main() async throws {
        let ids = ["lifetime.fixture", "trial.fixture"]
        var requested: [[String]] = []
        Product.fetch = { query in requested.append(query); return query.map { Product(id: $0) } }
        let complete = await PlusProductLookup().fetch(ids)
        precondition(requested == [ids] && complete.products.map(\.id) == ids)
        precondition(complete.attempts.count == 1 && complete.issue == nil)
        print("PASS: complete batch uses one request")

        requested = []
        Product.fetch = { query in
            requested.append(query)
            return query.count == 2 ? [] : query.map { Product(id: $0) }
        }
        let recovered = await PlusProductLookup().fetch(ids)
        precondition(requested == [ids, [ids[0]], [ids[1]]])
        precondition(recovered.products.map(\.id) == ids && recovered.issue == nil)
        precondition(recovered.attempts.map(\.returnedIDs) == [[], [ids[0]], [ids[1]]])
        print("PASS: empty batch recovers through one request per missing SKU")

        requested = []
        Product.fetch = { query in
            requested.append(query)
            if query.count == 2 { return [Product(id: ids[0]), Product(id: ids[0]), Product(id: "unexpected.fixture")] }
            return [Product(id: ids[1])]
        }
        let partialRecovery = await PlusProductLookup().fetch(ids)
        precondition(requested == [ids, [ids[1]]])
        precondition(partialRecovery.products.map(\.id) == ids)
        print("PASS: partial batch retries only missing SKU; duplicates and unexpected IDs are safe")

        requested = []
        Product.fetch = { query in requested.append(query); return [] }
        let empty = await PlusProductLookup().fetch(ids)
        precondition(empty.products.isEmpty && requested == [ids, [ids[0]], [ids[1]]])
        precondition(empty.attempts.count == 3 && empty.attempts.allSatisfy { $0.errorDomain == nil })
        print("PASS: all-empty response stops after bounded single retries")

        let secret = "private-account-identity-do-not-include"
        let nested = NSError(domain: "ASDErrorDomain", code: 7,
            userInfo: [NSLocalizedDescriptionKey: secret, "account": secret])
        let failure = NSError(domain: "AMSErrorDomain", code: 9,
            userInfo: [NSUnderlyingErrorKey: nested, NSLocalizedDescriptionKey: secret, "token": secret])
        requested = []
        Product.fetch = { query in requested.append(query); throw failure }
        let failed = await PlusProductLookup().fetch(ids)
        precondition(requested == [ids] && failed.products.isEmpty && failed.issue != nil)
        precondition(failed.attempts.first?.errorDomain == "AMSErrorDomain")
        precondition(failed.attempts.first?.errorCode == 9)
        precondition(failed.attempts[0].reportLine.contains("ASDErrorDomain (7)"))
        precondition(!failed.attempts[0].reportLine.contains(secret))
        print("PASS: batch error is structured and private descriptions/userInfo are omitted")

        let systemChain = plusErrorChain(StoreKitError.systemError(failure))
        precondition(systemChain.count == 3 && systemChain[1] == "AMSErrorDomain (9)" && systemChain[2] == "ASDErrorDomain (7)")
        let networkFailure = URLError(.notConnectedToInternet, userInfo: [NSUnderlyingErrorKey: failure, "account": secret])
        let networkChain = plusErrorChain(StoreKitError.networkError(networkFailure))
        precondition(networkChain.count == 3 && networkChain[1].contains("-1009") && networkChain[2] == "AMSErrorDomain (9)")
        precondition(!networkChain.joined().contains(secret) && !systemChain.joined().contains(secret))
        print("PASS: StoreKit system/network underlying errors expose only a depth-limited domain/code chain")

        requested = []
        Product.fetch = { query in
            requested.append(query)
            if query.count == 2 { return [Product(id: ids[0])] }
            throw failure
        }
        let partialFailure = await PlusProductLookup().fetch(ids)
        precondition(partialFailure.products.map(\.id) == [ids[0]])
        precondition(partialFailure.attempts.count == 2 && partialFailure.issue != nil)
        print("PASS: partial products survive a failed missing-SKU request")

        // The unchanged default deadline is exercised once against an SDK call
        // that refuses cancellation, so a task-group implementation cannot hang.
        let suspended = SuspendedProducts()
        Product.fetch = { _ in try await suspended.wait() }
        let began = ProcessInfo.processInfo.systemUptime
        let timedOut = await PlusProductLookup().fetch(ids)
        precondition(ProcessInfo.processInfo.systemUptime - began >= 14)
        precondition(timedOut.products.isEmpty && timedOut.attempts.count == 1)
        precondition(timedOut.attempts[0].errorCode == NSURLErrorTimedOut)
        precondition(timedOut.issue != nil && !suspended.returned)
        suspended.finish([Product(id: ids[0])])
        await drain()
        precondition(suspended.returned && timedOut.products.isEmpty && timedOut.attempts.count == 1)
        print("PASS: 15-second deadline completes once; late SDK response cannot alter the result")

        let lateRetry = SuspendedProducts()
        Product.fetch = { query in
            if query.count == 2 {
                try await Task.sleep(nanoseconds: 50_000_000)
                return [Product(id: ids[0])]
            }
            return try await lateRetry.wait()
        }
        let partialBegan = ProcessInfo.processInfo.systemUptime
        let partialTimeout = await PlusProductLookup(timeoutNanoseconds: 100_000_000).fetch(ids)
        precondition(ProcessInfo.processInfo.systemUptime - partialBegan < 1)
        precondition(partialTimeout.products.map(\.id) == [ids[0]])
        precondition(partialTimeout.attempts.count == 2 && partialTimeout.attempts[1].errorCode == NSURLErrorTimedOut)
        precondition(partialTimeout.attempts[1].requestedIDs == [ids[1]])
        lateRetry.finish([Product(id: ids[1])])
        await drain()
        precondition(partialTimeout.products.map(\.id) == [ids[0]] && partialTimeout.attempts.count == 2)
        print("PASS: one overall deadline includes retries and preserves already-returned products")

        Storefront.fetch = { Storefront(id: "143441", countryCode: "USA") }
        let storefront = await PlusStorefrontDiagnostic().read()
        precondition(storefront.contains("143441") && storefront.contains("USA"))
        Storefront.fetch = { nil }
        let noStorefront = await PlusStorefrontDiagnostic().read()
        precondition(noStorefront == "Storefront: unavailable")
        let stalledStorefront = SuspendedStorefront()
        Storefront.fetch = { await stalledStorefront.wait() }
        let absentStorefront = await PlusStorefrontDiagnostic().read()
        precondition(absentStorefront.contains("timed out"))
        stalledStorefront.finish()
        await drain()
        precondition(stalledStorefront.returned && absentStorefront.contains("timed out"))
        print("PASS: storefront available/nil/timeout paths are bounded and ignore late results")

        SKProductsRequest.started = { request in
            precondition(request.identifiers == Set(ids))
            request.delegate?.productsRequest(request, didReceive: SKProductsResponse(
                products: [SKProduct(productIdentifier: ids[0])], invalidProductIdentifiers: [ids[1]]))
        }
        let legacy = await PlusLegacyProductDiagnostic().read(ids)
        precondition(legacy.contains("valid=[lifetime.fixture]") && legacy.contains("invalid=[trial.fixture]"))
        print("PASS: diagnostic SK1 probe reports valid and invalid IDs")

        SKProductsRequest.started = { request in request.delegate?.request(request, didFailWithError: failure) }
        let legacyFailure = await PlusLegacyProductDiagnostic().read(ids)
        precondition(legacyFailure.contains("AMSErrorDomain (9)") && !legacyFailure.contains(secret))
        precondition(legacyFailure.contains("ASDErrorDomain (7)"))
        print("PASS: diagnostic error output omits descriptions and private userInfo")

        weak var weakRequest: SKProductsRequest?
        SKProductsRequest.started = { request in weakRequest = request }
        let diagnostic = PlusLegacyProductDiagnostic()
        let diagnosticTask = Task { @MainActor in await diagnostic.read(ids) }
        await drain()
        precondition(weakRequest != nil, "Probe must keep the request alive while waiting")
        let request = weakRequest!
        let delegate = request.delegate!
        let legacyTimeout = await diagnosticTask.value
        precondition(legacyTimeout.contains("timed out") && legacyTimeout.contains("\(NSURLErrorTimedOut)"))
        precondition(request.cancelled && request.delegate == nil)
        delegate.productsRequest(request, didReceive: SKProductsResponse(products: [SKProduct(productIdentifier: ids[0])], invalidProductIdentifiers: []))
        delegate.request(request, didFailWithError: failure)
        await drain()
        precondition(legacyTimeout.contains("timed out"))
        print("PASS: 10-second SK1 timeout retains/cancels request and ignores late success/failure callbacks")
    }
}
`
const directory = mkdtempSync(join(tmpdir(), 'besttake-plus-product-lookup-'))
try {
  const source = join(directory, 'VerifyPlusProductLookup.swift')
  const executable = join(directory, 'verify-plus-product-lookup')
  writeFileSync(source, `${stubs}\n${helpers}\n${checks}`)
  execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-parse-as-library',
    '-module-cache-path', join(directory, 'module-cache'), source, '-o', executable],
    { stdio: 'inherit', timeout: 120_000 })
  execFileSync(executable, [], { stdio: 'inherit', timeout: 60_000 })
} finally { rmSync(directory, { recursive: true, force: true }) }

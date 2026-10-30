import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Run from the repository root on macOS with Xcode's Swift compiler available.
// Extract the current helper each time so this test cannot pass against an old
// copied implementation. Its closing brace is at the top-level indentation.
const production = readFileSync(resolve('ios/App/App/OfferCodesPlugin.swift'), 'utf8')
const helpers = [...production.matchAll(/^@MainActor private final class PlusProductLookup \{[\s\S]*?^\}/gm)]
assert.equal(helpers.length, 1, 'Expected one top-level PlusProductLookup helper in the native plugin')
const helper = helpers[0][0]

const productStub = String.raw`
import Foundation

// The helper itself is production code; only StoreKit's Product is controlled.
private struct Product {
    let id: String
    @MainActor static var fetch: ([String]) async throws -> [Product] = { _ in [] }
    @MainActor static func products(for identifiers: [String]) async throws -> [Product] {
        try await fetch(identifiers)
    }
}
`

const checks = String.raw`
@MainActor private final class SuspendedProductRequest {
    private var continuation: CheckedContinuation<[Product], Error>?
    var returned = false

    func wait() async throws -> [Product] {
        let result: [Product] = try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
        }
        // Intentionally ignore cancellation, like an operation already finishing,
        // so the helper receives a late response after its timeout has fired.
        returned = true
        return result
    }

    func finish(_ products: [Product]) {
        guard let continuation else { fatalError("Controlled request never started") }
        self.continuation = nil
        continuation.resume(returning: products)
    }
}

@main private struct VerifyPlusProductLookup {
    @MainActor static func main() async throws {
        let identifiers = ["lifetime.fixture", "trial.fixture"]
        var requested: [String] = []
        Product.fetch = { ids in
            requested = ids
            return ids.map { Product(id: $0) }
        }
        let products = try await PlusProductLookup().fetch(identifiers)
        precondition(requested == identifiers, "Lookup must forward exact requested identifiers")
        precondition(products.map(\.id) == identifiers, "Successful lookup must return its products")
        print("PASS: successful lookup returns the requested products")

        let fixtureError = NSError(domain: "BestTakeLookupFixture", code: 72,
            userInfo: [NSLocalizedDescriptionKey: "Controlled App Store error"])
        Product.fetch = { _ in throw fixtureError }
        do {
            _ = try await PlusProductLookup().fetch(identifiers)
            fatalError("A failed StoreKit lookup unexpectedly succeeded")
        } catch {
            let detail = error as NSError
            precondition(detail.domain == fixtureError.domain && detail.code == fixtureError.code,
                "Lookup must preserve the original failure")
        }
        print("PASS: thrown StoreKit failure is propagated")

        let suspended = SuspendedProductRequest()
        Product.fetch = { _ in try await suspended.wait() }
        var fetchCompletions = 0
        let began = Date()
        do {
            _ = try await PlusProductLookup().fetch(identifiers)
            fatalError("An unresponsive lookup unexpectedly succeeded")
        } catch {
            fetchCompletions += 1
            let detail = error as NSError
            precondition(detail.domain == NSURLErrorDomain && detail.code == NSURLErrorTimedOut,
                "Unresponsive lookup must finish with the timeout error")
            precondition(Date().timeIntervalSince(began) >= 14,
                "Exercise the unchanged production 15-second timeout")
        }
        precondition(fetchCompletions == 1)
        precondition(!suspended.returned, "The underlying request must still be pending at timeout")
        print("PASS: unchanged 15-second timeout releases the waiting caller")

        suspended.finish([Product(id: "late.fixture")])
        for _ in 0..<100 {
            await Task.yield()
            if suspended.returned { break }
        }
        precondition(suspended.returned, "Late request completion must reach the helper")
        // A second resume of the checked continuation would trap and fail this
        // executable. Allow the late request to execute the helper's finish.
        for _ in 0..<10 { await Task.yield() }
        precondition(fetchCompletions == 1, "Late completion must not finish the caller twice")
        print("PASS: late completion after timeout cannot resume the continuation twice")
    }
}
`

const directory = mkdtempSync(join(tmpdir(), 'besttake-plus-product-lookup-'))
try {
  const source = join(directory, 'VerifyPlusProductLookup.swift')
  const executable = join(directory, 'verify-plus-product-lookup')
  writeFileSync(source, `${productStub}\n${helper}\n${checks}`)
  execFileSync('xcrun', [
    'swiftc', '-swift-version', '5', '-parse-as-library',
    '-module-cache-path', join(directory, 'module-cache'),
    source, '-o', executable,
  ], { stdio: 'inherit', timeout: 120_000 })
  execFileSync(executable, [], { stdio: 'inherit', timeout: 30_000 })
} finally {
  rmSync(directory, { recursive: true, force: true })
}

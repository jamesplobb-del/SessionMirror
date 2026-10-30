import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Compile the production policy both with and without the explicit internal flag.
const source = readFileSync('ios/App/App/OfferCodesPlugin.swift', 'utf8')
const marker = '// MARK: - Internal Plus preview policy'
assert.equal(source.split(marker).length, 2)
const policy = source.slice(source.indexOf(marker))
assert.match(source, /"internalPreviewExpiresAt": internalPreviewExpiresAt\(\) as Any\? \?\? NSNull\(\)/)
const statusMethod = source.slice(source.indexOf('@objc func getStatus('), source.indexOf('@objc func purchase('))
assert.ok(statusMethod.indexOf('call.resolve(preview)') < statusMethod.indexOf('await snapshot()'), 'Preview resolves before StoreKit awaits')
assert.match(statusMethod, /if preview == nil \{ call.resolve\(status\) \}/, 'Native promise resolves only once')
const previewMethod = source.slice(source.indexOf('@MainActor private func internalPreviewExpiresAt('), source.indexOf('@MainActor private func usesSandboxStorage('))
assert.doesNotMatch(previewMethod, /await |Product\.products|AppTransaction|currentEntitlements|\.purchased =|trialSeenKey/, 'Preview is independent of catalog, transactions, and trial bookkeeping')
assert.match(previewMethod, /#if BESTTAKE_INTERNAL_PLUS_PREVIEW/)
assert.match(previewMethod, /#if targetEnvironment\(simulator\)/)
assert.match(previewMethod, /UserDefaults\.standard\.set\(max\(now, previous\), forKey: key\)/)
assert.match(source, /#if BESTTAKE_INTERNAL_PLUS_PREVIEW\s+lines\.append\("Internal build: BESTTAKE_INTERNAL_PLUS_PREVIEW_BUILD_1/)

const tests = String.raw`
func require(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { fatalError(message) }
}
let start: TimeInterval = 1_793_318_400
let end: TimeInterval = 1_794_632_399
func expiry(_ now: TimeInterval, _ previous: TimeInterval = 0,
            _ receipt: String? = "sandboxReceipt", _ simulator: Bool = false) -> TimeInterval? {
    PlusInternalPreviewPolicy.expiry(now: now, lastObserved: previous,
        receiptFilename: receipt, simulator: simulator)
}
#if BESTTAKE_INTERNAL_PLUS_PREVIEW
require(expiry(start) == end, "Preview begins at the exact fixed start")
require(expiry(end - 0.001) == end, "Preview remains active before its deadline")
require(expiry(start - 0.001) == nil, "Backdating before the window cannot enable preview")
require(expiry(end) == nil && expiry(end + 1) == nil, "Deadline is exclusive and fixed")
require(expiry(start, end) == nil, "A clock rollback cannot reactivate an expired preview")
require(expiry(start + 2, start + 3) == nil, "A clock rollback within the preview window fails closed")
require(expiry(start + 3, start + 3) == end, "An unchanged clock remains valid")
let invalidReceipts: [String?] = [nil, "receipt", "SandboxReceipt", "sandboxReceipt.backup", "/sandboxReceipt"]
for receipt in invalidReceipts {
    require(expiry(start, 0, receipt) == nil, "Only the exact sandbox receipt filename is accepted on device")
}
require(expiry(start, 0, nil, true) == end, "Simulator proof works in the explicitly opted-in build")
for bad: TimeInterval in [.nan, .infinity, -.infinity] {
    require(expiry(bad) == nil && expiry(start, bad) == nil, "Malformed clock data fails closed")
}
require(expiry(start, -1) == nil, "Invalid persisted watermark fails closed")
print("PASS: opted-in preview environment, fixed start/expiry, rollback, and malformed-clock checks")
#else
for now in [start - 1, start, end - 1, end, end + 1] {
    require(expiry(now) == nil && expiry(now, 0, nil, true) == nil, "Normal builds never grant a preview")
}
print("PASS: default build rejects preview for every environment and date")
#endif
`
const directory = mkdtempSync(join(tmpdir(), 'besttake-internal-preview-'))
try {
  const swift = join(directory, 'main.swift')
  writeFileSync(swift, `import Foundation\n${policy}\n${tests}`)
  for (const enabled of [false, true]) {
    const binary = join(directory, enabled ? 'internal' : 'normal')
    execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-module-cache-path', join(directory, 'module-cache'), ...(enabled ? ['-D', 'BESTTAKE_INTERNAL_PLUS_PREVIEW'] : []), swift, '-o', binary], { stdio: 'inherit', timeout: 120_000 })
    execFileSync(binary, [], { stdio: 'inherit', timeout: 10_000 })
  }
  console.log('PASS: preview bridge response is immediate; purchase/trial state and normal builds remain separate.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}

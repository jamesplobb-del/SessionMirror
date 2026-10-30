import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

// Run from the repository root. Resolve its existing esbuild installation so
// this script can also be exercised before it is copied into scripts/.
const { build } = createRequire(resolve('package.json'))('esbuild')
const fixturesKey = '__bestTakePlusLoadingFixtures'
const previousFixtures = globalThis[fixturesKey]
globalThis[fixturesKey] = new Map()
let fixtureId = 0

const available = {
  purchased: false,
  trialStartedAt: null,
  trialExpiresAt: null,
  price: '$9.99',
  purchaseAvailable: true,
  trialAvailable: true,
  productError: null,
}
const unavailable = {
  ...available,
  price: null,
  purchaseAvailable: false,
  trialAvailable: false,
  productError: 'The App Store did not return the Plus products. Please try again.',
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// Drain promise callbacks without adding timing-dependent delays.
const checkpoint = () => new Promise(resolve => setImmediate(resolve))

async function loadFixture({ readStatus = async () => available, listenerFailures = 0 } = {}) {
  const id = ++fixtureId
  const fixture = {
    readStatus,
    listenerFailures,
    statusCalls: [],
    listenerCalls: 0,
    listener: null,
    foreground: null,
    foregroundSubscriptions: 0,
  }
  fixture.bridge = {
    getStatus(options) {
      fixture.statusCalls.push(options)
      return fixture.readStatus(options)
    },
    async addListener(event, listener) {
      assert.equal(event, 'plusChanged')
      fixture.listenerCalls++
      if (fixture.listenerFailures-- > 0) throw new Error('Listener connection failed')
      fixture.listener = listener
      return { remove: async () => { fixture.listener = null } }
    },
  }
  globalThis[fixturesKey].set(id, fixture)
  const lookup = `globalThis[${JSON.stringify(fixturesKey)}].get(${id})`
  const stubs = {
    '@capacitor/core': `const fixture=${lookup}; export const Capacitor={getPlatform:()=>"ios"}; export const registerPlugin=()=>fixture.bridge;`,
    appForeground: `const fixture=${lookup}; export const subscribeAppForeground=listener=>{fixture.foregroundSubscriptions++;fixture.foreground=listener;return ()=>{fixture.foreground=null}};`,
  }
  const result = await build({
    entryPoints: ['src/plus/plusAccess.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [{ name: 'plus-loading-fixtures', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        const key = stubs[args.path] ? args.path : args.path.split('/').at(-1)
        if (stubs[key]) return { path: key, namespace: 'fixture' }
      })
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }))
    } }],
  })
  fixture.api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + `\n// fixture ${id}`).toString('base64')}`)
  return fixture
}

try {
  // A slow product response must stay visibly pending, and repeated taps must
  // share the lookup rather than return an apparently completed old snapshot.
  const firstLookup = deferred()
  const loading = await loadFixture({ readStatus: () => firstLookup.promise })
  const observed = []
  const unsubscribe = loading.api.subscribePlus(() => observed.push({ ...loading.api.getPlusSnapshot() }))
  loading.api.initializePlusAccess()
  const first = loading.api.refreshPlusAccess()
  const concurrent = loading.api.refreshPlusAccess()
  let completed = false
  void first.then(() => { completed = true })
  await checkpoint()
  assert.equal(loading.statusCalls.length, 1, 'Concurrent refreshes share one native request')
  assert.deepEqual(loading.statusCalls[0], { refreshProducts: false }, 'Ordinary access refresh is not forced')
  assert.equal(completed, false, 'Refresh does not complete before native product lookup returns')
  assert.equal(loading.api.getPlusSnapshot().refreshing, true, 'The UI can show an in-flight App Store check')
  assert.equal(loading.api.canUsePlus(), false, 'Loading cannot grant Plus access')
  firstLookup.resolve(unavailable)
  await Promise.all([first, concurrent])
  assert.equal(loading.api.getPlusSnapshot().ready, true)
  assert.equal(loading.api.getPlusSnapshot().refreshing, false)
  assert.equal(loading.api.getPlusSnapshot().productError, unavailable.productError, 'A successful bridge response must preserve a failed product lookup')
  assert.equal(loading.api.getPlusSnapshot().purchaseAvailable, false)
  assert.equal(loading.api.getPlusSnapshot().trialAvailable, false)
  assert.ok(observed.some(status => status.refreshing === true), 'Subscribers receive refresh progress')

  const recoveredLookup = deferred()
  loading.readStatus = () => recoveredLookup.promise
  const retry = loading.api.refreshPlusAccess(true)
  await checkpoint()
  assert.deepEqual(loading.statusCalls.at(-1), { refreshProducts: true }, 'Explicit availability check requests fresh products')
  assert.equal(loading.api.getPlusSnapshot().refreshing, true)
  recoveredLookup.resolve(available)
  await retry
  assert.equal(loading.api.getPlusSnapshot().refreshing, false)
  assert.equal(loading.api.getPlusSnapshot().productError, null, 'A recovered lookup clears its old product error')
  assert.equal(loading.api.getPlusSnapshot().price, '$9.99')
  assert.equal(loading.api.getPlusSnapshot().purchaseAvailable, true)
  assert.equal(loading.api.getPlusSnapshot().trialAvailable, true)
  assert.equal(loading.api.canUsePlus(), false, 'Available products alone do not grant access')
  assert.equal(loading.listenerCalls, 1, 'Successful refreshes do not add duplicate transaction listeners')
  unsubscribe()

  // An offline bridge must preserve an entitlement already verified during the
  // session, while still explaining that the new check failed.
  const owned = await loadFixture({ readStatus: async () => ({ ...available, purchased: true }) })
  owned.api.initializePlusAccess()
  await owned.api.refreshPlusAccess()
  assert.equal(owned.api.canUsePlus(), true)
  const failedLookup = deferred()
  owned.readStatus = () => failedLookup.promise
  const failedRefresh = owned.api.refreshPlusAccess(true)
  await checkpoint()
  assert.equal(owned.api.getPlusSnapshot().refreshing, true)
  assert.equal(owned.api.canUsePlus(), true, 'Refreshing does not hide previously verified access')
  failedLookup.reject(new Error('Bridge unavailable'))
  await failedRefresh
  assert.equal(owned.api.getPlusSnapshot().refreshing, false, 'A rejected refresh always clears its progress state')
  assert.equal(owned.api.getPlusSnapshot().purchased, true)
  assert.equal(owned.api.canUsePlus(), true, 'Bridge failure cannot erase verified lifetime access')
  assert.equal(typeof owned.api.getPlusSnapshot().error, 'string')
  assert.ok(owned.api.getPlusSnapshot().error.length > 0, 'Bridge failure has a visible explanation')
  owned.readStatus = async () => ({ ...available, purchased: true })
  await owned.api.refreshPlusAccess(true)
  assert.equal(owned.api.getPlusSnapshot().error, null, 'Successful recovery clears the transient bridge error')

  // A listener registration failure must not disable access checks forever.
  // Retry registration on the next check, then exercise a real listener update.
  const originalWarn = console.warn
  const warnings = []
  console.warn = (...args) => warnings.push(args)
  let listenerRecovery
  try {
    listenerRecovery = await loadFixture({ listenerFailures: 1 })
    listenerRecovery.api.initializePlusAccess()
    await listenerRecovery.api.refreshPlusAccess()
    assert.equal(listenerRecovery.listenerCalls, 1, 'Initial registration failure is not immediately retried in a loop')
    assert.ok(warnings.length > 0, 'Listener registration failure is logged for diagnosis')
    assert.equal(listenerRecovery.api.getPlusSnapshot().purchaseAvailable, true, 'Listener failure does not prevent a direct availability check')
    await listenerRecovery.api.refreshPlusAccess(true)
    assert.equal(listenerRecovery.listenerCalls, 2, 'A later refresh retries failed listener registration')
    assert.equal(typeof listenerRecovery.listener, 'function')
    listenerRecovery.listener({ ...unavailable, purchased: true })
    assert.equal(listenerRecovery.api.canUsePlus(), true, 'The recovered listener applies verified transaction updates')
    assert.equal(listenerRecovery.api.getPlusSnapshot().productError, unavailable.productError, 'Listener updates retain product diagnostics')
    listenerRecovery.listener({ ...available, purchased: true })
    assert.equal(listenerRecovery.api.getPlusSnapshot().productError, null)
  } finally {
    console.warn = originalWarn
  }

  // Returning to the app rechecks access; background transitions do not.
  const callsBeforeForeground = listenerRecovery.statusCalls.length
  listenerRecovery.foreground(false)
  await checkpoint()
  assert.equal(listenerRecovery.statusCalls.length, callsBeforeForeground)
  const foregroundLookup = deferred()
  listenerRecovery.readStatus = () => foregroundLookup.promise
  listenerRecovery.foreground(true)
  const joinedForeground = listenerRecovery.api.refreshPlusAccess()
  await checkpoint()
  assert.equal(listenerRecovery.statusCalls.length, callsBeforeForeground + 1)
  assert.deepEqual(listenerRecovery.statusCalls.at(-1), { refreshProducts: false })
  assert.equal(listenerRecovery.api.getPlusSnapshot().refreshing, true)
  foregroundLookup.resolve({ ...available, purchased: true })
  await joinedForeground
  assert.equal(listenerRecovery.api.getPlusSnapshot().refreshing, false)
  assert.equal(listenerRecovery.listenerCalls, 2, 'Foreground refresh reuses the recovered transaction listener')
  assert.equal(listenerRecovery.foregroundSubscriptions, 1)

  // A forced check arriving during an ordinary check needs its own fresh lookup.
  // Multiple forced callers still share one follow-up, and all wait for it.
  const ordinaryLookup = deferred(), forcedLookup = deferred()
  const coalesced = await loadFixture({ readStatus: options => options.refreshProducts ? forcedLookup.promise : ordinaryLookup.promise })
  const ordinaryRefresh = coalesced.api.refreshPlusAccess()
  await checkpoint()
  const forcedRefresh = coalesced.api.refreshPlusAccess(true)
  const duplicateForcedRefresh = coalesced.api.refreshPlusAccess(true)
  assert.equal(coalesced.statusCalls.length, 1)
  ordinaryLookup.resolve(unavailable)
  await checkpoint()
  assert.equal(coalesced.statusCalls.length, 2, 'An explicit retry is not swallowed by an in-flight ordinary lookup')
  assert.deepEqual(coalesced.statusCalls[1], { refreshProducts: true })
  assert.equal(coalesced.api.getPlusSnapshot().refreshing, true, 'Progress stays visible for the queued forced lookup')
  let forcedFinished = false
  void forcedRefresh.then(() => { forcedFinished = true })
  await checkpoint()
  assert.equal(forcedFinished, false)
  forcedLookup.resolve(available)
  await Promise.all([ordinaryRefresh, forcedRefresh, duplicateForcedRefresh])
  assert.equal(coalesced.statusCalls.length, 2, 'Concurrent explicit retries share their fresh lookup')
  assert.equal(coalesced.api.getPlusSnapshot().purchaseAvailable, true)
  assert.equal(coalesced.api.getPlusSnapshot().productError, null)

  // Restore waits for an existing check. A foreground check that begins during
  // restore cannot later replace its newer verified result with an old snapshot.
  const beforeRestore = deferred(), restoreResult = deferred(), staleForeground = deferred()
  const restoring = await loadFixture({ readStatus: () => beforeRestore.promise })
  let restoreCalls = 0
  restoring.bridge.restore = () => { restoreCalls++; return restoreResult.promise }
  const refreshBeforeRestore = restoring.api.refreshPlusAccess()
  await checkpoint()
  const restoration = restoring.api.restorePlus()
  await checkpoint()
  assert.equal(restoreCalls, 0, 'Restore waits for the current status request')
  beforeRestore.resolve(unavailable)
  await refreshBeforeRestore
  await checkpoint()
  assert.equal(restoreCalls, 1)
  restoring.readStatus = () => staleForeground.promise
  const foregroundDuringRestore = restoring.api.refreshPlusAccess()
  await checkpoint()
  restoreResult.resolve({ ...available, purchased: true })
  assert.equal(await restoration, true)
  staleForeground.resolve(unavailable)
  await foregroundDuringRestore
  assert.equal(restoring.api.getPlusSnapshot().purchased, true, 'A stale foreground response cannot erase the restored entitlement')
  assert.equal(restoring.api.getPlusSnapshot().purchaseAvailable, true)
  assert.equal(restoring.api.getPlusSnapshot().productError, null)

  const secondRestore = deferred(), staleFailure = deferred()
  restoring.bridge.restore = () => secondRestore.promise
  const restorationBeforeFailure = restoring.api.restorePlus()
  await checkpoint()
  restoring.readStatus = () => staleFailure.promise
  const failingForeground = restoring.api.refreshPlusAccess()
  await checkpoint()
  secondRestore.resolve({ ...available, purchased: true })
  await restorationBeforeFailure
  staleFailure.reject(new Error('Outdated foreground request failed'))
  await failingForeground
  assert.equal(restoring.api.getPlusSnapshot().purchased, true)
  assert.equal(restoring.api.getPlusSnapshot().error, null, 'A stale foreground failure cannot add an error after successful restore')

  // Native snapshots can be delivered out of order through listener callbacks.
  // Revisions protect both product state and verified access without blocking a
  // later legitimate revocation.
  const revisioned = await loadFixture({ readStatus: async () => ({ ...unavailable, statusRevision: 1 }) })
  await revisioned.api.refreshPlusAccess()
  revisioned.bridge.restore = async () => ({ ...available, purchased: true, statusRevision: 4 })
  await revisioned.api.restorePlus()
  revisioned.listener({ ...unavailable, statusRevision: 2 })
  assert.equal(revisioned.api.getPlusSnapshot().purchased, true, 'An older listener snapshot cannot undo restored access')
  assert.equal(revisioned.api.getPlusSnapshot().purchaseAvailable, true, 'An older listener snapshot cannot roll back the recovered catalog')
  assert.equal(revisioned.api.getPlusSnapshot().productError, null)
  assert.equal(revisioned.api.getPlusSnapshot().statusRevision, 4)
  revisioned.readStatus = async () => ({ ...unavailable, statusRevision: 3 })
  await revisioned.api.refreshPlusAccess(true)
  assert.equal(revisioned.api.getPlusSnapshot().statusRevision, 4, 'The same revision guard applies to native promise results')
  revisioned.listener({ ...available, purchased: false, statusRevision: 5 })
  assert.equal(revisioned.api.canUsePlus(), false, 'A newer verified revocation still removes access')
  assert.equal(revisioned.api.getPlusSnapshot().statusRevision, 5)
  revisioned.bridge.restore = async () => ({ ...available, purchased: true, statusRevision: 4 })
  assert.equal(await revisioned.api.restorePlus(), false, 'An older action result cannot overwrite a newer revocation')
  assert.equal(revisioned.api.getPlusSnapshot().statusRevision, 5)

  // Diagnostics return a local report without changing entitlements or product
  // availability. Purchase, trial, restore, copy, and a second check cannot overlap.
  const diagnostic = await loadFixture({ readStatus: async () => unavailable })
  await diagnostic.api.refreshPlusAccess()
  const diagnosticResult = deferred()
  let diagnosisCalls = 0, copyCalls = 0
  diagnostic.bridge.diagnosePurchases = () => { diagnosisCalls++; return diagnosticResult.promise }
  diagnostic.bridge.copyPurchaseReport = async () => { copyCalls++ }
  const beforeDiagnostic = { ...diagnostic.api.getPlusSnapshot() }
  const diagnosis = diagnostic.api.diagnosePlusPurchases()
  await checkpoint()
  for (const action of ['diagnosePlusPurchases', 'purchasePlus', 'startPlusTrial', 'restorePlus', 'copyPlusPurchaseReport']) {
    await assert.rejects(() => diagnostic.api[action](), /finish the current App Store request/, `${action} cannot overlap the support check`)
  }
  const report = 'BestTake purchase check\nBuild: 4.2 (26)\nProducts returned: 0\nNo purchase was made.'
  diagnosticResult.resolve({ report })
  assert.equal(await diagnosis, report)
  assert.equal(diagnosisCalls, 1)
  assert.deepEqual(diagnostic.api.getPlusSnapshot(), beforeDiagnostic, 'The report is not purchase authorization and cannot change catalog availability')
  assert.equal(diagnostic.statusCalls.length, 1, 'Diagnostic completion does not silently refresh StoreKit products')
  assert.equal(diagnostic.api.canUsePlus(), false)
  await diagnostic.api.copyPlusPurchaseReport()
  assert.equal(copyCalls, 1, 'Copy delegates to the native local clipboard method')
  assert.deepEqual(diagnostic.api.getPlusSnapshot(), beforeDiagnostic)
  diagnostic.bridge.copyPurchaseReport = async () => { throw new Error('Clipboard unavailable') }
  await assert.rejects(() => diagnostic.api.copyPlusPurchaseReport(), /Clipboard unavailable/)
  diagnostic.bridge.diagnosePurchases = async () => ({ report })
  assert.equal(await diagnostic.api.diagnosePlusPurchases(), report, 'A failed clipboard operation releases the shared action guard')
  diagnostic.bridge.diagnosePurchases = async () => ({ report: '' })
  await assert.rejects(() => diagnostic.api.diagnosePlusPurchases(), /no report/)
  diagnostic.bridge.diagnosePurchases = async () => ({ report })
  assert.equal(await diagnostic.api.diagnosePlusPurchases(), report, 'A failed support check can be retried')

  console.log('PASS: Plus refresh progress/coalescing, forced retries, product recovery, verified access, listener recovery, native revision ordering, restore ordering, and local diagnostic/copy action isolation.')
} finally {
  if (previousFixtures === undefined) delete globalThis[fixturesKey]
  else globalThis[fixturesKey] = previousFixtures
}

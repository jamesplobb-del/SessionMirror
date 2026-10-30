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

  console.log('PASS: Plus refresh progress/coalescing, explicit product retry, product error recovery, preserved verified access on bridge failure, listener recovery, and foreground refresh.')
} finally {
  if (previousFixtures === undefined) delete globalThis[fixturesKey]
  else globalThis[fixturesKey] = previousFixtures
}

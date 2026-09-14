import assert from 'node:assert/strict'
import { build } from 'esbuild'
const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
}
const bundle = await build({ entryPoints: ['src/utils/featureGuidance.ts'], bundle: true,
  write: false, format: 'esm', platform: 'node' })
const { createGuidanceState, guidanceReducer: reduce, GUIDE_COOLDOWN_MS, GUIDE_EXPIRY_MS,
  readGuidancePreferences, writeGuidancePreferences } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const fresh = () => createGuidanceState({ enabled: true, seen: [] })
const request = (state, id, now = 1000) => reduce(state, { type: 'request', id, now })
const start = (state, id, now = 2000) => reduce(state, { type: 'start', id, now })

let state = start(request(fresh(), 'workspace'), 'workspace')
assert.equal(state.active.step, 0)
state = reduce(state, { type: 'advance', now: 3000 })
assert.equal(state.active.step, 1, 'Next must advance without requiring an action')
state = reduce(state, { type: 'advance', now: 4000 })
assert.equal(state.active, null)
assert.deepEqual(state.preferences.seen, ['workspace'])
assert.equal(start(request(state, 'workspace', 60000), 'workspace', 62000).active, null,
  'Completed guides must never restart automatically')

state = start(request(fresh(), 'best-take'), 'best-take')
state = reduce(state, { type: 'dismiss', now: 3000 })
assert.equal(state.active, null)
assert(state.preferences.seen.includes('best-take'), 'Skip must persist for that feature')
state = request(state, 'hands-free', 3500)
assert.equal(start(state, 'hands-free', 4000).active, null, 'Skip must not cause an immediate next tutorial')
state = start(state, 'hands-free', 3000 + GUIDE_COOLDOWN_MS)
assert.equal(state.active.id, 'hands-free', 'Skipping one feature must not disable all others')
state = reduce(state, { type: 'dismiss', now: 50000 })
state = start(request(state, 'workspace', 100000), 'workspace', 102000)
assert.equal(state.active, null, 'At most two automatic guides per mounted session')

state = request(fresh(), 'workspace')
state = reduce(state, { type: 'learned', id: 'workspace', now: 1500 })
assert.equal(start(state, 'workspace').active, null, 'Successful use before display must suppress redundant teaching')
assert.equal(state.pending.length, 0)
state = start(request(fresh(), 'hands-free'), 'hands-free')
state = reduce(state, { type: 'learned', id: 'hands-free', now: 2500 })
assert.equal(state.active, null, 'Starting a hands-free take must stop its guide')

state = request(fresh(), 'best-take')
assert.equal(start(state, 'best-take', GUIDE_EXPIRY_MS + 2000).active, null,
  'A stale recording event must not produce an unrelated tutorial much later')
state = reduce(state, { type: 'expire', now: GUIDE_EXPIRY_MS + 2000 })
assert.equal(state.pending.length, 0, 'Expired requests must stop background polling')
state = start(request(fresh(), 'workspace'), 'workspace')
state = reduce(state, { type: 'preferences', preferences: { enabled: false, seen: [] }, reset: false })
assert.equal(state.active, null, 'Turning tips off must dismiss the active guide')
assert.equal(request(state, 'hands-free').pending.length, 0)
state = reduce(state, { type: 'preferences', preferences: { enabled: true, seen: [] }, reset: true })
assert.equal(state.shown, 0)
assert.equal(start(request(state, 'hands-free'), 'hands-free').active.id, 'hands-free')

writeGuidancePreferences({ enabled: false, seen: ['workspace'] })
assert.deepEqual(readGuidancePreferences(), { enabled: false, seen: ['workspace'] })
globalThis.localStorage = { getItem: () => { throw Error('Unavailable') }, setItem: () => { throw Error('Unavailable') } }
writeGuidancePreferences({ enabled: true, seen: ['hands-free'] })
assert.deepEqual(readGuidancePreferences(), { enabled: true, seen: ['hands-free'] },
  'Unavailable storage must retain dismissals in memory')
console.log('Feature guidance checks passed: progression, skip, learned actions, cooldown, session cap, expiry, preferences, storage fallback.')

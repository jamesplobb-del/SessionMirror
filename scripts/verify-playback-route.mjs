import assert from 'node:assert/strict'
import { build } from 'esbuild'
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const transitions = []
let prepareGate = deferred(), restoreGate = deferred(), rejectHold = false
let nativeEnded
globalThis.__routeMock = {
  addListener: async (_name, callback) => { nativeEnded = callback; return { remove: async () => {} } },
  setPlaybackRouteActive: async ({ active }) => { transitions.push(active ? 'hold' : 'release'); if (active && rejectHold) throw Error('route unavailable') },
  prepareCameraLikePlaybackSession: async () => { transitions.push('prepare'); await prepareGate.promise; return { playbackRouteStyle: 'loud' } },
  restoreRecordingRouteAfterPlayback: async () => { transitions.push('restore'); await restoreGate.promise },
}
const plugin = { name: 'route-boundaries', setup(b) {
  b.onResolve({ filter: /^@capacitor\/core$|\.\/(audioSessionRoute|headphoneOutput|stereoPlaybackRoute|audioPlaybackDiagnostics)$/ }, a => ({ path: a.path, namespace: 'mock' }))
  b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents:
    a.path === '@capacitor/core' ? "export const Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' }" :
    a.path.endsWith('audioSessionRoute') ? 'export default globalThis.__routeMock' :
    a.path.endsWith('headphoneOutput') ? 'export const isHeadphoneOutputActive = () => false' :
    a.path.endsWith('stereoPlaybackRoute') ? 'export const engageStereoPlaybackAsync = async () => {}; export const releaseStereoPlayback = async () => {}' :
    'export const getActivePlaybackDiagSession = () => null; export const logAudioSessionSnapshot = () => {}; export const logRouteTransition = () => {}'
  }))
} }
const result = await build({ entryPoints: ['src/utils/playbackRouteCoordinator.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [plugin] })
const route = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
route.installPlaybackRouteEndedListener(async () => {})
const flush = () => new Promise(r => setImmediate(r))
const first = route.preparePlaybackRoute()
let secondReady = false
const second = route.preparePlaybackRoute().then(() => { secondReady = true })
await flush()
assert.equal(secondReady, false, 'Second player must await native preparation')
prepareGate.resolve()
await Promise.all([first, second])
assert.deepEqual(transitions, ['hold', 'prepare'])
const restore = route.completePlaybackRouteRestore()
const next = route.preparePlaybackRoute()
await flush()
assert.deepEqual(transitions, ['hold', 'prepare', 'restore'], 'New playback cannot race an old route restore')
nativeEnded()
restoreGate.resolve()
await Promise.all([restore, next])
await flush()
assert.deepEqual(transitions, ['hold', 'prepare', 'restore', 'release', 'hold', 'prepare'])
assert.equal(route.isPlaybackRouteHoldActive(), true, 'Delayed end event from the old route cannot clear the new route')
await route.completePlaybackRouteRestore()
rejectHold = true
await assert.rejects(route.preparePlaybackRoute())
assert.equal(route.isPlaybackRouteHoldActive(), false, 'Failed native hold must not wedge JS in a ready state')
rejectHold = false
await route.preparePlaybackRoute()
assert.equal(route.isPlaybackRouteHoldActive(), true, 'A failed preparation must allow a later retry')
await route.clearPlaybackRouteForLifecycle()
assert.equal(route.isPlaybackRouteHoldActive(), false)
console.log('Playback route checks passed: pending preparation, ordered restore/replay, native rejection, retry, and lifecycle cleanup.')

import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function load(entry, plugins = []) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', plugins })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const { createAudioRecovery } = await load('src/utils/audioRecovery.ts')
const recovery = createAudioRecovery()
const startup = deferred()
let fallbackCalls = 0
const first = recovery.run(async current => {
  await startup.promise
  if (!current()) return false
  fallbackCalls++
  return true
})
assert.equal(recovery.run(async () => { throw Error('Duplicate recovery') }), first)
recovery.cancel()
const next = deferred()
const second = recovery.run(async () => next.promise)
startup.resolve(false)
assert.equal(await first, false)
assert.equal(fallbackCalls, 0, 'Leaving during native startup must not open a WebKit microphone')
assert.equal(recovery.run(async () => false), second, 'Old completion must not clear the new pending operation')
next.resolve(true)
assert.equal(await second, true)

const { createAudioFrameFreshness } = await load('src/utils/audioFrameFreshness.ts')
const { advanceAutoStart } = await load('src/utils/autoStartGate.ts')
const read = createAudioFrameFreshness()
let since = null
let starts = 0
for (let now = 0; now < 1000; now += 48) {
  const freshness = read(0, now)
  if (freshness === 'stale' || freshness === 'gap') since = null
  if (freshness !== 'fresh' && freshness !== 'gap') continue
  const decision = advanceAutoStart(since, now, 0.5, 0.1, 180)
  since = decision.since
  if (decision.start) starts++
}
assert.equal(starts, 0, 'One loud chunk replayed by a poll timer cannot trigger recording')
const freshRead = createAudioFrameFreshness()
since = null
for (let now = 0; now <= 240; now += 48) {
  assert.equal(freshRead(now, now), 'fresh')
  const decision = advanceAutoStart(since, now, 0.5, 0.1, 180)
  since = decision.since
  if (now >= 192) assert.equal(decision.start, true, 'Continuous real audio still starts promptly')
}
assert.equal(freshRead(600, 600), 'gap', 'A missing section of audio must break continuity')
assert.equal(freshRead(550, 620), 'stale', 'Out-of-order frames cannot count as new audio')

const registration = deferred()
let receive, registrations = 0, removals = 0, startsNative = 0, stopsNative = 0
let startResult = Promise.resolve({ active: true })
const tapChanges = []
const deliveryModes = []
globalThis.window = new EventTarget()
globalThis.__audioLifecycleMock = {
  addListener: (_event, callback) => { registrations++; receive = callback; return registration.promise },
  startNativeTunerMonitor: () => { startsNative++; return startResult },
  stopNativeTunerMonitor: async () => { stopsNative++; return { active: false } },
  setNativeAudioTapEnabled: async ({ enabled, completionDelivery }) => { tapChanges.push(enabled); deliveryModes.push(completionDelivery) },
}
const boundary = { name: 'native-boundary', setup(builder) {
  builder.onResolve({ filter: /\/(audioSessionRoute|nativeCameraTest|cameraSessionState)$/ }, args => ({ path: args.path, namespace: 'mock' }))
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
    args.path.endsWith('audioSessionRoute') ? 'export default globalThis.__audioLifecycleMock' :
    args.path.endsWith('nativeCameraTest') ? 'export const isNativeCameraTestAvailable = () => true' :
    'export const isNativeCaptureSessionActive = () => false; export const setNativeAudioCaptureActive = () => {}'
  }))
} }
const tap = await load('src/utils/nativeAudioPitchTap.ts', [boundary])
let oldFrames = 0, newFrames = 0
const old = await tap.subscribeNativeAudioPitchFrames(() => oldFrames++)
const removing = old.remove()
const current = await tap.subscribeNativeAudioPitchFrames(() => newFrames++)
registration.resolve({ remove: async () => { removals++ } })
await removing
const pcmBase64 = Buffer.from(new Float32Array([0.2, -0.2]).buffer).toString('base64')
receive({ pcmBase64, sampleRate: 48000 })
assert.equal(oldFrames, 0)
assert.equal(newFrames, 1, 'New tool receives audio after leaving a tool during bridge registration')
// Exercise the actual new event receiver through repeated delivery and tool changes.
for (let i = 0; i < 3000; i++) window.dispatchEvent(new CustomEvent('besttake:native-pitch-frame', { detail: { pcmBase64, sampleRate: 48000 } }))
assert.equal(newFrames,3001,'Completion delivery keeps flowing past the first two frames without an acknowledgement RPC')
await current.remove()
window.dispatchEvent(new CustomEvent('besttake:native-pitch-frame', {detail:{pcmBase64,sampleRate:48000}}))
assert.equal(newFrames,3001,'No consumer receives frames after leaving')
for (let i = 0; i < 100; i++) {
  const handle = await tap.subscribeNativeAudioPitchFrames(() => {})
  await handle.remove()
}
assert.equal(registrations, 1)
assert.equal(removals, 0)
await tap.acquireNativeAudioTap()
await tap.acquireNativeAudioTap()
await tap.releaseNativeAudioTap()
assert.equal(deliveryModes[0],true,'Negotiate completion delivery only after receiver registration')
assert.deepEqual(tapChanges, [true], 'A remaining consumer keeps the native tap')
await tap.releaseNativeAudioTap()
assert.deepEqual(tapChanges, [true, false])
await tap.acquireNativeTunerMonitor()
const nativeRecovery = deferred()
startResult = nativeRecovery.promise
const repairs = Array.from({ length: 20 }, () => tap.recoverNativeTunerMonitor())
await new Promise(resolve => setImmediate(resolve))
assert.equal(startsNative, 2, 'A burst of repair requests starts native recovery only once')
const release = tap.releaseNativeTunerMonitor()
nativeRecovery.resolve({ active: true })
assert.ok((await Promise.all(repairs)).every(active => !active), 'Abandoned recovery cannot report a live tuner')
await release
assert.equal(stopsNative, 1, 'Leaving during repair must restore the native route only once')
console.log('Audio lifecycle passed: cancelled startup, shared recovery, fresh-frame triggering, rapid tool switches, and shared tap ownership.')

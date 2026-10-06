import assert from 'node:assert/strict'
import { build } from 'esbuild'

const listeners = new Map()
const nativeListeners = new Map()
const storage = new Map()
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
globalThis.window = {
  addEventListener(name, fn) { const list = listeners.get(name) ?? []; list.push(fn); listeners.set(name, list) },
  setTimeout, clearTimeout, setInterval, clearInterval,
}
globalThis.document = { visibilityState: 'visible', addEventListener: window.addEventListener }
const native = { playing: false, starts: 0, stops: 0, muted: false, gate: null, statusGate: null }
globalThis.__backgroundNative = native
globalThis.__backgroundListeners = nativeListeners
const noop = 'async () => {}'
const mocks = {
  '@capacitor/core': "export const Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' }",
  '@capacitor/app': "export const App = { addListener: async (name, fn) => { globalThis.__backgroundListeners.set(name, fn); return { remove() {} } } }",
  nativeMetronome: `const n = globalThis.__backgroundNative;
    export const isNativeIosMetronome = () => true;
    export const nativeMetronomeStart = async payload => { n.startPayload = structuredClone(payload); n.timing = structuredClone(payload); n.starts++; const ok = !n.failStart; n.playing = ok; if(n.gate) await n.gate; return ok ? {playing:true,firstClickPerfMs:0} : null };
    export const nativeMetronomeStop = async () => { n.stops++; n.playing = false };
    export const nativeMetronomeIsPlaying = async () => { const playing = n.statusUnknown ? null : n.playing; if(n.statusGate) await n.statusGate; return playing };
    export const nativeMetronomeSetMuted = async muted => { n.muted = muted };
    export const nativeMetronomePrepare = async () => true;
    export const nativeMetronomeUpdate = async payload => { n.updates = (n.updates ?? 0) + 1; n.timing = structuredClone(payload) };
    export const nativeMetronomeAddPulseListener = ${noop};
    export const nativeMetronomeAddBarListener = ${noop};
    export const nativeMetronomeAddStateListener = async fn => { n.onState = fn };`,
  audioSessionRoute: 'export default {}',
  headphoneOutput: 'export const isHeadphoneOutputActive = () => false',
  stereoPlaybackRoute: `export const engageStereoPlaybackAsync = ${noop}; export const releaseStereoPlayback = ${noop}`,
  playbackRouteCoordinator: `export const isPlaybackRouteHoldActive = () => true; export const preparePlaybackRoute = ${noop}; export const reassertPlaybackRouteForCountIn = async () => { if(globalThis.__backgroundNative.routeGate) await globalThis.__backgroundNative.routeGate }`,
  playbackAudioContext: 'export const primePlaybackAudioContextSync = () => null; export const resumePlaybackAudioContext = async () => { if(globalThis.__backgroundNative.failFallback) throw Error("Test fallback unavailable") }',
}
const result = await build({ entryPoints: ['src/metronome/sharedMetronomeEngine.ts'], bundle: true, write: false, platform: 'node', format: 'esm', define: {'import.meta.env.DEV': 'false'}, plugins: [{ name: 'native-boundaries', setup(b) {
  b.onResolve({ filter: /.*/ }, args => { const key = mocks[args.path] ? args.path : args.path.split('/').at(-1); if(mocks[key]) return {path:key, namespace:'mock'} })
  b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({contents: mocks[args.path]}))
} }] })
const {sharedMetronomeEngine: engine} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const flush = () => new Promise(resolve => setImmediate(resolve))
// Production shared engine; fixtures replace only browser/native audio boundaries.
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return {promise, resolve} }
const settleStop = async () => { engine.stop(); await flush(); await flush() }
const updates = () => native.updates ?? 0
const base = () => { engine.setMeter('4/4'); engine.setSubdivision('off'); engine.setBpm(80); engine.setSoundId('classic') }
base()
// A normal Start needs no additional timing update.
const firstUpdates = updates()
assert.equal(await engine.start(), true)
assert.equal(updates(), firstUpdates)
assert.equal(native.timing.secondsPerTick, .75)
await settleStop()

// Start has submitted its old payload; every control remains available while awaiting the reply.
base()
let gate = deferred(); native.gate = gate.promise
let start = engine.start(); await flush()
assert.equal(engine.getSnapshot().playing, false)
assert.equal(native.startPayload.secondsPerTick, .75)
const beforeEdits = updates()
engine.setBpm(160)
engine.setMeter('3/4')
engine.setSubdivision('16ths')
engine.setAccentLevels(['weak', 'medium', 'strong'])
engine.setSoundId('woodblock')
assert.equal(updates(), beforeEdits, 'Timing edits defer while the Start acknowledgement is pending')
gate.resolve(); assert.equal(await start, true); native.gate = null; await flush()
assert.equal(updates(), beforeEdits + 1, 'Successful Start reconciles the latest settings once')
assert.equal(native.timing.secondsPerTick, 60 / 160 / 4)
assert.equal(native.timing.ticksPerBar, 12)
assert.equal(native.timing.pulseTicks, 4)
assert.equal(native.timing.soundId, 'woodblock')
assert.equal(native.timing.tierPattern[0], 'beat')
assert.equal(native.timing.tierPattern[4], 'macro')
assert.equal(native.timing.tierPattern[8], 'downbeat')
assert.deepEqual(engine.getSnapshot().accentLevels, ['weak', 'medium', 'strong'])
await settleStop()

// Changes during route preparation are captured by Start itself, not replayed afterward.
base(); gate = deferred(); native.routeGate = gate.promise
start = engine.start(); await flush()
engine.setBpm(144); engine.setSoundId('soft')
const beforeRouteAck = updates()
gate.resolve(); assert.equal(await start, true); native.routeGate = null; await flush()
assert.equal(native.startPayload.secondsPerTick, 60 / 144)
assert.equal(native.startPayload.soundId, 'soft')
assert.equal(updates(), beforeRouteAck)
await settleStop()

// A late old acknowledgement after Stop cannot reconcile timing or undo Stop.
base(); gate = deferred(); native.gate = gate.promise
start = engine.start(); await flush()
engine.setBpm(200); engine.setMeter('6/8'); engine.setPulseMode('simple-eighth')
engine.stop()
assert.equal(await engine.start(), false, 'A newer Start waits until the pending native control settles')
const beforeStaleAck = updates()
gate.resolve(); assert.equal(await start, false); native.gate = null; await flush()
assert.equal(updates(), beforeStaleAck)
assert.equal(engine.getSnapshot().playing, false)
assert.equal(native.playing, false)
assert.equal(await engine.start(), true, 'A subsequent Start accepts the latest settings after the old reply settles')
assert.equal(native.startPayload.secondsPerTick, .3)
assert.equal(native.startPayload.pulseTicks, 1)
assert.equal(native.startPayload.ticksPerBar, 6)
assert.equal(updates(), beforeStaleAck, 'Old revisions cannot leak into the new Start')
await settleStop()

// A rejected native reply plus unavailable fallback cannot emit reconciliation; retry stays usable.
base(); gate = deferred(); native.gate = gate.promise; native.failStart = true; native.failFallback = true
start = engine.start(); await flush()
engine.setBpm(150); engine.setSoundId('electronic')
const beforeFailure = updates()
gate.resolve(); await assert.rejects(start, /Test fallback unavailable/)
native.gate = null; native.failStart = false; native.failFallback = false; await flush()
assert.equal(updates(), beforeFailure)
assert.equal(engine.getSnapshot().playing, false)
assert.equal(await engine.start(), true)
assert.equal(native.startPayload.secondsPerTick, .4)
assert.equal(native.startPayload.soundId, 'electronic')
assert.equal(updates(), beforeFailure)
await settleStop()

// A synchronous subscriber Stop when success is published also invalidates reconciliation.
base(); gate = deferred(); native.gate = gate.promise
start = engine.start(); await flush(); engine.setBpm(180)
const beforeSubscriberStop = updates()
const unsubscribe = engine.subscribe(() => { if(engine.getSnapshot().playing) engine.stop() })
gate.resolve(); await start; native.gate = null; unsubscribe(); await flush()
assert.equal(engine.getSnapshot().playing, false)
assert.equal(native.playing, false)
assert.equal(updates(), beforeSubscriberStop)
console.log('PASS: native Start uses latest pending BPM/meter/subdivision/accents/sound; pre-dispatch changes, delayed reply after Stop/new Start, failure/retry and subscriber Stop respect control generations.')

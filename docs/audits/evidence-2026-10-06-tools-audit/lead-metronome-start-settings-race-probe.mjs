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
    export const nativeMetronomeStart = async payload => { n.startPayload = structuredClone(payload); n.starts++; n.playing = true; if(n.gate) await n.gate; return {playing:true,firstClickPerfMs:0} };
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
  playbackRouteCoordinator: `export const isPlaybackRouteHoldActive = () => true; export const preparePlaybackRoute = ${noop}; export const reassertPlaybackRouteForCountIn = ${noop}`,
  playbackAudioContext: 'export const primePlaybackAudioContextSync = () => null; export const resumePlaybackAudioContext = async () => {}',
}
const result = await build({ entryPoints: ['src/metronome/sharedMetronomeEngine.ts'], bundle: true, write: false, platform: 'node', format: 'esm', define: {'import.meta.env.DEV': 'false'}, plugins: [{ name: 'native-boundaries', setup(b) {
  b.onResolve({ filter: /.*/ }, args => { const key = mocks[args.path] ? args.path : args.path.split('/').at(-1); if(mocks[key]) return {path:key, namespace:'mock'} })
  b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({contents: mocks[args.path]}))
} }] })
const {sharedMetronomeEngine: engine} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const flush = () => new Promise(resolve => setImmediate(resolve))
const emit = async (name) => { for(const fn of listeners.get(name) ?? []) fn(); await flush() }
const background = async () => { document.visibilityState = 'hidden'; await emit('visibilitychange'); nativeListeners.get('appStateChange')?.({isActive:false}); await emit('sessionmirror:app-background-suspend') }
const foreground = async () => { document.visibilityState = 'visible'; await emit('visibilitychange'); nativeListeners.get('appStateChange')?.({isActive:true}); await flush() }
// Audit reproduction: bundle the actual shared engine; mock native/browser boundaries only.
engine.setMeter('4/4')
engine.setSubdivision('off')
engine.setBpm(80)
engine.setSoundId('classic')
let releaseStart
native.gate = new Promise(resolve => { releaseStart = resolve })
const starting = engine.start()
await flush()
assert.equal(native.startPayload.secondsPerTick, 0.75)
assert.equal(engine.getSnapshot().playing, false, 'UI remains in Start state pending bridge acknowledgement')
engine.setBpm(160)
engine.setMeter('3/4')
engine.setSoundId('wood')
assert.equal(native.updates ?? 0, 0, 'Production setter skips update while snapshot.playing is false')
releaseStart()
assert.equal(await starting, true)
await flush()
const displayed = engine.getSnapshot()
assert.equal(displayed.bpm,160)
assert.equal(displayed.meter,'3/4')
assert.equal(displayed.soundId,'wood')
assert.equal(native.startPayload.secondsPerTick,0.75)
assert.equal(native.startPayload.ticksPerBar,4)
assert.equal(native.startPayload.soundId,'classic')
assert.equal(native.updates ?? 0,0,'Start acknowledgement never reconciles settings changed in flight')
console.log(JSON.stringify({evidence:'production shared engine with native bridge stub; no actual iOS playback',trigger:'change controls while start promise awaits native bridge acknowledgement',displayed:{bpm:displayed.bpm,meter:displayed.meter,soundId:displayed.soundId},nativeAcceptedPayload:native.startPayload,nativeTimingUpdates:native.updates??0},null,2))
console.log('OBSERVED P2: accepted native start retains 80 BPM / 4/4 / classic while shared UI reports 160 BPM / 3/4 / wood; no timing update follows.')
engine.stop()
await flush()

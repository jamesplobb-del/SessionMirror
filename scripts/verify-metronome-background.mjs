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
    export const nativeMetronomeStart = async () => { n.starts++; n.playing = true; if(n.gate) await n.gate; return {playing:true,firstClickPerfMs:0} };
    export const nativeMetronomeStop = async () => { n.stops++; n.playing = false };
    export const nativeMetronomeIsPlaying = async () => { const playing = n.statusUnknown ? null : n.playing; if(n.statusGate) await n.statusGate; return playing };
    export const nativeMetronomeSetMuted = async muted => { n.muted = muted };
    export const nativeMetronomePrepare = async () => true;
    export const nativeMetronomeUpdate = ${noop};
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
engine.attachLifecycle()
assert.equal(await engine.start(), true)
await background()
assert.equal(native.stops, 0, 'Lock/app switch must not stop the native click')
assert.equal(engine.getSnapshot().playing, true)
await foreground()
assert.equal(native.starts, 1, 'Unlock must not restart timing or double the scheduler')
native.statusUnknown = true; await emit('focus')
assert.equal(engine.getSnapshot().playing, true, 'A failed status read cannot stop audible playback')
native.statusUnknown = false
await background()
engine.stop(); await flush(); await foreground()
assert.equal(native.playing, false, 'Explicit Stop is respected on return')
assert.equal(native.starts, 1)
await engine.start(); await background()
native.playing = false // Native interruption (call/Siri) while JS is suspended.
await foreground()
assert.equal(engine.getSnapshot().playing, false, 'UI reconciles a native interruption')
assert.equal(native.starts, 2, 'A call must not trigger an unsolicited restart')
// A native Start already accepted before lock may resolve after WebKit hides.
let release
native.gate = new Promise(resolve => { release = resolve })
const starting = engine.start(); await flush(); await background(); release()
assert.equal(await starting, true)
assert.equal(native.playing, true, 'An accepted user Start survives delayed bridge delivery')
native.gate = null; await foreground(); engine.stop(); await flush()
// A late foreground read from before a newer Start cannot cancel that Start.
native.statusGate = new Promise(resolve => { release = resolve })
await emit('focus'); await engine.start(); release(); native.statusGate = null; await flush()
assert.equal(engine.getSnapshot().playing, true, 'Stale reconciliation cannot cancel new playback')
engine.stop(); await flush()
await engine.start(); native.playing = false; native.onState({playing:false}); await flush()
assert.equal(engine.getSnapshot().playing, false, 'Foreground interruptions update controls immediately')
console.log('PASS: background continuity, no duplicate start on unlock, explicit stop, native interruption, delayed Start and stale foreground response.')

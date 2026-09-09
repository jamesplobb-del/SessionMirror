import assert from 'node:assert/strict'
import { build } from 'esbuild'
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const initial = deferred(), stopping = deferred(), recovery = deferred()
const cleanups = [], timers = [], events = new Map()
let restores = 0, recoveries = 0
const base = { activeNotes: [], enabled: false, octave: 4, volume: 1, waveform: 'sine', lastPitchClass: null }
globalThis.window = { addEventListener: (name, callback) => events.set(name, callback), setTimeout: callback => timers.push(callback), clearTimeout() {} }
globalThis.__droneTest = {
  effect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup) },
  base,
  restore: options => ++restores === 1 ? initial.promise : Promise.resolve({ ...options, enabled: options.activeNotes.length > 0 }),
  stop: () => stopping.promise,
  start: () => { recoveries++; return recovery.promise },
  getState: async () => base,
}
const plugin = { name: 'drone-boundaries', setup(b) {
  b.onResolve({ filter: /^react$|\.\.\/utils\/(droneEngine|appForeground|dronePrefs|haptics)$/ }, a => ({ path: a.path, namespace: 'mock' }))
  b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents:
    a.path === 'react' ? 'export const useCallback = fn => fn; export const useEffect = globalThis.__droneTest.effect; export const useSyncExternalStore = (_s, get) => get();' :
    a.path.endsWith('droneEngine') ? `export const isDroneNativeAvailable = () => true;
      export const droneRestoreState = globalThis.__droneTest.restore, droneStop = globalThis.__droneTest.stop,
      droneStart = globalThis.__droneTest.start, droneGetState = globalThis.__droneTest.getState;
      export const droneSetOctave = async () => {}, droneSetVolume = async () => {}, droneSetWaveform = async () => {}, droneSoloNote = async () => {}, droneToggleNote = async () => {};` :
    a.path.endsWith('dronePrefs') ? 'export const loadDronePrefs = () => globalThis.__droneTest.base; export const saveDronePrefs = () => {};' :
    a.path.endsWith('appForeground') ? "export const APP_INTERACTIVE_MEDIA_RECOVERY_EVENT = 'recover'" :
    'export const triggerLightHaptic = () => {};'
  }))
} }
const result = await build({ entryPoints: ['src/hooks/useDrone.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [plugin] })
const drone = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const flush = () => new Promise(r => setImmediate(r))
const controls = drone.useDrone({ volume: 1, waveform: 'sine' })
controls.setNotes([7])
await flush()
initial.resolve(base)
await flush()
assert.deepEqual(drone.readDroneState().activeNotes, [7], 'Late initial restoration cannot erase a newly selected note')
events.get('recover')()
events.get('recover')()
assert.equal(recoveries, 1, 'Foreground recovery events share one drone restart')
controls.setNotes([4])
await flush()
recovery.resolve(base)
await flush()
assert.deepEqual(drone.readDroneState().activeNotes, [4], 'Late recovery cannot overwrite a newer choice')
cleanups[0]()
timers.at(-1)()
controls.setNotes([2])
await flush()
stopping.resolve(base)
await flush()
assert.deepEqual(drone.readDroneState().activeNotes, [2], 'Old screen cleanup cannot clear a new drone command')
console.log('Drone checks passed: initial restoration, shared recovery, and stale stop responses preserve newer commands.')

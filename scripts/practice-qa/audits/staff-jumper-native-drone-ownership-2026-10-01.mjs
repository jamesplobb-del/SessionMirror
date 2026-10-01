import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const tempDir = await mkdtemp('/tmp/staff-jumper-drone-qa-')
const outfile = join(tempDir, 'staff-jumper-audio.mjs')
const qa = {
  connected: true,
  calls: [],
  gates: new Map(),
  listeners: new Set(),
  webContextCalls: 0,
  webGraphStarted: false,
  allowWebFallback: false,
  contextGate: null,
  active: false,
  activePitch: null,
  tunerState: { activeNotes: [11], octave: 3, volume: 0.42, waveform: 'triangle' },
  currentState: { activeNotes: [11], octave: 3, volume: 0.42, waveform: 'triangle' },
  copyState(state) { return { ...state, activeNotes: [...state.activeNotes] } },
  reset() {
    this.calls = []
    this.gates = new Map()
    this.connected = true
    this.active = false
    this.activePitch = null
    this.currentState = this.copyState(this.tunerState)
    this.webContextCalls = 0
    this.webGraphStarted = false
    this.allowWebFallback = false
    this.contextGate = null
  },
  setConnected(connected) {
    this.connected = connected
    for (const listener of [...this.listeners]) listener(connected)
  },
  defer(name, occurrence = 1) {
    let resolve
    let reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    this.gates.set(`${name}:${occurrence}`, promise)
    return { resolve, reject }
  },
  count(name) { return this.calls.filter((call) => call.name === name).length },
  async call(name, args, result) {
    const occurrence = this.count(name) + 1
    this.calls.push({ name, args })
    const gate = this.gates.get(`${name}:${occurrence}`)
    if (gate) await gate
    this.calls.push({ name: `${name}:complete` })
    if (name === 'droneStart') this.active = true
    if (name === 'droneStop') { this.active = false; this.activePitch = null }
    if (name === 'droneSetOctave') this.currentState.octave = args[0]
    if (name === 'droneSetVolume') this.currentState.volume = args[0]
    if (name === 'droneSoloNote') {
      this.activePitch = args[0]
      this.currentState.activeNotes = [args[0]]
      this.currentState.octave = args[1]
    }
    if (name === 'droneRestoreState') this.currentState = this.copyState(args[0])
    return typeof result === 'function' ? result() : result
  },
}
globalThis.__staffJumperDroneQA = qa

const plugin = {
  name: 'mock-native-drone-and-routes',
  setup(buildApi) {
    const virtual = new Map([
      ['../gameAudioContext', `export async function getGameAudioContext(){ const q=globalThis.__staffJumperDroneQA; q.webContextCalls++; if(q.contextGate) return await q.contextGate; if(q.allowWebFallback) return { currentTime:0, destination:{}, createGain(){ return { gain:{ value:0, setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){}, disconnect(){} } }, createOscillator(){ q.calls.push({name:'webGraphCreated'}); return { type:'sine', frequency:{ value:0, cancelScheduledValues(){}, setValueAtTime(){}, linearRampToValueAtTime(){} }, connect(){}, start(){ q.webGraphStarted=true }, stop(){}, disconnect(){} } } }; throw Error('unexpected web fallback') }`],
      ['../../utils/metronomeClickSounds', 'export function scheduleMetronomeClick() {}'],
      ['../../utils/playbackVolume', 'export function metronomeSpeakerGain(){ return 1 }'],
      ['../../utils/headphoneOutput', `const q=globalThis.__staffJumperDroneQA; export const isConfirmedHeadphoneOutputActive=()=>q.connected; export function subscribeConfirmedHeadphoneOutput(listener){ q.listeners.add(listener); return ()=>q.listeners.delete(listener) }`],
      ['../../utils/droneEngine', `
        const q=globalThis.__staffJumperDroneQA;
        export const isDroneNativeAvailable=()=>true;
        export const droneGetState=()=>q.call('droneGetState',[],()=>q.copyState(q.currentState));
        export const droneSetOctave=(...a)=>q.call('droneSetOctave',a);
        export const droneSetVolume=(...a)=>q.call('droneSetVolume',a);
        export const droneSoloNote=(...a)=>q.call('droneSoloNote',a);
        export const droneStart=(...a)=>q.call('droneStart',a);
        export const droneStop=(...a)=>q.call('droneStop',a);
        export const droneRestoreState=(...a)=>q.call('droneRestoreState',a);
      `],
      ['./staffJumperRhythm', 'export const METERS={ simple:{ticksPerPulse:1,ticksPerBar:4,pulsesPerMeasure:4} }; export const secondsPerPulse=()=>1'],
    ])
    buildApi.onResolve({ filter: /.*/ }, (args) => virtual.has(args.path) ? { path: args.path, namespace: 'sj-qa' } : null)
    buildApi.onLoad({ filter: /.*/, namespace: 'sj-qa' }, (args) => ({ contents: virtual.get(args.path), loader: 'js' }))
  },
}

async function waitForCall(name, occurrence = 1) {
  for (let i = 0; i < 200; i += 1) {
    if (qa.count(name) >= occurrence) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`timed out waiting for ${name} #${occurrence}; saw ${JSON.stringify(qa.calls)}`)
}

try {
  await build({
    entryPoints: ['src/labs/staffJumper/staffJumperAudio.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    plugins: [plugin],
  })
  const { startClickTrack, startDrone } = await import(pathToFileURL(outfile).href)
  const checkCancelledRestart = async (deferredOperation) => {
    qa.reset()
    const gate = qa.defer(deferredOperation)
    let olderCurrent = true
    const older = startDrone(1, 4, 0.85, () => olderCurrent).then(
      (handle) => ({ handle }),
      (error) => ({ error }),
    )
    await waitForCall(deferredOperation)
    olderCurrent = false
    const newer = startDrone(4, 5, 0.85, () => true)
    gate.resolve()
    const oldResult = await older
    assert.ok(oldResult.error, `older startup cancelled while ${deferredOperation} is pending`)
    assert.match(oldResult.error.message, /cancelled/i)
    const newHandle = await newer
    assert.equal(qa.active, true, `newer owner remains active after ${deferredOperation} race`)
    assert.equal(qa.activePitch, 4, `newer run's tonic remains active after ${deferredOperation} race`)
    assert.equal(qa.webContextCalls, 0, 'cancelled native startup never falls back to an overlapping web drone')
    const starts = qa.calls.filter((call) => call.name === 'droneStart')
    assert.equal(starts.at(-1).args[0], undefined)
    const solos = qa.calls.filter((call) => call.name === 'droneSoloNote')
    assert.deepEqual(solos.map((call) => call.args[0]), deferredOperation === 'droneGetState' ? [4] : [1, 4])
    await newHandle.stop(false)
    assert.equal(qa.active, false)
  }

  await checkCancelledRestart('droneGetState')
  await checkCancelledRestart('droneSoloNote')
  await checkCancelledRestart('droneStart')

  // The bridge's getState must model the live singleton after Solo/setting
  // changes; otherwise a replacement can accidentally adopt A as the tuner
  // snapshot and restore A's tonic when B exits.
  qa.reset()
  let cancelledStartCurrent = true
  const partialSoloGate = qa.defer('droneSoloNote')
  const partialA = startDrone(1, 4, 0.85, () => cancelledStartCurrent).then(
    (handle) => ({ handle }),
    (error) => ({ error }),
  )
  await waitForCall('droneSoloNote')
  cancelledStartCurrent = false
  const runB = startDrone(8, 5, 0.7, () => true)
  partialSoloGate.resolve()
  assert.ok((await partialA).error, 'cancelled partial A startup rejects')
  const runBHandle = await runB
  assert.deepEqual(qa.currentState.activeNotes, [8])
  await runBHandle.stop(true)
  assert.deepEqual(qa.currentState, qa.tunerState, 'B restores the original tuner snapshot, not cancelled A state')

  // If a pitch change is cancelled while its native call is in flight, the
  // eventual normal stop(true) must still own and restore the original snapshot.
  qa.reset()
  let pitchOwnerCurrent = true
  const pitchHandle = await startDrone(2, 4, 0.85, () => pitchOwnerCurrent)
  const inFlightPitchGate = qa.defer('droneSoloNote', 2)
  const changingPitch = pitchHandle.setPitch(9, 5).then(
    () => null,
    (error) => error,
  )
  await waitForCall('droneSoloNote', 2)
  pitchOwnerCurrent = false
  inFlightPitchGate.resolve()
  assert.match((await changingPitch).message, /cancelled/i, 'in-flight setPitch notices generation cancellation')
  await pitchHandle.stop(true)
  assert.deepEqual(qa.currentState, qa.tunerState, 'normal stop(true) still restores tuner state after cancelled setPitch')

  // The click transport also rechecks cancellation after its deferred context
  // acquisition, before it creates output nodes or starts its timer.
  qa.reset()
  let resolveContext
  qa.contextGate = new Promise((resolve) => { resolveContext = resolve })
  let clickCurrent = true
  const clickStartup = startClickTrack({ bpm: 80, soundId: 'classic', audible: false, countInBars: 1, meter: 'simple' }, () => clickCurrent)
  for (let i = 0; i < 200 && qa.webContextCalls === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(qa.webContextCalls, 1, 'click startup is waiting for the audio context')
  clickCurrent = false
  resolveContext({})
  await assert.rejects(clickStartup, /cancelled/i, 'stale click startup rejects after context resolution')

  // An older successfully returned handle may resolve late in React cleanup.
  // It must neither stop nor retune the newer native owner.
  qa.reset()
  const olderHandle = await startDrone(1, 4, 0.85, () => true)
  const newerHandle = await startDrone(7, 4, 0.85, () => true)
  assert.equal(qa.activePitch, 7, 'newer owner controls the native note')
  await olderHandle.setPitch(9, 5)
  assert.equal(qa.active, true, 'stale stop cannot stop the newer native owner')
  assert.equal(qa.activePitch, 7, 'stale setPitch cannot retune the newer native owner')
  await olderHandle.stop(false)
  assert.equal(qa.active, true, 'stale stop cannot stop the newer native owner')
  assert.equal(qa.count('droneRestoreState'), 0, 'stale stop never restores prior tuner state over the new owner')
  await newerHandle.stop(false)

  // Replacement startup must remain queued behind an older active handle's
  // stop and restore operations, regardless of which awaited bridge call stalls.
  for (const heldOperation of ['droneStop', 'droneRestoreState']) {
    qa.reset()
    const firstHandle = await startDrone(1, 4, 0.85, () => true)
    const gate = qa.defer(heldOperation)
    const firstStop = firstHandle.stop(true)
    await waitForCall(heldOperation)
    const callCountAtBarrier = qa.calls.length
    const replacement = startDrone(8, 4, 0.85, () => true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(qa.calls.length, callCountAtBarrier, `replacement native mutations wait while ${heldOperation} is pending`)
    gate.resolve()
    await firstStop
    const replacementHandle = await replacement
    assert.equal(qa.active, true, `replacement becomes sole active owner after ${heldOperation}`)
    assert.equal(qa.activePitch, 8, `replacement tonic survives ${heldOperation}`)
    await replacementHandle.stop(false)
  }

  // A failed native start may use web audio only after native cleanup settles.
  qa.reset()
  qa.allowWebFallback = true
  const cleanupGate = qa.defer('droneStop')
  const nativeStartFailure = qa.defer('droneStart')
  const failingStartup = startDrone(3, 4, 0.85, () => true)
  await waitForCall('droneStart')
  nativeStartFailure.reject(new Error('simulated native start failure'))
  await waitForCall('droneStop')
  assert.equal(qa.webGraphStarted, false, 'web graph is not created while native cleanup is pending')
  cleanupGate.resolve()
  const fallbackHandle = await failingStartup
  assert.equal(qa.webGraphStarted, true, 'web fallback begins after awaited native cleanup')
  assert.ok(qa.calls.findIndex((call) => call.name === 'droneStop:complete') < qa.calls.findIndex((call) => call.name === 'webGraphCreated'), 'native stop resolves before web graph creation')
  await fallbackHandle.stop(false)

  // If unplugged during an awaited restore, stop once more after the bridge
  // restore resolves so the restored drone cannot leak to the speaker.
  qa.reset()
  const restoringHandle = await startDrone(5, 4, 0.85, () => true)
  const restoreGate = qa.defer('droneRestoreState')
  const restoring = restoringHandle.stop(true)
  await waitForCall('droneRestoreState')
  qa.setConnected(false)
  restoreGate.resolve()
  await restoring
  await new Promise((resolve) => setTimeout(resolve, 0))
  const restoreIndex = qa.calls.findIndex((call) => call.name === 'droneRestoreState')
  assert.ok(qa.calls.slice(restoreIndex + 1).some((call) => call.name === 'droneStop'), 'route loss during restore triggers a subsequent native stop')
  assert.equal(qa.active, false)
  qa.setConnected(true)

  // A private route disappearing during native start must stop the partially
  // configured singleton and reject; reconnecting then permits a fresh owner.
  qa.reset()
  const startGate = qa.defer('droneStart')
  const disconnected = startDrone(2, 4, 0.85, () => true).then(
    (handle) => ({ handle }),
    (error) => ({ error }),
  )
  await waitForCall('droneStart')
  qa.setConnected(false)
  startGate.resolve()
  const disconnectResult = await disconnected
  assert.ok(disconnectResult.error, 'route loss cancels pending native startup')
  assert.match(disconnectResult.error.message, /cancelled|disconnected/i)
  assert.equal(qa.active, false, 'partial native drone is stopped after route loss')
  assert.equal(qa.webContextCalls, 0, 'route loss never falls back to web audio')
  assert.ok(qa.count('droneStop') >= 1, 'route-loss cleanup reaches the native stop operation')
  qa.setConnected(true)
  const reconnected = await startDrone(7, 4, 0.85, () => true)
  assert.equal(qa.active, true, 'a new startup succeeds after reconnection')
  await reconnected.stop(false)

  console.log('PASS: actual Staff Jumper audio module serializes startup, replacement, stop/restore and fallback cleanup across deferred native operations and route loss')
} finally {
  delete globalThis.__staffJumperDroneQA
  await rm(tempDir, { recursive: true, force: true })
}

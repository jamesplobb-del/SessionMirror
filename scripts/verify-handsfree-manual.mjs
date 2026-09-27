import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Exercise the actual UI/capture callbacks with a native recorder that can
// still be waiting for its first sample when the musician taps Record.
function callback(file, name, env) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      expression = node.initializer.arguments[0].getText(source)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(expression, name)
  const js = ts.transpileModule(`const fn = ${expression}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(env), `${js}; return fn`)(...Object.values(env))
}
const ref = current => ({ current })
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

function recorder() {
  let starts = 0, stops = 0
  const env = {
    autoPreRollActiveRef: ref(true), autoPerformanceActiveRef: ref(false), isRecordingRef: ref(false),
    captureSessionEpochRef: ref(1), activeTakeIdRef: ref('pre-roll'), nativeStartSettleRef: ref(null),
    autoPreRollStartedAtRef: ref(500), autoPerformanceStartedAtRef: ref(0),
    nativeExperimentalRecordingRef: ref(true), elapsedRef: ref(0),
    isNativeVideoRecordingEnabled: () => true, performance: { now: () => 1000 },
    setIsRecording() {}, setElapsed() {}, setError(error) { assert.fail(error) },
    startRecording: async () => { starts++; env.isRecordingRef.current = true; return true },
    stopRecording: () => { stops++; env.isRecordingRef.current = false },
  }
  env.tryMarkAutoPerformanceStart = callback('src/hooks/useCameraSession.ts', 'tryMarkAutoPerformanceStart', env)
  const toggle = callback('src/hooks/useCameraSession.ts', 'toggleRecording', env)
  return { env, toggle, get counts() { return { starts, stops } } }
}

let h = recorder()
h.toggle(); await flush()
assert.deepEqual(h.counts, { starts: 1, stops: 0 }, 'Manual tap promotes hidden pre-roll instead of stopping it')
assert.equal(h.env.autoPerformanceStartedAtRef.current, 1000, 'Manual promotion retains the correct replay onset')
h.toggle(); await flush()
assert.equal(h.counts.stops, 1, 'The next tap stops the visible take')

h = recorder()
const pending = deferred()
h.env.nativeStartSettleRef.current = pending.promise
h.env.autoPreRollStartedAtRef.current = 0
h.toggle(); h.toggle(); await flush()
assert.deepEqual(h.counts, { starts: 0, stops: 0 }, 'Taps during native startup must not cancel capture')
h.env.autoPreRollStartedAtRef.current = 900
pending.resolve(true); await flush()
assert.deepEqual(h.counts, { starts: 1, stops: 0 }, 'Pending manual start completes once when frames arrive')

h = recorder()
const leaving = deferred()
h.env.nativeStartSettleRef.current = leaving.promise
h.toggle()
h.env.captureSessionEpochRef.current++
leaving.resolve(true); await flush()
assert.equal(h.counts.starts, 0, 'A deferred tap must not start a take after the user leaves its capture session')

let toggles = 0
const onToggle = callback('src/App.tsx', 'handleToggleRecord', {
  practiceTransition: ref({ busy: false }), pendingTakeSavesRef: ref(new Set()),
  isRecording: false, settings: { autoSoundRecording: true },
  ready: false, recordingModeRef: ref('audio'),
  requestCameraAccess() { assert.fail('Manual Record must reach the recorder, not just reopen WebKit') },
  finishHandsFreeTake() { assert.fail('No visible take to finish') }, toggleRecording() { toggles++ },
})
onToggle()
assert.equal(toggles, 1, 'Audio Record works while WebKit readiness is false')
for (const phase of ['preparing', 'listening']) {
  const activate = callback('src/components/RecordingModeCarousel.tsx', 'handleSlotActivate', {
    value: 'video', handsFreePhase: phase, autoSoundRecording: true, isRecording: false, ready: false,
    hapticFeedback: false, triggerRecordStartHaptic() {}, triggerRecordStopHaptic() {},
    onToggleRecord() { toggles++ }, notifyTutorial: null, modeSwitchLocked: false,
    triggerModeSwitchHaptic() {}, onChange() {},
  })
  activate('video')
}
assert.equal(toggles, 3, 'Camera Record is available during hands-free calibration and listening')
console.log('PASS: manual pre-roll promotion, pending native start, duplicate taps, navigation cancellation, and audio/camera readiness bypass')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const ref = current => ({ current })
function callback(file, name, env) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer && ts.isCallExpression(node.initializer)) expression = node.initializer.arguments[0].getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(expression, name)
  const js = ts.transpileModule(`const fn = ${expression}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(env), `${js}; return fn`)(...Object.values(env))
}
// Execute the complete production hook with only React and DOM boundaries mocked.
const source = readFileSync('src/hooks/useLongPress.ts', 'utf8').replace(/^import[\s\S]*?from '..\/utils\/haptics'\s*/, '').replace(/^export /gm, '')
const hookJs = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const useLongPress = new Function('useRef', 'useCallback', 'useEffect', `${hookJs}; return useLongPress`)(ref, fn => fn, () => {})
let clickCount = 0, longCount = 0, timer, now = 1000
globalThis.performance = { now: () => now }
globalThis.window = { getSelection: () => null, clearTimeout() { timer = null }, setTimeout(fn) { timer = fn; return 1 } }
globalThis.document = { addEventListener() {}, removeEventListener() {} }
const event = detail => ({ detail, button: 0, pointerId: 1, preventDefault() {}, stopPropagation() {}, currentTarget: { setPointerCapture() {}, hasPointerCapture: () => false } })
const h = useLongPress({ onClick() { clickCount++ }, onLongPress() { longCount++ }, hapticFeedback: false })
h.onClickCapture(event(0)); h.onClickCapture(event(0))
assert.equal(clickCount, 2, 'Keyboard/assistive clicks each activate once')
h.onPointerDown(event(1)); h.onPointerUp(event(1)); h.onClickCapture(event(0))
assert.equal(clickCount, 3, 'Pointer release and native click activate only once')
h.onPointerDown(event(1)); timer(); h.onPointerUp(event(1)); h.onClickCapture(event(0))
assert.equal(longCount, 1); assert.equal(clickCount, 3, 'Long press suppresses its synthesized click')
h.onKeyDown({ key: 'Enter' }); h.onClickCapture(event(0)); assert.equal(clickCount, 4, 'Later keyboard activation works after long press')
h.onPointerDown(event(1)); h.onPointerCancel(event(1)); h.onPointerUp(event(1)); h.onClickCapture(event(0))
assert.equal(clickCount, 4, 'Cancelled pointer release does not record')
h.onKeyDown({ key: ' ' }); h.onClickCapture(event(0))
assert.equal(clickCount, 5, 'Space works immediately after cancellation')
h.onPointerDown(event(1)); h.onPointerCancel(event(1)); now += 501; h.onClickCapture(event(0))
assert.equal(clickCount, 6, 'An independent assistive activation works after pointer suppression expires')
const disabled = useLongPress({ disabled: true, onClick() { assert.fail('Disabled') }, onLongPress() { assert.fail('Disabled') } })
disabled.onClickCapture(event(0)); disabled.onPointerDown(event(1)); disabled.onPointerUp(event(1))
// Preserve hook slots and dependency-aware effects across an actual rerender.
const refs = [], callbacks = [], effects = []
let refIndex = 0, callbackIndex = 0, effectIndex = 0, pendingEffects = []
const changed = (a, b) => !a || a.length !== b.length || a.some((value, index) => value !== b[index])
const renderHook = new Function('useRef', 'useCallback', 'useEffect', `${hookJs}; return useLongPress`)(
  value => refs[refIndex++] ?? (refs[refIndex - 1] = ref(value)),
  (fn, deps) => { const index = callbackIndex++; if (changed(callbacks[index]?.deps, deps)) callbacks[index] = { fn, deps }; return callbacks[index].fn },
  (fn, deps) => { const index = effectIndex++; if (changed(effects[index]?.deps, deps)) pendingEffects.push(() => { effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: fn() } }) },
)
let listenerCount = 0, captured = false
const savedDocument = globalThis.document
globalThis.document = { addEventListener() { listenerCount++ }, removeEventListener() { listenerCount-- } }
const render = disabled => {
  refIndex = callbackIndex = effectIndex = 0
  const controls = renderHook({ disabled, hapticFeedback: false, onClick() { assert.fail('Disabled during press must not click') }, onLongPress() { assert.fail('Disabled during press must not long press') } })
  pendingEffects.splice(0).forEach(commit => commit())
  return controls
}
let active = render(false)
const pressEvent = { ...event(1), currentTarget: { setPointerCapture() { captured = true }, hasPointerCapture: () => captured, releasePointerCapture() { captured = false } } }
active.onPointerDown(pressEvent)
const staleTimer = timer
assert.equal(listenerCount, 2); assert.equal(captured, true)
active = render(true)
assert.equal(timer, null, 'Disabling clears the pending long-press timer')
assert.equal(listenerCount, 0, 'Disabling removes temporary document listeners')
assert.equal(captured, false, 'Disabling releases pointer capture')
staleTimer(); active.onPointerUp(pressEvent); active.onClickCapture(event(0))
globalThis.document = savedDocument
// Execute production recorder callbacks, then deliver saved late callback references.
for (const handsFree of [false, true]) {
  let alerts = 0, reports = 0, stopping = true, visible = true, warm = 0, aborts = 0
  const recorder = { state: 'recording' }
  const env = {
    chunksRef: ref([new Blob(['performance'])]), recordStreamRef: ref({}), streamRef: ref({}), recorderRef: ref(recorder),
    activeRecordingIdRef: ref('failed'), recordingStartMsRef: ref(10), recordingStartedAtRef: ref(10),
    autoPreRollActiveRef: ref(handsFree), autoPerformanceActiveRef: ref(handsFree), autoPreRollStartedAtRef: ref(10), autoPerformanceStartedAtRef: ref(20),
    isRecordingRef: ref(true), elapsedRef: ref(4), scheduleWarmAutoAudioRef: ref(() => warm++),
    reportError() { reports++ }, abortActiveWriter: async () => { aborts++ }, releaseRecorderStream() {},
    detachRecorder(r) { r.onstop = null; r.ondataavailable = null; r.onerror = null },
    setElapsed(v) { assert.equal(v, 0) }, setIsRecording(v) { visible = v }, setIsStopping(v) { stopping = v },
    restoreNativeAudioBridgeAfterWebKitCapture: async () => { if (handsFree) throw Error('route restore failed') }, showAlertOutsideTree(alert) { alerts++; assert.match(alert.message, /Tap Record/) },
  }
  callback('src/hooks/useCameraSession.ts', 'bindRecordingHandlers', env)(recorder, 'failed')
  const { onerror, onstop, ondataavailable } = recorder
  env.recorderRef.current = { state: 'recording' }
  onerror({ error: Error('old recorder error') })
  assert.equal(alerts, 0, 'An old recorder cannot fail a replacement capture')
  env.recorderRef.current = recorder
  onerror({ error: Error('encoder failure') }); onerror({ error: Error('duplicate failure') })
  env.recorderRef.current = { state: 'recording' }; env.activeRecordingIdRef.current = 'next'; env.chunksRef.current = [new Blob(['next'])]
  onstop(); ondataavailable({ data: new Blob(['late failed take']) })
  await Promise.resolve(); await Promise.resolve()
  assert.equal(alerts, 1); assert.equal(reports, 1); assert.equal(aborts, 1)
  assert.equal(visible, false); assert.equal(stopping, false); assert.equal(env.isRecordingRef.current, false)
  assert.equal(env.autoPreRollActiveRef.current, false); assert.equal(env.autoPerformanceActiveRef.current, false)
  assert.equal(env.autoPreRollStartedAtRef.current, 0); assert.equal(env.autoPerformanceStartedAtRef.current, 0)
  assert.equal(env.recordingStartedAtRef.current, 0); assert.equal(env.recordStreamRef.current, null)
  assert.equal(env.chunksRef.current.length, 1, 'Late failed-take chunks cannot alter the next take')
  assert.equal(env.activeRecordingIdRef.current, 'next'); assert.equal(warm, 1)
}
console.log('PASS: keyboard/assistive activation, pointer deduplication, long press, cancellation, disabled controls, one-time manual/handsfree encoder feedback, terminal cleanup, and late callback isolation')
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
function captureHarness(writer) {
  let aborts = 0, stops = 0, restores = 0, warms = 0, visible = true, stopping = true
  const completed = [], released = []
  const oldStream = { getAudioTracks: () => [] }, recorder = { state: 'recording', stop() { stops++ } }
  const env = {
    recorderRef: ref(recorder), writerRef: ref(writer), chunksRef: ref([]), activeRecordingIdRef: ref('old'), activeTakeIdRef: ref('old'),
    recordStreamRef: ref(oldStream), streamRef: ref(oldStream), recordingStartMsRef: ref(1), recordingStartedAtRef: ref(1),
    recorderMimeTypeRef: ref('audio/old'), recordingOrientationRef: ref('portrait'), recordingModeRef: ref('audio'),
    autoPreRollActiveRef: ref(false), autoPerformanceActiveRef: ref(false), autoPreRollStartedAtRef: ref(0), autoPerformanceStartedAtRef: ref(0),
    isRecordingRef: ref(true), elapsedRef: ref(2), onCompleteRef: ref(take => completed.push(take)),
    snapshotCaptureAudioTrack: () => null, getActiveCaptureProfile: () => 'natural',
    detachRecorder(r) { r.onstop = null; r.ondataavailable = null; r.onerror = null },
    releaseRecorderStream(stream) { released.push(stream) }, setIsRecording(v) { visible = v }, setIsStopping(v) { stopping = v },
    scheduleWarmAutoAudioRef: ref(() => warms++), restoreNativeAudioBridgeAfterWebKitCapture: async () => { restores++ },
    reportError() {}, showAlertOutsideTree() { assert.fail('Unexpected failure') },
    abortActiveWriter: async () => { aborts++; env.writerRef.current = null; env.activeTakeIdRef.current = null; await writer.abort?.() },
  }
  callback('src/hooks/useCameraSession.ts', 'bindRecordingHandlers', env)(recorder, 'old')
  const saved = { onstop: recorder.onstop, ondataavailable: recorder.ondataavailable }
  const replacement = () => {
    const next = { state: 'recording', stop() { assert.fail('Replacement stopped') } }, nextStream = { getAudioTracks: () => [] }, nextWriter = {}
    env.recorderRef.current = next; env.activeRecordingIdRef.current = 'new'; env.activeTakeIdRef.current = 'new'; env.writerRef.current = nextWriter
    env.recordStreamRef.current = nextStream; env.isRecordingRef.current = true; env.chunksRef.current = [new Blob(['next'])]
    env.recorderMimeTypeRef.current = 'video/new'; env.recordingOrientationRef.current = 'landscape'
    return { next, nextStream, nextWriter }
  }
  return { env, oldStream, recorder, saved, replacement, completed, released, get stats() { return { aborts, stops, restores, warms, visible, stopping } } }
}
let pending = deferred()
let c = captureHarness({ enqueue: () => pending.promise })
let next = c.replacement()
c.env.activeRecordingIdRef.current = null // identity must protect gaps between take-ID publications
c.saved.onstop(); c.saved.ondataavailable({ data: new Blob(['stale']) })
assert.equal(c.env.recorderRef.current, next.next); assert.equal(c.env.writerRef.current, next.nextWriter)
assert.equal(c.env.chunksRef.current.length, 1, 'Old callbacks before any terminal event cannot mutate replacement')
c = captureHarness({ enqueue: () => pending.promise })
c.saved.ondataavailable({ data: new Blob(['old']) }); next = c.replacement(); pending.reject(Error('delayed append failure')); await flush()
assert.equal(c.stats.aborts, 0); assert.equal(c.stats.stops, 0); assert.equal(c.env.writerRef.current, next.nextWriter)
pending = deferred(); const aborting = deferred()
c = captureHarness({ enqueue: () => pending.promise, abort: () => aborting.promise })
c.saved.ondataavailable({ data: new Blob(['old']) }); pending.reject(Error('append failure')); await flush()
assert.equal(c.stats.aborts, 1); next = c.replacement(); aborting.resolve(); await flush()
assert.equal(c.stats.stops, 0, 'Failure cleanup must recheck recorder ownership after awaiting abort')
const finalizing = deferred()
c = captureHarness({ finalize: () => finalizing.promise }); c.saved.onstop(); next = c.replacement()
finalizing.resolve({ filePath: 'old.m4a', videoUrl: 'old-url' }); await flush()
assert.equal(c.completed.length, 1, 'Valid old take still completes after replacement starts')
assert.equal(c.completed[0].mimeType, 'audio/old'); assert.equal(c.completed[0].recordingOrientation, 'portrait')
assert.equal(c.env.recorderRef.current, next.next); assert.equal(c.env.writerRef.current, next.nextWriter); assert.equal(c.env.recordStreamRef.current, next.nextStream)
assert.equal(c.stats.visible, true); assert.equal(c.stats.stopping, true); assert.equal(c.stats.restores, 0); assert.equal(c.stats.warms, 0)
assert.deepEqual(c.released, [c.oldStream], 'Finalization releases only its own capture stream')
console.log('PASS: stale stop/data identity, delayed append failure, replacement during abort, and valid old-take finalization without replacement cleanup')
c = captureHarness({ finalize: async () => ({ filePath: 'normal.m4a', videoUrl: 'normal-url' }) })
c.saved.onstop(); await flush()
assert.equal(c.completed.length, 1); assert.equal(c.stats.visible, false); assert.equal(c.stats.stopping, false)
assert.equal(c.env.recordStreamRef.current, null); assert.equal(c.stats.restores, 1); assert.equal(c.stats.warms, 1)
console.log('PASS: ordinary stop still delivers the take and releases capture state once')

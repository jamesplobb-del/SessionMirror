// Production preview ownership, recovery callbacks, and native stop method.
// Explicit media ports test ordering; this does not verify iPhone acoustics.
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { build } from 'esbuild'
import ts from 'typescript'

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
const state = { owner: null, listeners: new Map(), stops: [], held: 0, resolve: async path => path, prepare: async () => {}, remove: async () => {}, installs: 0 }
globalThis.__inlineLifecycle = {
  resolve: path => state.resolve(path),
  prepare: async () => { state.held++; await state.prepare() },
  release: async () => { state.held--; assert.ok(state.held >= 0) },
  plugin: {
    addListener: async (name, fn) => { state.installs++; state.listeners.set(name, fn); return { remove: async () => { await state.remove(); state.listeners.delete(name) } } },
    startInlineTakeBoxPlayback: async options => { state.owner = options.ownerId; return { duration: 20 } },
    stopInlineTakeBoxPlayback: async options => {
      state.stops.push(options)
      // This contract is separately checked against the real Swift stop method below.
      if (options.ownerId && options.ownerId !== state.owner) return
      const ownerId = state.owner; state.owner = null
      if (options.notify && ownerId) state.listeners.get('inlineTakeBoxPlaybackEnded')?.({ ownerId })
    },
  },
}
const ports = [
  [/^@capacitor\/core$/, "export const Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios'}"],
  [/audioSessionRoute$/, 'export default globalThis.__inlineLifecycle.plugin'],
  [/takeStorage$/, 'export const resolveNativeFileUri=p=>globalThis.__inlineLifecycle.resolve(p)'],
  [/naturalTakePreview$/, 'export const readyNaturalTakePreview=async p=>p'],
  [/playbackRouteCoordinator$/, 'export const prepareInlineTakeBoxPlaybackRoute=()=>globalThis.__inlineLifecycle.prepare(); export const releaseInlineTakeBoxPlaybackRoute=()=>globalThis.__inlineLifecycle.release()'],
  [/takeGuidance$/, 'export const completedTakeBoxTone=()=>null'],
]
const compiled = await build({
  stdin: { contents: "export * from './src/utils/nativeInlineTakeBoxPlayback'; export * from './src/utils/audioModeNativePlayback';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'preview-lifecycle-ports', setup(b) {
    for (const [filter, contents] of ports) {
      const namespace = `port-${filter.source}`
      b.onResolve({ filter }, args => ({ path: args.path, namespace }))
      b.onLoad({ filter: /.*/, namespace }, () => ({ contents }))
    }
  } }],
})
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const audioOwner = api.AUDIO_MODE_NATIVE_PLAYBACK_OWNER
const cameraOptions = { ownerId: 'pip-challenger', filePath: 'take.mp4', layout: { x: 0, y: 0, width: 200, height: 200, cornerRadius: 8 } }

// Extract actual capture callbacks, rather than duplicating their guard logic.
const cameraAst = ts.createSourceFile('camera.ts', readFileSync('src/hooks/useCameraSession.ts', 'utf8'), ts.ScriptTarget.Latest, true)
function callback(name, scope) {
  let body
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(cameraAst) === name) body = node.initializer.arguments[0].getText(cameraAst)
    ts.forEachChild(node, visit)
  }
  visit(cameraAst); assert.ok(body, name)
  const code = ts.transpileModule(`return (${body.replaceAll('import.meta.env.DEV', 'false')})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(scope), code)(...Object.values(scope))
}
const ref = current => ({ current })
const recoveryCalls = []
const recoveryTimers = new Map()
let timerId = 0
const recovery = {
  ...api, isAppInForeground: () => true, document: { visibilityState: 'visible' },
  isRecordingRef: ref(false), resumeInFlightRef: ref(false), streamAcquireInFlightRef: ref(false),
  recordingModeRef: ref('audio'), nativeExperimentalRecordingRef: ref(false), nativeStartSettleRef: ref(null),
  nativePreviewActiveRef: ref(true), previewHealthyRef: ref(false), streamRef: ref(null),
  cancelScheduledRelease() {}, applyViewportCssVarsOnResume() {}, clearStaleCaptureStartState() { recoveryCalls.push('clear-start-state') },
  isNativeVideoRecordingEnabled: () => true, isNativeAudioBridgeEnabled: () => true,
  ensureNativeCameraSessionHealthy: async () => recoveryCalls.push('native-health'),
  acquireNativeVideoBridge: async () => recoveryCalls.push('acquire-bridge'),
  onBeforeForegroundRestartRef: ref(() => recoveryCalls.push('before-restart')),
  onAfterForegroundRestartRef: ref(() => recoveryCalls.push('after-restart')),
  foregroundRestartTokenRef: ref(0), foregroundRestartTimerRef: ref(null), captureSessionEpochRef: ref(0),
  setIsPreviewRecovering() {}, setReady() {}, resetCameraPreviewZoom() {},
  releaseLiveStream: () => recoveryCalls.push('release-stream'), suspendMicForPlayback: async () => {},
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
  IOS_CAMERA_RELEASE_DELAY_MS: 80, RESUME_IN_FLIGHT_TIMEOUT_MS: 2000,
  window: {
    setTimeout(fn, ms) { recoveryTimers.set(++timerId, { fn, ms }); return timerId },
    clearTimeout(id) { recoveryTimers.delete(id) },
  },
}
const refresh = callback('refreshCameraSession', recovery)
const restart = callback('restartCameraAfterForeground', recovery)
const handCaptureToPlayback = callback('suspendAudioCaptureForPlayback', recovery)
function releaseCaptureDelays() {
  for (const [id, { fn, ms }] of recoveryTimers) if (ms === 80) { recoveryTimers.delete(id); fn() }
}
async function assertRecoveryHeld(mode) {
  recovery.recordingModeRef.current = mode
  const count = recoveryCalls.length
  await refresh(); await restart({ force: true })
  assert.equal(recoveryCalls.length, count, `${mode} foreground retries cannot reopen capture during preview preparation/playback`)
}
async function assertRecoveryReleased(mode) {
  recovery.recordingModeRef.current = mode
  const count = recoveryCalls.length
  await refresh(); await restart({ force: true })
  assert.ok(recoveryCalls.length > count, `${mode} capture can recover again after playback releases it`)
}

const gate = deferred(); state.prepare = () => gate.promise
const audioStart = api.startAudioModeNativePlayback({ filePath: 'take.m4a' })
await flush()
assert.equal(api.isAudioModeNativePlaybackPendingOrActive(), true)
await assertRecoveryHeld('audio'); await assertRecoveryHeld('video')
gate.resolve(); assert.ok(await audioStart)
assert.equal(state.installs, 1, 'The first audio-only preview installs the shared native ended listener')
await assertRecoveryHeld('audio')
await api.stopNativeInlineTakeBoxPlayback({ ownerId: 'unmounted-camera-card', notify: false })
assert.equal(state.stops.at(-1).ownerId, 'unmounted-camera-card', 'Owner identity reaches the native stop boundary')
assert.equal(state.owner, audioOwner, 'Sibling card cleanup cannot stop audio preview')
await api.stopAudioModeNativePlayback()
assert.equal(state.owner, null)
assert.equal(api.isAudioModeNativePlaybackPendingOrActive(), false)
assert.equal(state.held, 0)
await assertRecoveryReleased('audio')

// A restart can have passed the initial guard before the user presses Play.
recovery.nativePreviewActiveRef.current = false
for (const mode of ['audio', 'video']) {
  recovery.recordingModeRef.current = mode
  recoveryCalls.length = 0
  const recovering = restart()
  await flush()
  assert.ok(recoveryTimers.size > 0, 'Recovery is waiting for capture teardown')
  const pending = deferred(); state.prepare = () => pending.promise
  const playing = api.startAudioModeNativePlayback({ filePath: 'resume-race.m4a' })
  await flush(); releaseCaptureDelays(); await recovering
  assert.equal(recoveryCalls.includes('acquire-bridge'), false, 'Playback that starts during the recovery delay prevents late capture reacquisition')
  pending.resolve(); assert.ok(await playing); await api.stopAudioModeNativePlayback()
}
state.prepare = async () => {}
recoveryCalls.length = 0
const oldRecovery = restart()
await flush()
const handingOff = handCaptureToPlayback()
await flush(); releaseCaptureDelays(); await Promise.all([oldRecovery, handingOff])
assert.equal(recoveryCalls.includes('acquire-bridge'), false, 'Capture handoff invalidates a waiting foreground restart before native playback starts')
assert.equal(recovery.resumeInFlightRef.current, false, 'Invalidated recovery cannot leave the busy flag stuck')
recovery.nativePreviewActiveRef.current = true
await assertRecoveryReleased('audio')

state.prepare = async () => {}
let audioEnded = 0, cameraEnded = 0
api.setAudioModeNativePlaybackEndedHandler(() => { audioEnded++; void api.releaseAudioModeNativePlaybackRoute() })
api.setNativeInlineTakeBoxEndedHandler(cameraOptions.ownerId, () => cameraEnded++)
const uri = deferred(); state.resolve = () => uri.promise
const cameraStart = api.startNativeInlineTakeBoxPlayback(cameraOptions)
await assertRecoveryHeld('video')
uri.resolve('take.mp4'); assert.equal(await cameraStart, true)
await assertRecoveryHeld('video')
state.listeners.get('inlineTakeBoxPlaybackEnded')({ ownerId: 'removed-old-card' })
assert.equal(audioEnded, 0); assert.equal(cameraEnded, 0, 'An old removed owner does not broadcast an end to active players')
await api.stopNativeInlineTakeBoxPlayback({ ownerId: 'old-best-card', notify: false })
assert.equal(state.owner, cameraOptions.ownerId, 'Sibling cleanup also preserves camera preview')
await api.stopNativeInlineTakeBoxPlayback({ ownerId: cameraOptions.ownerId })
assert.equal(cameraEnded, 1)
assert.equal(api.isNativeInlineTakeBoxPlaybackPendingOrActive(), false)
await assertRecoveryReleased('video')

state.resolve = async () => null
assert.equal(await api.startNativeInlineTakeBoxPlayback(cameraOptions), false)
assert.equal(api.isNativeInlineTakeBoxPlaybackPendingOrActive(), false, 'Missing file cannot leave capture permanently blocked')
assert.equal(await api.startAudioModeNativePlayback({ filePath: 'missing.m4a' }), null)
assert.equal(api.isAudioModeNativePlaybackPendingOrActive(), false)
state.resolve = async path => path
assert.ok(await api.startAudioModeNativePlayback({ filePath: 'resumed.m4a' }))
await api.stopNativeInlineTakeBoxPlayback({ notify: true })
await flush()
assert.equal(audioEnded, 1, 'Global background cleanup still notifies the active audio owner')
assert.equal(api.isAudioModeNativePlaybackPendingOrActive(), false)
assert.equal(state.held, 0)
await assertRecoveryReleased('audio')

// An owner arriving during asynchronous listener removal must wait and reinstall.
api.teardownAudioModeNativePlaybackListener()
api.setNativeInlineTakeBoxEndedHandler(cameraOptions.ownerId, null)
const removing = deferred(); state.remove = () => removing.promise
const teardown = api.teardownNativeInlineTakeBoxListener()
await flush()
api.setNativeInlineTakeBoxEndedHandler(cameraOptions.ownerId, () => cameraEnded++)
const restarting = api.startNativeInlineTakeBoxPlayback(cameraOptions)
await flush()
assert.equal(state.owner, null, 'New playback waits for the old listener removal')
removing.resolve(); await teardown; assert.equal(await restarting, true)
assert.equal(state.installs, 2, 'New owner installs a fresh listener after teardown finishes')
const endedBefore = cameraEnded
await api.stopNativeInlineTakeBoxPlayback({ ownerId: cameraOptions.ownerId })
assert.equal(cameraEnded, endedBefore + 1, 'The replacement listener delivers the new owner end')

// Compile the actual native stop method with inert AVFoundation field ports.
// No duplicate stop/ownership implementation is embedded in the test.
const nativeSource = readFileSync('ios/App/App/InlineTakeBoxPlaybackController.swift', 'utf8')
const stopStart = nativeSource.indexOf('    func stop(')
const stopEnd = nativeSource.indexOf('    private func scheduleStartupWatchdog', stopStart)
assert.ok(stopStart >= 0 && stopEnd > stopStart)
const method = nativeSource.slice(stopStart, stopEnd)
const swift = `import Foundation
final class Port {
    var pauses = 0; var stops = 0; var cancels = 0; var removals = 0
    var events: [[String: Any]] = []
    func pause() { pauses += 1 }; func stop() { stops += 1 }; func cancel() { cancels += 1 }
    func removeFromSuperlayer() { removals += 1 }; func removeFromSuperview() { removals += 1 }
    func notifyListeners(_ name: String, data: [String: Any]) { events.append(data) }
}
final class Controller {
    var ownerId = "audio-mode-native-playback"
    var player: Port? = Port(); var audioPlayer: Port? = Port(); var audioEngine: Port? = Port()
    var audioFile: Port? = Port(); var playerLayer: Port? = Port(); var containerView: Port? = Port()
    var startupWatchdog: Port? = Port(); var audioEndWatchdog: Port? = Port()
    var endObserver: NSObjectProtocol?; var plugin: Port? = Port(); var cornerRadius = 8.0
${method}
}
func check(_ ok: @autoclosure () -> Bool, _ message: String) { if !ok() { fatalError(message) } }
let audio = Controller(); let original = audio.audioPlayer; let watchdog = audio.audioEndWatchdog
audio.stop(notify: true, ownerId: "stale-camera-card")
check(audio.audioPlayer === original, "wrong-owner cleanup changed the active audio player")
check(watchdog?.cancels == 0, "wrong-owner cleanup cancelled the audio watchdog")
check(audio.plugin?.events.count == 0, "wrong-owner cleanup emitted a false ended event")
audio.stop(notify: true, ownerId: "audio-mode-native-playback")
check(audio.audioPlayer == nil && original?.stops == 1, "matching owner failed to stop its player")
check(audio.plugin?.events.first?["ownerId"] as? String == "audio-mode-native-playback", "matching stop lost owner identity")
let camera = Controller(); camera.ownerId = "pip-challenger"; let video = camera.player
camera.stop(notify: false, ownerId: "audio-mode-native-playback")
check(camera.player === video && video?.pauses == 0, "stale audio cleanup stopped the newer camera preview")
camera.stop(notify: true)
check(camera.player == nil && video?.pauses == 1, "global background cleanup failed to stop preview")
print("PASS: actual Swift stop method preserves other owners and allows matching/global cleanup")
`
const directory = mkdtempSync(join(tmpdir(), 'inline-preview-lifecycle-'))
try {
  const sourcePath = join(directory, 'verify.swift'), executable = join(directory, 'verify')
  writeFileSync(sourcePath, swift)
  execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-module-cache-path', join(directory, 'cache'), sourcePath, '-o', executable], { stdio: 'pipe' })
  process.stdout.write(execFileSync(executable, { encoding: 'utf8' }))
} finally { rmSync(directory, { recursive: true, force: true }) }
console.log('PASS: native audio/camera preview lifecycle ownership, pending/active capture deferral, failed-start recovery, first-audio ended listener, and late sibling events (no device acoustics).')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import ts from 'typescript'

// Run the real recording-start callback and storage writer on a non-native
// platform. Device capture, MediaRecorder, and React setters are boundaries.
const source = ts.createSourceFile(
  'useCameraSession.ts',
  readFileSync('src/hooks/useCameraSession.ts', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
)
let callback
function visit(node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(source) === 'startRecording' &&
    node.initializer &&
    ts.isCallExpression(node.initializer)
  ) {
    callback = node.initializer.arguments[0]?.getText(source)
  }
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(callback, 'recording start callback is available')
const startJs = ts.transpileModule(`const startRecording = ${callback}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

const tempDir = await mkdtemp(join(tmpdir(), 'besttake-web-recording-'))
try {
  const writerPath = join(tempDir, 'takeStorage.mjs')
  await build({
    entryPoints: ['src/utils/takeStorage.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: writerPath,
    define: { 'import.meta.env': '{}' },
  })
  const { StreamingTakeWriter } = await import(pathToFileURL(writerPath).href)

  async function attempt(mode) {
    let recorderStarts = 0
    let reportedRecording = false
    const ref = (current) => ({ current })
    const stream = { id: `live-${mode}-stream` }
    const env = {
      cameraSwitchInFlightRef: ref(false),
      isRecordingRef: ref(false),
      simulatorCaptureAvailable: false,
      recordingModeRef: ref(mode),
      shouldUseNativeExperimentalRecording: () => false,
      shouldUseNativeAudioRecording: () => false,
      autoPreRollActiveRef: ref(false),
      autoPerformanceActiveRef: ref(false),
      nativeStartSettleRef: ref(null),
      ensureAudioRecordingStream: async () => stream,
      streamRef: ref(stream),
      recorderRef: ref(null),
      activeRecordingIdRef: ref(null),
      recordingStartMsRef: ref(0),
      recordingOrientationRef: ref(null),
      readRecordingOrientation: () => 'portrait',
      getRecorderMimeTypeForMode: (value) => value === 'audio' ? 'audio/webm' : 'video/webm',
      recorderMimeTypeRef: ref(''),
      chunksRef: ref([]),
      StreamingTakeWriter,
      writerRef: ref(null),
      activeTakeIdRef: ref(null),
      buildRecorderStream: (value) => value,
      createMediaRecorder: () => ({ state: 'inactive', start() { this.state = 'recording'; recorderStarts++ } }),
      bindRecordingHandlers: () => {},
      recordStreamRef: ref(null),
      shouldUseRecordingTimeslice: () => false,
      setIsRecording: (value) => { reportedRecording = value },
      setElapsed: () => {},
      elapsedRef: ref(0),
      recordingStartedAtRef: ref(0),
      releaseRecorderStream: () => {},
    }
    const start = new Function(...Object.keys(env), `${startJs}; return startRecording`)(...Object.values(env))
    const started = await start()
    return { mode, started, recorderStarts, reportedRecording }
  }

  const results = await Promise.all([attempt('audio'), attempt('video')])
  console.log(JSON.stringify(results))
  assert.deepEqual(
    results.map(({ started, recorderStarts, reportedRecording }) => ({ started, recorderStarts, reportedRecording })),
    [
      { started: true, recorderStarts: 1, reportedRecording: true },
      { started: true, recorderStarts: 1, reportedRecording: true },
    ],
    'Web recording should start MediaRecorder using the buffered fallback when native file writing is unavailable',
  )
  console.log('PASS: browser audio and video recording start without a native writer')
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

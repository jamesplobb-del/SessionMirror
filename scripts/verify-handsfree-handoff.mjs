import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const flush = async () => { for (let i=0;i<30;i++) await Promise.resolve() }
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject} }
const ref = current => ({current})
function callback(file, name, env) {
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  let expression
  function visit(node) {
    if(ts.isVariableDeclaration(node)&&node.name.getText(source)===name) expression=node.initializer.arguments[0].getText(source)
    ts.forEachChild(node,visit)
  }
  visit(source);assert.ok(expression, name)
  const js=ts.transpileModule(`const callback=${expression.replaceAll('import.meta.env.DEV','false')}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
  return new Function(...Object.keys(env),`${js};return callback`)(...Object.values(env))
}
// Real discard callback + a native start that can ONLY settle after Stop.
const pendingStart=deferred()
let stops=0, webkitRecoveries=0, captureActive=true, deleted=[]
const env={
  nativePreRollDiscardInFlightRef:ref(null),autoPreRollActiveRef:ref(true),
  nativeExperimentalRecordingRef:ref(true),autoPerformanceActiveRef:ref(false),isRecordingRef:ref(false),
  recordingModeRef:ref('audio'),nativePreRollDiscardRef:ref(false),autoPreRollStartedAtRef:ref(0),
  autoPerformanceStartedAtRef:ref(0),activeTakeIdRef:ref('idle'),recordingStartedAtRef:ref(0),
  nativeStartSettleRef:ref(pendingStart.promise),
  stopNativeAudioRecording:async()=>{stops++;pendingStart.reject(Error('cancelled before first sample'));return {filePath:'idle.m4a'}},
  stopNativeCameraRecording:async()=>{throw Error('Wrong engine')},deleteTakeFile:async path=>{deleted.push(path)},
  setIsRecording(){},setIsStopping(){},setNativeAudioCaptureActive:value=>{captureActive=value},
  requestPitchGraphReattach(){},recoverAfterNativeAudioRecording(){webkitRecoveries++},
}
// Mirror the real safe startup promise: rejection becomes false.
env.nativeStartSettleRef.current=pendingStart.promise.catch(()=>false)
const discard=callback('src/hooks/useCameraSession.ts','discardNativeAutoPreRollCapture',env)
const first=discard({restoreWebKit:false})
const second=discard({restoreWebKit:false})
assert.equal(first,second,'Concurrent stall/Off/Next cleanup must share one native stop')
await flush()
assert.equal(stops,1,'Stop must be sent BEFORE awaiting the first audio sample')
await first
assert.equal(env.nativeStartSettleRef.current,null)
assert.equal(env.nativePreRollDiscardInFlightRef.current,null)
assert.equal(env.nativeExperimentalRecordingRef.current,false)
assert.equal(captureActive,false)
assert.equal(webkitRecoveries,0,'Recycling native audio must not reopen WebKit')
assert.deepEqual(deleted,['idle.m4a'])
env.autoPreRollActiveRef.current=true;env.nativeExperimentalRecordingRef.current=true
env.autoPerformanceActiveRef.current=true;env.isRecordingRef.current=true
await discard()
assert.equal(stops,1,'A visible performance must never be discarded')
console.log('PASS: stalled first-sample cancellation, shared cleanup, released capture flags, and real-take protection')

// Next must hold microphone warmup throughout route restoration.
const route=deferred(),events=[]
const app={
  autoRecordStartSuppressedRef:ref(false),autoPlaybackGenerationRef:ref(3),recordingModeRef:ref('audio'),
  autoSoundRecordingEnabledRef:ref(true),restartHandsFreeMonitorRef:ref(options=>events.push(['rearm',options.force])),
  setAutoRecordStartSuppressed:value=>events.push(['suppress',value]),
  stopAutoPlaybackAudio(){events.push(['stop']);app.autoPlaybackGenerationRef.current++},
  finalizeTakePlaybackCleanup:()=>route.promise,
  releaseAutoRecordSuppress:delay=>{events.push(['release',delay]);app.autoRecordStartSuppressedRef.current=false},
  AUTO_PLAYBACK_POST_COOLDOWN_MS:350,stabilizeViewportAfterMediaInteraction(){},
  window:{requestAnimationFrame:fn=>fn()},refreshCameraSessionRef:ref(async()=>events.push(['refresh'])),
}
const finish=callback('src/App.tsx','finishAutoPlayback',app)
finish();await flush()
assert.equal(app.autoRecordStartSuppressedRef.current,true)
assert.equal(events.some(e=>e[0]==='release'),false,'Mic cannot rearm while the old camera route is restoring')
route.resolve();await flush()
assert.equal(app.autoRecordStartSuppressedRef.current,false)
assert.ok(events.some(e=>e[0]==='rearm'&&e[1]===true))
assert.equal(events.some(e=>e[0]==='refresh'),false,'Hands-free Next must rearm native capture, not request a competing WebKit mic')

const transitions=[]
const modeEnv={
  recordingModeRef:ref('video'),isRecording:false,handsFreePlaybackBusyRef:ref(true),autoPlaybackTakeId:'camera-take',
  finishAutoPlayback:()=>transitions.push('cancel-replay'),
  document:{documentElement:{classList:{toggle(){}}}},stabilizeViewportAfterMediaInteraction(){},
  changeRecordingMode:mode=>{transitions.push('change-mode');modeEnv.recordingModeRef.current=mode},
  scheduleAfterPaint(){},window:{setTimeout(){}},
}
const change=callback('src/App.tsx','handleRecordingModeChange',modeEnv)
change('audio')
assert.deepEqual(transitions,['cancel-replay','change-mode'],'Camera replay must be cancelled before Tools claims the mic')
console.log('PASS: Next holds mic warmup until route cleanup; Camera → Tools cancels replay before handoff')

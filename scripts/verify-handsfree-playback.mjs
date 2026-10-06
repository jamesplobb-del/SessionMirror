import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Execute the actual App callback, isolating device APIs and React state only.
const source = ts.createSourceFile('App.tsx', readFileSync('src/App.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let callback
let savedTakePlaybackCall
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'playAutoTakeAudio') callback = node.initializer.arguments[0].getText(source)
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'playAutoTakeAudioRef.current') savedTakePlaybackCall = node
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(callback)
assert.deepEqual(savedTakePlaybackCall?.arguments.map(arg => arg.getText(source)), [
  'readiness.playbackUrl', 'takeId', 'autoPerformanceStartSeconds',
  'resolvedFilePath', 'playbackGainDb', 'readiness.durationSeconds',
], 'Saved take passes onset and file duration to automatic replay')
const js = ts.transpileModule(`const callback = ${callback}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const playbackSource = ts.createSourceFile('autoRecordPlayback.ts', readFileSync('src/utils/autoRecordPlayback.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const playbackFunctions = playbackSource.statements.filter(node =>
  ts.isFunctionDeclaration(node) &&
  ['resolveAutoPlaybackStartSeconds', 'applyAutoPlaybackLeadIn'].includes(node.name?.text)
).map(node => node.getText(playbackSource).replace(/^export\s+/, '')).join('\n')
const playbackJs = ts.transpileModule(`const AUTO_PLAYBACK_LEAD_IN_S = 1; ${playbackFunctions}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const { resolveAutoPlaybackStartSeconds, applyAutoPlaybackLeadIn } = new Function('HTMLMediaElement', `${playbackJs}; return { resolveAutoPlaybackStartSeconds, applyAutoPlaybackLeadIn }`)({ HAVE_METADATA: 1 })
assert.equal(resolveAutoPlaybackStartSeconds(8, 10), 7, 'Replay includes one second before the attack')
assert.equal(resolveAutoPlaybackStartSeconds(undefined, 10), 0, 'Missing onset starts at the file head')
assert.equal(resolveAutoPlaybackStartSeconds(20, 3), 0, 'Stale onset cannot seek to a truncated file tail')
const flush = async () => { for (let i=0;i<30;i++) await Promise.resolve() }
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject} }
function harness() {
  const timers = new Map()
  let sequence=0, played=0, paused=0, finishes=0, errors=0, pending=false, playing=false, options, mediaOptions
  const ref = current => ({current})
  const env = {
    window: {setTimeout(fn){const id=++sequence;timers.set(id,fn);return id},clearTimeout(id){timers.delete(id)}},
    recordingModeRef:ref('audio'), pendingAutoPlaybackRef:ref(true), autoPlaybackGenerationRef:ref(0),
    autoPlaybackTakeIdRef:ref(null),
    queuedAutoPlayRef:ref(null), takesRef:ref([]), autoRecordStartSuppressedRef:ref(false),
    autoPlaybackUsesNativeRef:ref(false), autoPlaybackStartTimerRef:ref(null), autoPlaybackTailCleanupRef:ref(null),
    autoPlaybackAudioRef:ref(null),suspendCameraForBackgroundRef:ref(()=>{}),
    setHandsFreePlaybackPending:value=>{pending=value},setAutoPlaybackPlaying:value=>{playing=value},
    sharedMetronomeEngine:{holdClickAcrossPlayback(){}},
    setAutoRecordStartSuppressed(){},setAutoPlaybackTakeId(){},setTakeDeleteError(){errors++},
    createPlaybackDiagSession:()=>'',setActivePlaybackDiagSession(){},
    Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'ios'},
    waitMs:async()=>{}, nativeDataFileExists:async()=>true,
    AUDIO_PLAYBACK_RECORDING_STOP_SETTLE_MS:50,AUDIO_PLAYBACK_CAPTURE_SUSPEND_MS:50,NATIVE_AUDIO_MIME:'audio/mp4',
    settings:{soundSilenceSeconds:2},
    logPlaybackSourceVerification:async()=>{}, logAudioSessionSnapshot:async()=>{},
    attachPlaybackPipelineInstrumentation:()=>()=>{},
    prepareInlineMediaElement(){},assignMediaPlaybackSrc(audio,url){audio.src=url},
    logRouteTransition(){},snapshotPlaybackMedia:()=>({}),
    waitForMediaReadyWithRetry:async()=>true,logAudioFileContentVerification:async()=>{},
    preparePlaybackRoute:async()=>{},
    resolveAutoPlaybackStartSeconds,applyAutoPlaybackLeadIn,
    attachAutoPlaybackTailSkip:()=>()=>{},
    playTakeMediaAudible:async(_audio,next)=>{mediaOptions=next;return true},
    audioModePlaybackControlsRef:{play(_item,next){played++;options=next},pause(){paused++}},
    teardownAutoPlaybackMedia(){
      env.window.clearTimeout(env.autoPlaybackStartTimerRef.current)
      env.autoPlaybackTailCleanupRef.current?.()
      if(env.autoPlaybackUsesNativeRef.current)env.audioModePlaybackControlsRef.pause()
      env.autoPlaybackUsesNativeRef.current=false
    },
    finishAutoPlayback(){finishes++;env.autoPlaybackGenerationRef.current++;env.teardownAutoPlaybackMedia();pending=false;playing=false},
  }
  // Pass through wrappers so async dependencies can change during a test.
  const bindings = Object.fromEntries(Object.entries(env).map(([key,value])=>[key,typeof value==='function'?(...args)=>env[key](...args):value]))
  const play = new Function(...Object.keys(bindings),`${js}; return callback`)(...Object.values(bindings))
  return {env,play,timers,get stats(){return {played,paused,finishes,errors,pending,playing}},get options(){return options},get mediaOptions(){return mediaOptions}}
}
let h=harness()
h.play('take-url','take',8,'take.m4a',undefined,10);await flush()
assert.equal(h.stats.played,1)
assert.equal(h.stats.pending,true)
assert.equal(h.options.startTime,7,'Native replay starts just before the performance')
h.options.onStarted(10)
assert.equal(h.stats.playing,true)
assert.equal(h.stats.pending,false)
assert.equal(h.timers.size,1,'Only the tail timer remains after native playback starts')
h.options.onEnded()
assert.equal(h.stats.finishes,1)
assert.equal(h.timers.size,0)

h=harness();const file=deferred();h.env.nativeDataFileExists=()=>file.promise
h.play('old-url','old',0,'old.m4a');await flush()
h.env.finishAutoPlayback() // Tab changed while the bridge checked the file.
file.resolve(true);await flush()
assert.equal(h.stats.played,0,'Cancelled file preparation cannot start a stale replay')

h=harness();h.env.nativeDataFileExists=async()=>{throw Error('bridge failed')}
h.play('url','take',0,'take.m4a');await flush()
assert.equal(h.stats.finishes,1,'A rejected bridge call exits pending playback')
assert.equal(h.stats.errors,1)

h=harness();h.play('url','take',0,'take.m4a');await flush()
const late=h.options
for(const timer of [...h.timers.values()])timer()
assert.equal(h.stats.finishes,1,'Missing native start callback times out and rearms')
assert.equal(h.stats.pending,false)
h.play('new-url','new',0,'new.m4a');await flush()
const before=h.stats.paused
late.onStarted(10)
assert.equal(h.stats.paused,before,'Late start callback must not pause a newer replay')
late.onEnded()
assert.equal(h.stats.finishes,1,'Late end callback must not finish a newer replay')
h.options.onStarted(10)
assert.equal(h.stats.playing,true)
h.options.onEnded()
assert.equal(h.stats.finishes,2)
console.log('PASS: native replay start/end, cancelled preparation, rejected bridge call, start timeout, and stale callbacks')

function webHarness(native=false) {
  const h=harness()
  h.env.Capacitor.isNativePlatform=()=>native
  h.env.autoPlaybackAudioRef.current={duration:10,readyState:2,currentTime:5,pause(){},removeAttribute(){},load(){}}
  return h
}
h=webHarness();h.play('url','take',8);await flush()
assert.equal(h.stats.playing,true,'Browser replay starts after readiness')
assert.equal(h.env.autoPlaybackAudioRef.current.currentTime,7,'Browser replay starts just before the performance')
assert.equal(h.timers.size,0,'Browser replay clears its startup deadline')
h.env.autoPlaybackAudioRef.current.onended()
assert.equal(h.stats.finishes,1)

h=webHarness(true);h.play('url','ipad-take',8,'take.m4a',undefined,10);await flush()
assert.equal(h.stats.played,1,'iPad replay uses the globally mounted shared native controller even when an HTML audio element exists')
assert.equal(h.stats.pending,true,'iPad replay waits for the shared controller start callback')
assert.equal(h.env.autoPlaybackAudioRef.current.currentTime,5,'Native routing does not independently seek the unused HTML player')
assert.equal(h.options.startTime,7,'The shared controller receives the performance lead-in')
h.options.onStarted(10)
assert.equal(h.stats.playing,true)
h.options.onEnded()
assert.equal(h.stats.finishes,1)

h=webHarness();h.play('url','take');await flush()
assert.equal(h.env.autoPlaybackAudioRef.current.currentTime,0,'Missing onset resets a reused browser player to the file head')
h.env.autoPlaybackAudioRef.current.onended()

h=webHarness();const readiness=deferred();let webStarts=0
h.env.waitForMediaReadyWithRetry=()=>readiness.promise
h.env.playTakeMediaAudible=async()=>{webStarts++;return true}
h.play('old','old');await flush()
h.env.finishAutoPlayback()
readiness.resolve(true);await flush()
assert.equal(webStarts,0,'Cancelled readiness cannot start browser replay')

h=webHarness();h.env.waitForMediaReadyWithRetry=async()=>{throw Error('media failed')}
h.play('url','take');await flush()
assert.equal(h.stats.finishes,1,'Rejected browser readiness clears pending playback')
assert.equal(h.stats.errors,1)
console.log('PASS: browser replay near the performance, cancellation during readiness, rejected readiness, and timer cleanup')

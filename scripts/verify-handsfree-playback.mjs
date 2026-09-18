import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Execute the actual App callback, isolating device APIs and React state only.
const source = ts.createSourceFile('App.tsx', readFileSync('src/App.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let callback
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'playAutoTakeAudio') callback = node.initializer.arguments[0].getText(source)
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(callback)
const js = ts.transpileModule(`const callback = ${callback}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const flush = async () => { for (let i=0;i<30;i++) await Promise.resolve() }
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject} }
function harness() {
  const timers = new Map()
  let sequence=0, played=0, paused=0, finishes=0, errors=0, pending=false, playing=false, options
  const ref = current => ({current})
  const env = {
    window: {setTimeout(fn){const id=++sequence;timers.set(id,fn);return id},clearTimeout(id){timers.delete(id)}},
    recordingModeRef:ref('audio'), pendingAutoPlaybackRef:ref(true), autoPlaybackGenerationRef:ref(0),
    queuedAutoPlayRef:ref(null), takesRef:ref([]), autoRecordStartSuppressedRef:ref(false),
    autoPlaybackUsesNativeRef:ref(false), autoPlaybackStartTimerRef:ref(null), autoPlaybackTailCleanupRef:ref(null),
    autoPlaybackAudioRef:ref(null),
    setHandsFreePlaybackPending:value=>{pending=value},setAutoPlaybackPlaying:value=>{playing=value},
    setAutoRecordStartSuppressed(){},setAutoPlaybackTakeId(){},setTakeDeleteError(){errors++},
    createPlaybackDiagSession:()=>'',setActivePlaybackDiagSession(){},
    Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'ios'},
    waitMs:async()=>{}, nativeDataFileExists:async()=>true,
    AUDIO_PLAYBACK_RECORDING_STOP_SETTLE_MS:50,AUTO_PLAYBACK_LEAD_IN_S:1,NATIVE_AUDIO_MIME:'audio/mp4',
    settings:{soundSilenceSeconds:2},
    logPlaybackSourceVerification:async()=>{}, logAudioSessionSnapshot:async()=>{},
    attachPlaybackPipelineInstrumentation:()=>()=>{},
    prepareInlineMediaElement(){},assignMediaPlaybackSrc(audio,url){audio.src=url},
    logRouteTransition(){},snapshotPlaybackMedia:()=>({}),
    waitForMediaReadyWithRetry:async()=>true,logAudioFileContentVerification:async()=>{},
    applyAutoPlaybackLeadIn:async()=>{},attachAutoPlaybackTailSkip:()=>()=>{},
    playTakeMediaAudible:async()=>true,
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
  return {env,play,timers,get stats(){return {played,paused,finishes,errors,pending,playing}},get options(){return options}}
}
let h=harness()
h.play('take-url','take',4,'take.m4a');await flush()
assert.equal(h.stats.played,1)
assert.equal(h.stats.pending,true)
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

function webHarness() {
  const h=harness()
  h.env.Capacitor.isNativePlatform=()=>false
  h.env.autoPlaybackAudioRef.current={duration:10,currentTime:0,pause(){},removeAttribute(){},load(){}}
  return h
}
h=webHarness();h.play('url','take',0);await flush()
assert.equal(h.stats.playing,true,'Browser replay starts after readiness and lead-in')
assert.equal(h.timers.size,0,'Browser replay clears its startup deadline')
h.env.autoPlaybackAudioRef.current.onended()
assert.equal(h.stats.finishes,1)

h=webHarness();const leadIn=deferred();let webStarts=0
h.env.applyAutoPlaybackLeadIn=()=>leadIn.promise
h.env.playTakeMediaAudible=async()=>{webStarts++;return true}
h.play('old','old',0);await flush()
h.env.finishAutoPlayback()
leadIn.resolve();await flush()
assert.equal(webStarts,0,'Cancelled lead-in cannot start browser replay')

h=webHarness();h.env.waitForMediaReadyWithRetry=async()=>{throw Error('media failed')}
h.play('url','take',0);await flush()
assert.equal(h.stats.finishes,1,'Rejected browser readiness clears pending playback')
assert.equal(h.stats.errors,1)
console.log('PASS: browser replay, cancellation during lead-in, rejected readiness, and timer cleanup')

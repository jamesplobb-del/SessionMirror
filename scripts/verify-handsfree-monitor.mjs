import assert from 'node:assert/strict'
import { build } from 'esbuild'

// Exercise the real hook with a deterministic microphone and slow recorder.
let now = 0, seq = 0, slots = [], cursor = 0, effects = [], dirty = true, output
const timers = new Map()
const schedule = (fn, ms, repeat = false) => { const id = ++seq; timers.set(id, { fn, at: now + ms, ms, repeat }); return id }
globalThis.window = { setTimeout: (f,m)=>schedule(f,m), clearTimeout:id=>timers.delete(id), setInterval:(f,m)=>schedule(f,m,true), clearInterval:id=>timers.delete(id) }
const visibilityListeners = new Set()
globalThis.document = { visibilityState:'visible', addEventListener(type,fn){visibilityListeners.add(fn)}, removeEventListener(type,fn){visibilityListeners.delete(fn)} }
Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true})
let rms = 0, peakRatio = 1, starts = 0, stops = 0, finished = 0
const context = { state:'running', resume:async()=>{context.state='running'}, createAnalyser:()=>({fftSize:128,smoothingTimeConstant:0}), createMediaStreamSource:()=>({connect(){},disconnect(){}}) }
const changed = (a,b) => !a || !b || a.length!==b.length || a.some((v,i)=>v!==b[i])
const hooks = {
 useRef(value){const i=cursor++;return slots[i]??= {current:value}},
 useState(value){const i=cursor++;if(!slots[i])slots[i]={value:typeof value==='function'?value():value};return [slots[i].value,next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true}}]},
 useCallback(fn,deps){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={value:fn,deps};return slots[i].value},
 useEffect(fn,deps){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn()})}},
}
hooks.useLayoutEffect=hooks.useEffect
globalThis.__handsfreeTest={hooks,context,metrics:()=>({rms,peak:rms*peakRatio}),metronomePlaying:false,metronomeTick:null}
const stubs = {
 'plusAccess': 'export const canUsePlus=()=>globalThis.__handsfreeTest.plusAccess!==false',
 'react': 'export const {useRef,useState,useCallback,useEffect,useLayoutEffect}=globalThis.__handsfreeTest.hooks',
 'audioLevel': 'export const readAnalyserMetrics=()=>globalThis.__handsfreeTest.metrics(); export const combinedGateLevel=(m,w=.45)=>Math.max(m.rms,m.peak*w)',
 'appSettings': 'export const getAutoRecordProfile=(...args)=>globalThis.__handsfreeTest.profile?.(...args)??({gate:.1,holdMs:140,noiseHeadroom:1.2,noiseMargin:.01,gateCapMultiplier:2,stopGateRatio:.6,usePeak:false})',
 'appForeground': 'export const isAppInForeground=()=>true; export const subscribeAppForeground=()=>()=>{}',
 'playbackAudioContext': 'export const getPlaybackAudioContext=async()=>{if(globalThis.__handsfreeTest.failSetup)throw Error("mic unavailable");if(globalThis.__handsfreeTest.setupGate)await globalThis.__handsfreeTest.setupGate;return globalThis.__handsfreeTest.context}; export const isSharedPlaybackContext=()=>true',
 'nativeAudioPitchTap': 'export const acquireNativeAudioTap=async()=>{}; export const releaseNativeAudioTap=async()=>{}; export const subscribeNativeAudioPitchFrames=async(fn)=>{globalThis.__handsfreeTest.nativeListener=fn;return {remove:async()=>{if(globalThis.__handsfreeTest.nativeListener===fn)globalThis.__handsfreeTest.nativeListener=null}}}',
 'cameraSessionState': 'export const isNativeCameraPreviewActive=()=>false; export const isNativeCaptureSessionActive=()=>globalThis.__handsfreeTest.nativeSession?.()??false',
 'sharedMetronomeEngine': 'export const sharedMetronomeEngine={subscribeTick:fn=>{globalThis.__handsfreeTest.metronomeTick=fn;return ()=>{if(globalThis.__handsfreeTest.metronomeTick===fn)globalThis.__handsfreeTest.metronomeTick=null}},getSnapshot:()=>({playing:globalThis.__handsfreeTest.metronomePlaying,soundId:"classic"}),holdClickAcrossPlayback(){}}',
 'autoRecordPlayback': 'export const AUTO_RECORD_MAX_IDLE_PREROLL_MS=20000; export const AUTO_RECORD_PREROLL_MS=1000',
}
const result=await build({entryPoints:['src/hooks/useAutoSoundRecording.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'devices',setup(b){b.onResolve({filter:/.*/},args=>{const key=args.path.split('/').at(-1);if(stubs[key])return {path:key,namespace:'stub'}});b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'js'}))}}]})
const {useAutoSoundRecording}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const streamRef={current:{getAudioTracks:()=>[{readyState:'live',enabled:true}]}}
const options={enabled:true,monitoringAllowed:true,suppressStart:false,ready:true,isRecording:false,streamRef,streamGeneration:0,silenceMs:500,volumeThreshold:20,
 startRecording(){starts++;schedule(()=>{options.isRecording=true;dirty=true},900)},
 stopRecording(){stops++;options.isRecording=false;dirty=true},warmRecorder(){},disarmRecorder(){},onAutoRecordingFinished(){finished++;options.monitoringPaused=true;dirty=true}}
async function flush(){for(let n=0;n<10;n++){if(dirty){dirty=false;cursor=0;output=useAutoSoundRecording(options);const pending=effects;effects=[];pending.forEach(f=>f())}await Promise.resolve();if(!dirty&&!effects.length)break}}
async function advance(ms){const end=now+ms;while(true){await flush();let chosen;for(const [id,t]of timers)if(t.at<=end&&(!chosen||t.at<chosen[1].at))chosen=[id,t];if(!chosen)break;const[id,t]=chosen;now=t.at;if(t.repeat)t.at+=t.ms;else timers.delete(id);t.fn()}now=end;await flush()}
let preRollActive=false, preRollBeganAt=0
options.isAutoPreRollCaptureActive=()=>preRollActive
options.getAutoPreRollAgeMs=()=>preRollActive?Math.min(now-preRollBeganAt,1000):0
await flush();await advance(1000)
assert.equal(output.handsFreeListeningReady,false,'Live microphone alone must not claim pre-roll is ready')
rms=.3;await advance(500)
assert.equal(starts,0,'An early attack must not cold-start a clipped take')
rms=0;preRollActive=true;preRollBeganAt=now;await advance(900)
assert.equal(output.handsFreeListeningReady,false,'The recorder needs its full pre-roll buffer')
await advance(200)
assert.equal(output.handsFreeListeningReady,true)
options.isAutoPreRollCaptureActive=undefined
options.getAutoPreRollAgeMs=undefined
rms=.3;await advance(1800)
assert.equal(starts,1,'Slow recorder startup must not cause repeated starts')
assert.equal(output.handsFreeRecording,true)
rms=0;await advance(1200)
assert.equal(stops,1,'Slow-started recording must retain automatic silence stop')
assert.equal(finished,1,'Replay must be requested once, before the stop')
rms=.4;await advance(3000)
assert.equal(starts,1,'Playback suppression must prevent another recording')
options.monitoringPaused=false;rms=0;dirty=true;await advance(1000)
rms=.3;await advance(1800);rms=0;await advance(1200)
assert.equal(starts,2);assert.equal(stops,2);assert.equal(finished,2)
// The app's own click must neither start a take nor keep a finished phrase
// recording forever. A real sustained phrase still starts between clicks.
options.monitoringPaused=false;rms=0;dirty=true;await advance(1000)
globalThis.__handsfreeTest.metronomePlaying=true
for(let beat=0;beat<5;beat++){
 globalThis.__handsfreeTest.metronomeTick?.({audible:true})
 rms=.4;await advance(150);rms=.15;await advance(80);rms=0;await advance(270)
}
assert.equal(starts,2,'Metronome clicks alone must never start hands-free')
rms=.3
for(let beat=0;beat<4;beat++){
 globalThis.__handsfreeTest.metronomeTick?.({audible:true})
 await advance(150);await advance(350)
}
assert.equal(starts,3,'A sustained instrument can start while the metronome plays')
for(let beat=0;beat<5;beat++){
 globalThis.__handsfreeTest.metronomeTick?.({audible:true})
 rms=.4;await advance(150);rms=0;await advance(350)
}
assert.equal(stops,3,'Known metronome clicks must not indefinitely postpone quiet-stop')
options.monitoringPaused=false;rms=0;dirty=true;await advance(1000)
for(let beat=0;beat<8;beat++){
 globalThis.__handsfreeTest.metronomeTick?.({audible:true})
 rms=.4;await advance(150);rms=.15;await advance(80);rms=0;await advance(20)
}
assert.equal(starts,3,'Fast click subdivisions and their tails must not start a take')
rms=.3
for(let beat=0;beat<6;beat++){
 globalThis.__handsfreeTest.metronomeTick?.({audible:true})
 await advance(250)
}
assert.equal(starts,4,'A sustained phrase remains triggerable between fast clicks')
await advance(1000)
for(let beat=0;beat<8;beat++){
 globalThis.__handsfreeTest.metronomeTick?.({audible:true})
 rms=.4;await advance(150);rms=0;await advance(100)
}
assert.equal(stops,4,'Fast subdivisions cannot hold a finished take open')
globalThis.__handsfreeTest.metronomePlaying=false
// A room above the saved gate should become the baseline, not an arming deadlock.
options.monitoringPaused=false;rms=.3;dirty=true;await advance(7500)
assert.equal(output.handsFreeListeningReady,true,'Continuous room noise must not trap the widget in Getting ready')
assert.equal(starts,4,'Learning room noise must not start a recording')
console.log('PASS: slow start, one replay per take, speaker suppression, repeated cycles, noisy-room calibration')
rms=0;await advance(1000)
let mark='pending'
options.tryMarkAutoPerformance=()=>mark;dirty=true
rms=.3;await advance(350)
rms=0;await advance(600)
mark='started';await advance(1000)
assert.equal(starts,4,'A pending entrance that went quiet must not trigger late')
options.enabled=false;dirty=true;await flush()
console.log('PASS: stale pending entrance cancelled and monitor disabled cleanly')

options.enabled=true
options.ready=false
options.streamRef={current:{getAudioTracks:()=>[]}}
let warms=0
options.warmRecorder=()=>{warms++}
dirty=true
await advance(200)
assert.ok(warms>0,'Hands-free must warm capture when no WebKit stream is live yet')
assert.equal(output.handsFreeListeningReady,false,'Listening is not ready until audio actually arrives')
console.log('PASS: missing microphone warms native capture instead of sitting idle')

// Leaving a surface and coming back must rearm without toggling hands-free.
options.enabled=false;dirty=true;await flush()
options.streamRef=streamRef;options.ready=true;options.enabled=true
options.monitoringAllowed=false;dirty=true;await advance(1000)
assert.equal(output.handsFreeListeningReady,false)
options.monitoringAllowed=true;dirty=true;await advance(1000)
assert.equal(output.handsFreeListeningReady,true)
for(const listener of visibilityListeners)listener()
await advance(1000)
assert.equal(output.handsFreeListeningReady,true,'Returning to a visible tab rearms')
await advance(60000)
assert.equal(output.handsFreeListeningReady,true,'Idle time does not disable listening')
console.log('PASS: surface return, visibility return, and one minute idle')

// A transient setup error must recover with no user toggle.
options.enabled=false;dirty=true;await flush()
globalThis.__handsfreeTest.failSetup=true
options.enabled=true;dirty=true;await advance(1000)
assert.equal(output.handsFreeNotice,'microphone')
globalThis.__handsfreeTest.failSetup=false
await advance(3500)
assert.equal(output.handsFreeListeningReady,true,'Setup failure retries automatically')
console.log('PASS: failed microphone setup automatically retries')

// Cold launch: the widget is already on but Web Audio setup has not resolved.
options.enabled=false;dirty=true;await flush()
let releaseSetup
const heldSetup = new Promise(resolve=>{releaseSetup=resolve})
globalThis.__handsfreeTest.setupGate=heldSetup
options.enabled=true;dirty=true;await advance(1000)
assert.equal(output.handsFreeListeningReady,false)
globalThis.__handsfreeTest.setupGate=null
await advance(3000)
assert.equal(output.handsFreeListeningReady,true,'Cold-start watchdog retries a hung setup without toggling the widget')
releaseSetup();await flush()
assert.equal(output.handsFreeListeningReady,true,'Late original setup cannot replace recovered monitoring')
context.state='interrupted'
await advance(500)
assert.equal(context.state,'running','Interrupted Web Audio is resumed as well as suspended audio')
console.log('PASS: saved-on cold launch, hung setup, and interrupted audio recovery')

// Native session flags may say active even when no frames ever arrive.
options.enabled=false;dirty=true;await flush()
options.streamRef={current:{getAudioTracks:()=>[]}}
globalThis.__handsfreeTest.nativeSession=()=>true
options.isNativeAudioCaptureActive=()=>true
options.isAutoPreRollCaptureActive=()=>true
let recycles=0
options.restartAutoPreRollCapture=()=>{recycles++}
options.enabled=true;dirty=true;await advance(5500)
assert.ok(recycles>0,'An active native session without frames must rebuild idle capture')
assert.equal(output.handsFreeNotice,'microphone')
assert.equal(output.handsFreeListeningReady,false)
async function nativeFrames(ms){for(let t=0;t<ms;t+=48){globalThis.__handsfreeTest.nativeListener?.({samples:new Float32Array(128),sampleRate:48000});await advance(48)}}
await nativeFrames(1000)
assert.equal(output.handsFreeListeningReady,true,'New native frames rearm after recovery')
const previousRecycles=recycles
await advance(6000)
assert.ok(recycles>previousRecycles,'Previously flowing native audio must recover when frames stop')
await nativeFrames(1000)
assert.equal(output.handsFreeListeningReady,true)
// Never recycle a visible take as if it were disposable pre-roll.
options.isRecording=true;dirty=true;await flush()
const duringTakeRecycles=recycles
await advance(6000)
assert.equal(recycles,duringTakeRecycles,'Missing frames must not discard a real take')
assert.equal(output.handsFreeListeningReady,false)
await nativeFrames(1000)
assert.equal(output.handsFreeListeningReady,true,'Active-take monitor also reattaches without discarding capture')
options.enabled=false;dirty=true;await flush()
console.log('PASS: native first-frame failure, native stall recovery, and active-take protection')

// Use production instrument profiles for the room tests, not the simplified
// lifecycle gate above. All samples still pass through the real monitor hook.
const profilesBuild=await build({stdin:{contents:"export {getAutoRecordProfile} from './src/utils/appSettings'",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'})
const {getAutoRecordProfile}=await import(`data:text/javascript;base64,${Buffer.from(profilesBuild.outputFiles[0].text).toString('base64')}`)
globalThis.__handsfreeTest.profile=getAutoRecordProfile
peakRatio=3
async function roomScenario(noise,family='Strings') {
 options.enabled=false;dirty=true;await flush()
 options.isRecording=false;options.monitoringPaused=false;options.suppressStart=false
 options.streamRef=streamRef;options.ready=true;options.monitoringAllowed=true
 options.isNativeAudioCaptureActive=undefined;options.isAutoPreRollCaptureActive=undefined
 options.getAutoPreRollAgeMs=undefined;options.tryMarkAutoPerformance=undefined
 options.restartAutoPreRollCapture=undefined;options.instrumentFamily=family;options.volumeThreshold=20
 globalThis.__handsfreeTest.nativeSession=()=>false
 globalThis.__handsfreeTest.metronomePlaying=false
 rms=noise;options.enabled=true;dirty=true;await advance(1500)
}
for (const family of ['Strings','Woodwind','Brass','Voice & keys']) {
 const before=starts, stoppedBefore=stops
 await roomScenario(.025,family)
 assert.equal(output.handsFreeListeningReady,true,`${family}: loud room arms without absolute silence`)
 for(let i=0;i<100;i++){rms=.025*(1+Math.sin(i)*.08);await advance(48)}
 assert.equal(starts,before,`${family}: ordinary room fluctuations do not start a take`)
 rms=.09;await advance(48);rms=.025;await advance(700)
 assert.equal(starts,before,`${family}: a brief bump is rejected`)
 rms=.05;await advance(1600)
 assert.equal(starts,before+1,`${family}: intentional playing above the room starts`)
 assert.equal(output.handsFreeRecording,true)
 if(family==='Strings') {
  options.instrumentFamily='Brass';options.volumeThreshold=80;dirty=true;await advance(400)
  assert.equal(output.handsFreeRecording,true,'Changing instrument and start level cannot interrupt an active take')
 }
 rms=.025;await advance(1600)
 assert.equal(stops,stoppedBefore+1,`${family}: room noise cannot keep the take recording`)
 assert.equal(options.monitoringPaused,true,'A completed phrase requests its replay')
}
// Gradual fan/noise changes are learned while idle. Once the room becomes
// quiet, a soft phrase should work without touching sensitivity settings.
await roomScenario(.008)
let before=starts
for(let i=0;i<400;i++){rms=.008+i*.000025;await advance(48)}
assert.equal(starts,before,'Gradually rising room noise must not trigger')
rms=.0002;await advance(2500)
rms=.003;await advance(1600)
assert.equal(starts,before+1,'A quieter room restores sensitivity to soft playing')
rms=.0002;await advance(1600)
// Playing during startup after a short baseline must not wait for that same
// note to end before the detector will arm.
await roomScenario(.0002)
options.enabled=false;dirty=true;await flush()
before=starts;rms=.0002;options.enabled=true;dirty=true;await advance(240)
rms=.02;await advance(1800)
assert.equal(starts,before+1,'An entrance during warm-up is recognized without another quiet pause')
rms=.0002;await advance(1600)
// Manual capture is independent of the arming/calibration state and must not
// be automatically ended by a detector that never triggered it.
await roomScenario(.02)
options.enabled=false;dirty=true;await flush()
options.enabled=true;options.isRecording=true;dirty=true
const manualStops=stops
await advance(3000)
assert.equal(stops,manualStops,'Room calibration cannot stop a manually started take')
options.enabled=false;options.isRecording=false;dirty=true;await flush()
console.log('PASS: production instrument profiles, noisy-room arming, bumps, gradual noise, soft entrances, warm-up entrances, and manual take isolation')

// Native iPhone/iPad PCM uses the same room decisions as Web Audio.
options.enabled=false;dirty=true;await flush()
options.isRecording=false;options.monitoringPaused=false
options.streamRef={current:{getAudioTracks:()=>[]}}
globalThis.__handsfreeTest.nativeSession=()=>true
options.isNativeAudioCaptureActive=()=>true
options.isAutoPreRollCaptureActive=()=>true
options.getAutoPreRollAgeMs=()=>1000
options.enabled=true;dirty=true;await flush()
async function nativeLevel(value,ms) {
 for(let t=0;t<ms;t+=48){
  const samples=Float32Array.from({length:2048},(_,i)=>value*Math.SQRT2*Math.sin(i*Math.PI/32))
  globalThis.__handsfreeTest.nativeListener?.({samples,sampleRate:48000})
  await advance(48)
 }
}
before=starts
await nativeLevel(.025,1600)
assert.equal(output.handsFreeListeningReady,true,'Native PCM arms in a noisy room')
assert.equal(starts,before)
await nativeLevel(.05,1800)
assert.equal(starts,before+1,'Native PCM playing above the baseline starts')
const nativeStops=stops
await nativeLevel(.025,1600)
assert.equal(stops,nativeStops+1,'Native room noise does not block replay')
options.enabled=false;dirty=true;await flush()
// Calibrate with the metronome already running; click energy must not become
// the noise floor and hide the musician's softer entrance.
options.streamRef=streamRef;options.isNativeAudioCaptureActive=undefined
options.isAutoPreRollCaptureActive=undefined;options.getAutoPreRollAgeMs=undefined
options.monitoringPaused=false;options.isRecording=false
globalThis.__handsfreeTest.nativeSession=()=>false
globalThis.__handsfreeTest.metronomePlaying=true
rms=.001;options.enabled=true;dirty=true;await flush()
before=starts
for(let beat=0;beat<6;beat++){
 globalThis.__handsfreeTest.metronomeTick?.({audible:true})
 rms=.3;await advance(150);rms=.1;await advance(80);rms=.001;await advance(270)
}
assert.equal(output.handsFreeListeningReady,true,'Click during startup does not block calibration')
assert.equal(starts,before,'Startup clicks do not trigger a take')
for(let beat=0;beat<5;beat++){
 globalThis.__handsfreeTest.metronomeTick?.({audible:true})
 rms=.3;await advance(150);rms=.006;await advance(350)
}
assert.equal(starts,before+1,'Playing softer than the metronome still triggers after calibration')
options.enabled=false;dirty=true;await flush()
console.log('PASS: native noisy-room recording and calibration with metronome already playing')

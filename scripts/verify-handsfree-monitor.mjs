import assert from 'node:assert/strict'
import { build } from 'esbuild'

// Exercise the real hook with a deterministic microphone and slow recorder.
let now = 0, seq = 0, slots = [], cursor = 0, effects = [], dirty = true, output
const timers = new Map()
const schedule = (fn, ms, repeat = false) => { const id = ++seq; timers.set(id, { fn, at: now + ms, ms, repeat }); return id }
globalThis.window = { setTimeout: (f,m)=>schedule(f,m), clearTimeout:id=>timers.delete(id), setInterval:(f,m)=>schedule(f,m,true), clearInterval:id=>timers.delete(id) }
globalThis.document = { visibilityState:'visible', addEventListener(){}, removeEventListener(){} }
Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true})
let rms = 0, starts = 0, stops = 0, finished = 0
const context = { state:'running', createAnalyser:()=>({fftSize:128,smoothingTimeConstant:0}), createMediaStreamSource:()=>({connect(){},disconnect(){}}) }
const changed = (a,b) => !a || !b || a.length!==b.length || a.some((v,i)=>v!==b[i])
const hooks = {
 useRef(value){const i=cursor++;return slots[i]??= {current:value}},
 useState(value){const i=cursor++;if(!slots[i])slots[i]={value:typeof value==='function'?value():value};return [slots[i].value,next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true}}]},
 useCallback(fn,deps){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={value:fn,deps};return slots[i].value},
 useEffect(fn,deps){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn()})}},
}
hooks.useLayoutEffect=hooks.useEffect
globalThis.__handsfreeTest={hooks,context,metrics:()=>({rms,peak:rms})}
const stubs = {
 'react': 'export const {useRef,useState,useCallback,useEffect,useLayoutEffect}=globalThis.__handsfreeTest.hooks',
 'audioLevel': 'export const readAnalyserMetrics=()=>globalThis.__handsfreeTest.metrics(); export const combinedGateLevel=m=>m.rms',
 'appSettings': 'export const getAutoRecordProfile=()=>({gate:.1,holdMs:140,noiseHeadroom:1.2,noiseMargin:.01,gateCapMultiplier:2,stopGateRatio:.6,usePeak:false})',
 'appForeground': 'export const isAppInForeground=()=>true; export const subscribeAppForeground=()=>()=>{}',
 'playbackAudioContext': 'export const getPlaybackAudioContext=async()=>globalThis.__handsfreeTest.context; export const isSharedPlaybackContext=()=>true',
 'nativeAudioPitchTap': 'export const acquireNativeAudioTap=async()=>{}; export const releaseNativeAudioTap=async()=>{}; export const subscribeNativeAudioPitchFrames=async()=>null',
 'cameraSessionState': 'export const isNativeCameraPreviewActive=()=>false; export const isNativeCaptureSessionActive=()=>globalThis.__handsfreeTest.nativeSession?.()??false',
 'sharedMetronomeEngine': 'export const sharedMetronomeEngine={subscribeTick:()=>()=>{},getSnapshot:()=>({playing:false})}',
 'autoRecordPlayback': 'export const AUTO_RECORD_MAX_IDLE_PREROLL_MS=20000',
}
const result=await build({entryPoints:['src/hooks/useAutoSoundRecording.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'devices',setup(b){b.onResolve({filter:/.*/},args=>{const key=args.path.split('/').at(-1);if(stubs[key])return {path:key,namespace:'stub'}});b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'js'}))}}]})
const {useAutoSoundRecording}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const streamRef={current:{getAudioTracks:()=>[{readyState:'live',enabled:true}]}}
const options={enabled:true,monitoringAllowed:true,suppressStart:false,ready:true,isRecording:false,streamRef,streamGeneration:0,silenceMs:500,volumeThreshold:20,
 startRecording(){starts++;schedule(()=>{options.isRecording=true;dirty=true},900)},
 stopRecording(){stops++;options.isRecording=false;dirty=true},warmRecorder(){},disarmRecorder(){},onAutoRecordingFinished(){finished++;options.monitoringPaused=true;dirty=true}}
async function flush(){for(let n=0;n<10;n++){if(dirty){dirty=false;cursor=0;output=useAutoSoundRecording(options);const pending=effects;effects=[];pending.forEach(f=>f())}await Promise.resolve();if(!dirty&&!effects.length)break}}
async function advance(ms){const end=now+ms;while(true){await flush();let chosen;for(const [id,t]of timers)if(t.at<=end&&(!chosen||t.at<chosen[1].at))chosen=[id,t];if(!chosen)break;const[id,t]=chosen;now=t.at;if(t.repeat)t.at+=t.ms;else timers.delete(id);t.fn()}now=end;await flush()}
await flush();await advance(1000)
assert.equal(output.handsFreeListeningReady,true)
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
// A room that never gets below the chosen gate should explain why it cannot arm.
options.monitoringPaused=false;rms=.3;dirty=true;await advance(7500)
assert.equal(output.handsFreeNotice,'sensitive')
assert.equal(starts,2,'Continuous room noise must not arm by timeout')
console.log('PASS: slow start, one replay per take, speaker suppression, repeated cycles, noisy-room notice')
rms=0;await advance(1000)
let mark='pending'
options.tryMarkAutoPerformance=()=>mark;dirty=true
rms=.3;await advance(350)
rms=0;await advance(600)
mark='started';await advance(1000)
assert.equal(starts,2,'A pending entrance that went quiet must not trigger late')
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

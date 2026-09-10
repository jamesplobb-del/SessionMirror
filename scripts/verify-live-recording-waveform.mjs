import assert from 'node:assert/strict'
import { build } from 'esbuild'
let effect, received, callback, claims=0, releases=0, removals=0, resolveListener
const refs=[]
globalThis.__waveformTest = {
 useState: initial => { received=typeof initial==='function'?initial():initial; return [received,v=>{received=v}] },
 useRef: value => { const ref={current:value};refs.push(ref);return ref },
 useEffect: fn=>{effect=fn},
 subscribe: fn=>{callback=fn;return new Promise(resolve=>{resolveListener=()=>resolve({remove:async()=>{removals++}})})},
 acquire:async()=>{claims++},release:async()=>{releases++},
}
const bundle=await build({entryPoints:['src/hooks/useLiveRecordingWaveform.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'waveform-boundaries',setup(b){
 b.onResolve({filter:/^(react)$|nativeCameraTest$|nativeAudioPitchTap$/},a=>({path:a.path,namespace:'test'}))
 b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='react'
 ? 'export const {useState,useRef,useEffect}=globalThis.__waveformTest'
 : a.path.endsWith('nativeCameraTest') ? 'export const isNativeCameraTestAvailable=()=>true'
 : 'export const {subscribe:subscribeNativeAudioPitchFrames,acquire:acquireNativeAudioTap,release:releaseNativeAudioTap}=globalThis.__waveformTest'}))
}}]})
const {useLiveRecordingWaveform}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
useLiveRecordingWaveform({active:true,streamRef:{current:null},streamGeneration:0})
const cleanup=effect()
assert.equal(claims,1,'Waveform must request PCM even with the tuner closed')
const silent=received.at(-1)
callback({samples:new Float32Array(2048).fill(.2),sampleRate:48000})
assert.ok(received.at(-1)>silent,'Live samples must update the display before recording stops')
assert.equal(received.length,72)
cleanup()
assert.equal(releases,1,'Leaving Record releases only the waveform tap claim')
const stopped=received
callback({samples:new Float32Array(2048).fill(.8),sampleRate:48000})
assert.equal(received,stopped,'Late samples do not update an unmounted waveform')
resolveListener();await new Promise(r=>setImmediate(r))
assert.equal(removals,1,'Subscription resolving after unmount is still removed')
useLiveRecordingWaveform({active:false,streamRef:{current:null},streamGeneration:1})
assert.equal(effect(),undefined)
assert.equal(claims,1,'Inactive record surface does not acquire capture')
console.log('PASS: standalone live waveform, measured amplitude updates, bounded history, cancellation during subscription setup, and balanced shared-tap ownership.')

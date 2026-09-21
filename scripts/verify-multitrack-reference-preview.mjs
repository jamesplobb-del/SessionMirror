import assert from 'node:assert/strict'
import { build } from 'esbuild'
const waiting = new Map()
globalThis.__ready = el => new Promise(resolve => waiting.set(el, resolve))
globalThis.HTMLMediaElement = { HAVE_METADATA: 1 }
globalThis.window = { clearTimeout }
const stubs = {
 react: 'export const useRef=v=>({current:v}),useState=v=>[v,()=>{}],useCallback=f=>f,useEffect=()=>{};',
 takePlaybackAudio: 'export const playTakeMediaAudible=async()=>true,primeTakePlaybackForUserGesture=()=>{};',
 mediaPlayback: 'export const waitForMediaReady=globalThis.__ready,waitForMediaProgressing=async()=>true;',
 playbackRouteCoordinator: 'export const preparePlaybackRoute=async()=>{};',
 playbackAudioContext: 'export const ensurePlaybackAudioContextRunning=async()=>{},resumePlaybackAudioContext=async()=>{};',
 takePlaybackSpeaker: 'export const hasTakePlaybackSpeakerRoute=()=>false,routeTakePlaybackToSpeaker=()=>{},updateTakePlaybackSpeakerGain=()=>{};',
 multitrackTransport: 'export const multitrackTransport={reanchor(){},pause(){},arm(){},now(){return 0},position(){return 0}};',
}
const bundle = await build({entryPoints:['src/multitrack/synchronization/useMultitrackSync.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'media-harness',setup(b){
 b.onResolve({filter:/.*/},args=>{const key=args.path.split('/').at(-1);if(stubs[key])return {path:key,namespace:'harness'}})
 b.onLoad({filter:/.*/,namespace:'harness'},args=>({contents:stubs[args.path]}))
}}]})
const {useMultitrackSync}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const media=()=>({duration:20,readyState:0,src:'local-take',currentTime:20,style:{opacity:'0'},volume:1,muted:false,load(){this.loads=(this.loads??0)+1},pause(){},setAttribute(){},addEventListener(){},removeEventListener(){}})
const sync=useMultitrackSync(), reference=media(), muted=media(), target=media()
for(const [id,el] of [['reference',reference],['muted',muted],['target',target]])sync.registerMedia(id,el)
sync.setExcludePanelId('target');sync.setReferencePanelIds(['reference','muted']);sync.setPanelMuted('muted',true)
sync.setPanelTrim('reference',2,18);sync.setPanelOffset('reference',-3000)
const pending=sync.prepareVisualAtStart(5)
assert.equal(reference.currentTime,20,'Do not seek before reference metadata is ready')
assert.equal(waiting.has(target),false,'Recording target is never loaded as a reference')
for(const el of [reference,muted]){el.readyState=2;waiting.get(el)()}
await pending
assert.equal(reference.currentTime,4,'Reference respects trim and timeline offset')
assert.equal(reference.style.opacity,'1','Previously ended reference becomes visible again')
assert.equal(muted.style.opacity,'1','Muted references remain visible')
assert.equal(muted.muted,true,'Visual preparation does not unmute the monitor')
assert.equal(target.currentTime,20,'Target remains untouched')
reference.currentTime=9
const cancelled=sync.prepareVisualAtStart(0)
sync.pause()
for(const el of [reference,muted])waiting.get(el)()
await cancelled
assert.equal(reference.currentTime,9,'Closing/pausing cancels late readiness work')
console.log('PASS: reference readiness, trim/offset positioning, visible muted references, target exclusion, and cancellation.')

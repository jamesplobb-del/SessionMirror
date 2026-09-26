import assert from 'node:assert/strict'
import { build } from 'esbuild'
const calls = []
let finishStop
let rejectPrepare = false
globalThis.__transportTest = {
  stopMultitrackTransport: async () => { calls.push('stop'); await new Promise(resolve => { finishStop = resolve }); calls.push('stopped') },
  prepareMultitrackMonitor: async () => { calls.push('prepare'); if(rejectPrepare) throw Error('unreadable take'); return {prepared:true} },
  startMultitrackTransport: async () => { calls.push('start'); return {performanceEpochMs:100} },
  setMultitrackSourceMix: async ({id,volume,muted}) => { calls.push(`mix:${id}:${volume}:${muted}`) },
}
const bundle = await build({entryPoints:['src/multitrack/synchronization/nativeMultitrackTransport.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'native-double',setup(b){
  b.onResolve({filter:/^@capacitor\/core$|audioSessionRoute$/},args=>({path:args.path,namespace:'double'}))
  b.onLoad({filter:/.*/,namespace:'double'},args=>({contents:args.path==='@capacitor/core' ? "export const Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios'}" : 'export default globalThis.__transportTest'}))
}}]})
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const stop = api.stopNativeMultitrackTransport()
const prepare = api.prepareNativeMultitrackMonitor([])
const start = api.startNativeMultitrackTransport({bpm:120,beatsPerBar:4,countInBars:1,clickEnabled:true,soundId:'click'})
await new Promise(resolve=>setImmediate(resolve))
assert.deepEqual(calls,['stop'],'Next part must wait while the previous stop is in flight')
finishStop()
await Promise.all([stop,prepare,start])
assert.deepEqual(calls,['stop','stopped','prepare','start'],'Keep → next part preserves native operation order')
await api.setNativeMultitrackSourceMix('box-1',0.35,false)
await api.setNativeMultitrackSourceMix('box-1',0.35,true)
assert.deepEqual(calls.slice(-2),['mix:box-1:0.35:false','mix:box-1:0.35:true'],'Live level and mute reach the native mixer in order')
rejectPrepare = true
await assert.rejects(api.prepareNativeMultitrackMonitor([]),/unreadable take/)
rejectPrepare = false
assert.equal(await api.prepareNativeMultitrackMonitor([]),true,'A failed part does not wedge the next retry')
delete globalThis.__transportTest
console.log('PASS: native transport handoff and live mix updates preserve order and recover after failure')

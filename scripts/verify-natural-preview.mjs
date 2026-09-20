import assert from 'node:assert/strict'
import { build } from 'esbuild'
const state = globalThis.__naturalPreviewTest = {
  enabled: true, revision: 0, baked: new Set(), renders: [], starts: [], stops: 0, nextRender: null,
}
const bundle = await build({
  stdin: { contents: "export * from './src/utils/naturalTakePreview'; export * from './src/utils/nativeInlineTakeBoxPlayback'", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'native-double', setup(b) {
    const mocks = {
      '@capacitor/core': "export const Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios',convertFileSrc:x=>x}",
      takeStorage: "export const resolveNativeFileUri=async x=>x",
      takePlaybackSpeaker: `const s=globalThis.__naturalPreviewTest; export const enhancementParamsForSource=x=>s.enabled&&!s.baked.has(x)?{version:2,amount:.6,matchOriginalLevel:0}:undefined; export const registerRenderedEnhancementSource=x=>s.baked.add(x); export const takePlaybackEnhancerRevision=()=>s.revision`,
      audioSessionRoute: `const s=globalThis.__naturalPreviewTest; export default {
        addListener:async()=>({remove:async()=>{}}),
        enhanceTakeAudio:async o=>{s.renders.push(o); if(s.nextRender)return s.nextRender(o); return {path:o.url+'.enhanced',enhanced:true,duration:4}},
        startInlineTakeBoxPlayback:async o=>{s.starts.push(o)},stopInlineTakeBoxPlayback:async()=>{s.stops++}
      }`,
    }
    b.onResolve({ filter: /(@capacitor\/core|takeStorage|takePlaybackSpeaker|audioSessionRoute)$/ }, args => ({path: args.path === '@capacitor/core' ? args.path : args.path.split('/').pop(), namespace:'double'}))
    b.onLoad({ filter: /.*/, namespace:'double' }, args=>({contents:mocks[args.path]}))
  } }],
})
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
assert.deepEqual(await Promise.all([api.prepareNaturalTakePreview('file:///one.mp4','video'),api.prepareNaturalTakePreview('file:///one.mp4','video')]), ['file:///one.mp4.enhanced','file:///one.mp4.enhanced'])
assert.equal(state.renders.length,1,'Concurrent preview preparation deduplicates')
state.enabled=false
assert.equal(await api.prepareNaturalTakePreview('file:///one.mp4','video'),'file:///one.mp4')
state.enabled=true
assert.equal(await api.prepareNaturalTakePreview('file:///one.mp4.enhanced','video'),'file:///one.mp4.enhanced','Baked preview is never processed twice')
assert.equal(await api.prepareNaturalTakePreview('https://example.com/reference.mp4','video'),'https://example.com/reference.mp4')
state.nextRender=async()=>{throw new Error('render failed')}
await assert.rejects(api.prepareNaturalTakePreview('file:///retry.mp4','video'))
state.nextRender=null
assert.equal(await api.prepareNaturalTakePreview('file:///retry.mp4','video'),'file:///retry.mp4.enhanced','Failures can retry')
const layout={x:0,y:0,width:100,height:100,cornerRadius:8}
await api.startNativeInlineTakeBoxPlayback({filePath:'file:///active.mp4',layout,ownerId:'active'})
let resolveRender
state.nextRender=()=>new Promise(resolve=>{resolveRender=resolve})
const pending=api.startNativeInlineTakeBoxPlayback({filePath:'file:///pending.mp4',layout,ownerId:'pending'})
while(!resolveRender) await new Promise(resolve=>setImmediate(resolve))
await api.stopNativeInlineTakeBoxPlayback({ownerId:'pending'})
assert.equal(state.stops,0,'Cancelling a pending owner preserves the active sibling')
resolveRender({path:'file:///pending.enhanced.mp4',enhanced:true,duration:4})
assert.equal(await pending,false)
assert.equal(state.starts.length,1,'Cancelled enhancement cannot start late playback')
let changedResolve
state.nextRender=()=>new Promise(resolve=>{changedResolve=resolve})
const changed=api.prepareNaturalTakePreview('file:///settings.mp4','video')
while(!changedResolve) await new Promise(resolve=>setImmediate(resolve))
state.revision++
changedResolve({path:'file:///settings.enhanced.mp4',enhanced:true,duration:4})
await assert.rejects(changed,{name:'AbortError'})
console.log('PASS: preview deduplication, original/baked/remote bypass, failed-render retry, pending-owner cancellation, settings cancellation')

import assert from 'node:assert/strict'
import { build } from 'esbuild'
const state = globalThis.__naturalPreviewTest = {
  enabled: true, revision: 0, baked: new Set(), renders: [], starts: [], stops: 0, nextRender: null, resolveFile: null,
}
const bundle = await build({
  stdin: { contents: "export * from './src/utils/naturalTakePreview'; export * from './src/utils/nativeInlineTakeBoxPlayback'", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'native-double', setup(b) {
    const mocks = {
      '@capacitor/core': "export const Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios',convertFileSrc:x=>x}",
      takeStorage: "export const resolveNativeFileUri=async x=>globalThis.__naturalPreviewTest.resolveFile ? globalThis.__naturalPreviewTest.resolveFile(x) : x",
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
// A stalled whole-file render must not delay playback, even for that same take.
let resolveRender
state.nextRender=()=>new Promise(resolve=>{resolveRender=resolve})
const rendering=api.prepareNaturalTakePreview('file:///pending.mp4','video')
while(!resolveRender) await new Promise(resolve=>setImmediate(resolve))
const rendersBefore=state.renders.length
assert.equal(await api.startNativeInlineTakeBoxPlayback({filePath:'file:///pending.mp4',layout,ownerId:'pending'}),true)
assert.equal(state.starts.at(-1).url,'file:///pending.mp4','Pending enhancement plays the original immediately')
assert.equal(state.renders.length,rendersBefore,'Playback does not enqueue additional renders')
resolveRender({path:'file:///pending.enhanced.mp4',enhanced:true,duration:4})
await rendering
assert.equal(state.starts.at(-1).url,'file:///pending.mp4','Render completion does not replace active playback')
assert.equal(await api.readyNaturalTakePreview('file:///pending.mp4','video'),'file:///pending.enhanced.mp4','Later playback can reuse a ready render')
state.enabled=false
assert.equal(await api.readyNaturalTakePreview('file:///pending.mp4','video'),'file:///pending.mp4','Disabled enhancement ignores cached render')
state.enabled=true
// Cancellation during file resolution must still prevent a late start.
let resolveFile
state.resolveFile=()=>new Promise(resolve=>{resolveFile=resolve})
const cancelled=api.startNativeInlineTakeBoxPlayback({filePath:'file:///cancelled.mp4',layout,ownerId:'cancelled'})
while(!resolveFile) await new Promise(resolve=>setImmediate(resolve))
await api.stopNativeInlineTakeBoxPlayback({ownerId:'cancelled'})
assert.equal(state.stops,0,'Cancelling a pending owner preserves the active sibling')
state.resolveFile=null
resolveFile('file:///cancelled.mp4')
assert.equal(await cancelled,false)
assert.equal(state.starts.length,2,'Cancelled preparation cannot start late playback')
let changedResolve
state.nextRender=()=>new Promise(resolve=>{changedResolve=resolve})
const changed=api.prepareNaturalTakePreview('file:///settings.mp4','video')
while(!changedResolve) await new Promise(resolve=>setImmediate(resolve))
state.revision++
changedResolve({path:'file:///settings.enhanced.mp4',enhanced:true,duration:4})
await assert.rejects(changed,{name:'AbortError'})
// HTML fallback also keeps the original ready instead of waiting on a render.
globalThis.HTMLVideoElement = class {}
const media = {
  src: 'file:///uncached.mp4', currentSrc: '', currentTime: 2, isConnected: true,
  getAttribute(name) { return name === 'src' ? this.src : null },
  load() { throw new Error('Uncached playback should not reload the media') },
}
const rendersBeforeMedia = state.renders.length
await api.prepareNaturalMediaPreview(media)
assert.equal(media.src, 'file:///uncached.mp4')
assert.equal(state.renders.length, rendersBeforeMedia)
console.log('PASS: preview deduplication, original/baked/remote bypass, failed-render retry, pending-owner cancellation, settings cancellation, immediate playback during a stalled render, ready-cache reuse, no late source replacement')

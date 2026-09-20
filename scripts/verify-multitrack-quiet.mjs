import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result=await build({stdin:{contents:`export * from './src/multitrack/layout/quietWorkspaceLayout';export * from './src/multitrack/layout/layoutPresets';export * from './src/multitrack/layout/composition';export * from './src/multitrack/layout/boxGesture';export * from './src/multitrack/synchronization/editorGeometry';export * from './src/multitrack/state/multitrackPersistence';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env':'{}'}})
const m=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const takes=Array.from({length:12},(_,i)=>({id:`take-${i}`,duration:30}))
const original={projectId:'quiet-check',name:'Parts',aspectRatio:'9:16',layoutId:'twelve',layoutStyle:{gap:6,cornerRadius:12},panels:m.createPanelsForLayout(m.getLayoutPreset('twelve')).map((p,i)=>({...p,take:takes[i]})),sheetMusic:{kind:'sheet-music',id:'music',asset:null},backing:{kind:'none',volume:1},practice:{bpm:120}}
let draft=m.withPortraitLayout(original,'two')
for(let i=0;i<5;i++)draft=m.withExtraBox(draft,`extra-${i}`)
assert.equal(original.panels.length,12,'draft edits do not mutate the saved project')
assert.equal(original.panels.filter(p=>p.hidden).length,0)
assert.equal(draft.panels.filter(p=>p.hidden).length,10)
assert.equal(draft.panels.filter(p=>p.overlay).length,4,'fifth extra does not get added')
assert.deepEqual(m.withPortraitLayout(draft,'twelve').panels.slice(0,12).map(p=>p.take),takes,'all parked takes return')
let raw={xPercent:40,yPercent:40,widthPercent:32,heightPercent:28}
for(let i=0;i<20;i++){raw=m.transformBox(raw,'move',i%2?1:-1,0);const shown=m.spacedLayoutRect(raw,original.layoutStyle);assert.ok(shown.widthPercent<32);assert.equal(raw.widthPercent,32,'repeated dragging does not accumulate spacing shrink')}
assert.equal(raw.xPercent,40)
const clip={trimStart:1,trimEnd:20,duration:30,offsetMs:-3000}
for(const delta of [-100,-1,.05,2,100]){
 const next={...clip,...m.trimWaveformEdge(clip,'start',delta)}
 assert.ok(next.trimStart>=0&&next.trimStart<=19.8)
 for(const source of [next.trimStart,10,19.9])assert.ok(Math.abs((source-next.trimStart-next.offsetMs/1000)-(source-clip.trimStart-clip.offsetMs/1000))<.00001,'retained samples do not slip when trimming the start')
 const end={...clip,...m.trimWaveformEdge(clip,'end',delta)}
 assert.equal(end.offsetMs,clip.offsetMs);assert.equal(end.trimStart,clip.trimStart)
 assert.ok((end.trimEnd??30)-end.trimStart>=.199)
}
assert.equal(m.trimWaveformEdge(clip,'end',100).trimEnd,undefined,'edge can restore the full source')
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}
globalThis.window={localStorage:globalThis.localStorage}
await m.saveMultitrackSession(draft)
const restored=await m.loadMultitrackSession(takes,draft.projectId)
assert.deepEqual(restored.layoutStyle,original.layoutStyle)
assert.equal(restored.panels.filter(p=>p.overlay).length,4)
assert.deepEqual(restored.panels.map(p=>p.take?.id),draft.panels.map(p=>p.take?.id))
assert.deepEqual(m.compositionRects(restored,m.getLayoutPreset('two'),0),m.compositionRects(draft,m.getLayoutPreset('two'),0),'reopening preserves visible geometry')
console.log('PASS: layout drafts preserve takes; four-extra limit; stable drag geometry; non-slipping waveform trims and source bounds; saved style/extras/geometry round-trip.')

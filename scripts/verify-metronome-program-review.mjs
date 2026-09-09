import assert from 'node:assert/strict'
import { build } from 'esbuild'
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}
async function load(entry,plugins=[]){const r=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',plugins});return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`)}
const tempo=await load('src/practiceTimeline/tempoDepth.ts')
const {createDefaultSection,createEmptyTimeline}=await load('src/practiceTimeline/sectionDefaults.ts')
const {effectiveBars}=await load('src/practiceTimeline/timeSignatureLogic.ts')
const ramp=createDefaultSection({bars:1,bpm:60,advanced:{tempoRamp:{enabled:true,endBpm:120,shape:'linear'}}})
assert.equal(tempo.resolveSectionPlaybackBpm(ramp,1,1,4),60)
assert.equal(tempo.resolveSectionPlaybackBpm(ramp,1,4,4),120,'One-bar gradual ramp reaches end tempo')
for(const shape of ['linear','ease-in','ease-out','ease-in-out','stepped']){const section=createDefaultSection({bars:4,bpm:60,advanced:{tempoRamp:{enabled:true,endBpm:120,shape}}});assert.equal(tempo.resolveSectionPlaybackBpm(section,1,1,4),60);assert.equal(tempo.resolveSectionPlaybackBpm(section,4,4,4),120)}
assert.equal(effectiveBars(createDefaultSection({bars:3,repeatCount:2})),6)
const pinned={...ramp,bars:4,advanced:{...ramp.advanced,tempoMarkers:[{id:'pin',measure:2,beat:2,bpm:90}]}}
assert.notEqual(tempo.resolveSectionPlaybackBpm(pinned,2,1,4),90)
assert.equal(tempo.resolveSectionPlaybackBpm(pinned,2,2,4),90)
assert.equal(tempo.resolveSectionPlaybackBpm(pinned,4,4,4),90)
let bar, pulse, config={bpm:80};const click={stop(){},start:async()=>true,applySectionConfig(c){config={...config,...c}},subscribeBar(cb){bar=cb;return()=>{bar=null}},subscribePulse(cb){pulse=cb;return()=>{pulse=null}},getSnapshot:()=>config};globalThis.__programClick=click
const plugin={name:'click-boundary',setup(b){b.onResolve({filter:/sharedMetronomeEngine$/},()=>({path:'click',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const sharedMetronomeEngine=globalThis.__programClick'}))}}
const {TimelinePlaybackEngine}=await load('src/practiceTimeline/playback/timelinePlaybackEngine.ts',[plugin])
const engine=new TimelinePlaybackEngine();const program={...createEmptyTimeline(),settings:{countInBars:2,countInWhen:'every-loop',loopTrack:true},sections:[createDefaultSection({bars:2})]}
assert.equal(engine.prepareSession(program),true);assert.equal(engine.getState().countInActive,true);await engine.togglePlay();bar();assert.equal(engine.getState().countInActive,true);bar();assert.equal(engine.getState().countInActive,false);assert.equal(engine.getState().measure,1);bar();pulse(0);assert.equal(engine.getState().measure,2);bar();assert.equal(engine.getState().countInActive,true);engine.pause();assert.equal(engine.getState().playing,false);engine.exitSession();assert.equal(engine.getState().sessionActive,false)
console.log('PASS: one-bar and multi-bar ramps, five curves, repeat totals, persistent tempo pins, count-in, loop count-in, pause and exit.')

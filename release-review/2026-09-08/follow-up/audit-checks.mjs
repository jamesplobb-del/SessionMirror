import {build} from 'esbuild'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const dir=await mkdtemp(join(tmpdir(),'besttake-audit-'))
try{
 await build({stdin:{contents:`export * from './src/utils/audioEnhancer';export * from './src/multitrack/state/multitrackPersistence';export * from './src/multitrack/layout/layoutPresets';export * from './src/multitrack/export/multitrackExport';`,resolveDir:process.cwd()},outfile:join(dir,'bundle.mjs'),bundle:true,platform:'node',format:'esm',plugins:[{name:'native-audit-stubs',setup(b){b.onResolve({filter:/^@capacitor\/core$|utils\/(audioSessionRoute|shareTakeVideo|nativeAssetCache)$/},a=>({path:a.path,namespace:'audit'}));b.onLoad({filter:/.*/,namespace:'audit'},a=>({contents:a.path.includes('@capacitor')?`export const Capacitor={isNativePlatform:()=>true,getPlatform:()=>"ios"}`:a.path.endsWith('audioSessionRoute')?`export default {renderMultitrackVideo:async p=>{globalThis.auditExportPayload=p;return {path:'mock-render.mp4',durationSeconds:12}},shareMediaFile:async()=>{}}`:a.path.endsWith('shareTakeVideo')?`export const resolveNativeFileUri=async t=>'file:///'+t.filePath`:`export const extensionForBlob=()=>'.png';export const writeBlobToNativeCache=async()=> 'mock-file'`}))}}]})
 const m=await import(pathToFileURL(join(dir,'bundle.mjs')));const store=new Map();globalThis.window={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}}
 const take={id:'take',filePath:'take.mp4',duration:12,videoUrl:'unused',mediaType:'video'};const layout=m.getLayoutPreset('two');const panels=m.createPanelsForLayout(layout);panels[0]={...panels[0],take,volume:.4,muted:true,trimStartSec:1,trimEndSec:8,sectionStartSec:3,sectionEndSec:6};
 const session={layoutId:'two',panels,sheetMusic:{kind:'sheet-music',id:'music',asset:null},practice:{showPitch:false,showMetronome:false,practiceOverlayEnabled:true,clickEnabled:true,countInBars:1,bpm:120},backing:{kind:'none',volume:.85}}
 m.saveMultitrackSession(session);const restored=m.loadMultitrackSession([take]);assert.equal(restored.panels[0].volume,.4);assert.equal(restored.panels[0].trimEndSec,8);assert.equal(restored.panels[0].sectionStartSec,3);assert.equal(m.loadMultitrackSession([]).panels[0].take,null);console.log('PASS: normal mixer/trim/section persistence and deleted-take lookup')
 const result=await m.exportMultitrackSession(session,layout,12);assert.ok(result.ok);const payload=globalThis.auditExportPayload;assert.equal(payload.sources[0].volume,.4);assert.equal(payload.sources[0].muted,true);assert.equal(payload.sources[0].trimStartSec,1);console.log('PASS: mixer and trim reach native export request (mock bridge, not media render)')
 console.log('FINDING: section window reaches export:', 'sectionStartSec' in payload.sources[0]);
 const broken=JSON.parse(store.get('sm.multitrack.session.v1'));broken.panelVolumes=[99];broken.practice.bpm=-20;store.set('sm.multitrack.session.v1',JSON.stringify(broken));const loaded=m.loadMultitrackSession([take]);console.log('FINDING: restored invalid volume/BPM:',loaded.panels[0].volume,loaded.practice.bpm)
 const settings=m.settingsFromPreset('Voice');settings.compression=0;settings.reverb=0;const params=m.buildNativeEnhancerParams(settings);assert.equal(params.ratio,1);console.log('PASS: compression at 0 has ratio 1');assert.equal(params.reverbWetLevel,0);console.log('PASS: zero reverb disables wet feed')
 const original=m.settingsFromPreset('Voice');settings.eq.low=12;assert.notEqual(original.eq.low,12);console.log('PASS: preset edits do not mutate shared defaults')
}finally{await rm(dir,{recursive:true,force:true})}

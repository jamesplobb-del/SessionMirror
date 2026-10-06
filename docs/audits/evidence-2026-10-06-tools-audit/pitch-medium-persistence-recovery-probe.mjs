// Run from repo root. Real repository SQL against isolated SQL.js; simulated persistence rejection.
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import initSqlJs from 'sql.js'
import {join} from 'node:path'
const result=await build({stdin:{contents:"export * from './src/db/pitchInsightsRepository'; export * from './src/db/schema'",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'isolated-web-persistence',setup(b){
 b.onResolve({filter:/^\.\/connection$/},()=>({path:'connection',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const initVaultDatabase=async()=>globalThis.__durabilityDb; export const persistVaultWebStore=()=>globalThis.__persistDurability()'}))
}}]})
const api=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const SQL=await initSqlJs({locateFile:file=>join(process.cwd(),'node_modules/sql.js/dist',file)})
const database=new SQL.Database()
database.run(api.CREATE_SCHEMA_SQL)
globalThis.__durabilityDb={run:async(sql,params=[])=>database.run(sql,params),query:async(sql,params=[])=>{const s=database.prepare(sql);try{s.bind(params);const values=[];while(s.step())values.push(s.getAsObject());return {values}}finally{s.free()}}}
let failPersist=true,durableSnapshot
globalThis.__persistDurability=async()=>{if(failPersist)throw Error('Injected web saveToStore rejection');durableSnapshot=database.export()}
globalThis.window=new EventTarget()
globalThis.CustomEvent=class extends Event{constructor(type,init){super(type);this.detail=init.detail}}
const events=[]
window.addEventListener(api.PITCH_INSIGHTS_UPDATED_EVENT,event=>events.push(event.detail))
const note={midiNote:60,noteName:'C4',octave:4,centsOffset:2,observedAt:1000,durationMs:1200,sampleCount:20,variabilityCents:1,tunerInstrument:'voice',transpositionId:'concert',sessionId:'fixture'}
try{
 await assert.rejects(api.savePitchObservation({...note,id:'A'}),/saveToStore/)
 assert.deepEqual((await api.listPitchObservations()).map(x=>x.id),['A'],'Failed persistence leaves insertion in live DB')
 assert.equal(events.length,0,'Failed persistence suppresses saved event')
 failPersist=false
 await api.savePitchObservation({...note,id:'B',observedAt:2000})
 assert.deepEqual(events.map(x=>x.observation.id),['B'],'Recovery emits only newer note')
 const recovered=new SQL.Database(durableSnapshot)
 const durableIds=recovered.exec('SELECT id FROM pitch_observations ORDER BY id')[0].values.flat()
 assert.deepEqual(durableIds,['A','B'],'Later successful persistence durably saves both insertions')
 recovered.close()
 console.log('CONFIRMED web persistence recovery inconsistency: rejected A remains live; later B persists A+B but only B emits saved. Existing open Insights merges B and cannot discover A until reload. SQL.js in-memory database/export + injected persistence boundary; no IndexedDB/native SQLite.')
}finally{database.close()}

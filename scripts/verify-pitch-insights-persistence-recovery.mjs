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
 await assert.rejects(api.savePitchObservation({...note,id:'A2',observedAt:1500}),/saveToStore/)
 assert.deepEqual((await api.listPitchObservations()).map(x=>x.id),['A2','A'])
 assert.equal(events.length,0,'Repeated failures preserve rejection and suppress success events')
 failPersist=false
 await api.savePitchObservation({...note,id:'B',observedAt:2000})
 assert.deepEqual(events.map(x=>x.kind),['saved','reconciled'],'Recovery follows the specific mutation with exactly one full reload notification')
 assert.equal(events[0].observation.id,'B')
 let recovered=new SQL.Database(durableSnapshot)
 assert.deepEqual(recovered.exec('SELECT id FROM pitch_observations ORDER BY id')[0].values.flat(),['A','A2','B'])
 recovered.close()
 events.length=0
 await api.savePitchObservation({...note,id:'C',observedAt:2500})
 assert.deepEqual(events.map(x=>x.kind),['saved'],'Normal successful writes do not reload all consumers')
 failPersist=true
 await assert.rejects(api.deletePitchObservationsInRange(900,1100,'concert',null),/saveToStore/)
 await assert.rejects(api.deletePitchObservationsForSessionRange('fixture',1400,1600,{transpositionId:'concert',instrumentProfileId:null}),/saveToStore/)
 failPersist=false
 events.length=0
 await api.savePitchObservation({...note,id:'D',observedAt:3000})
 assert.deepEqual(events.map(x=>x.kind),['saved','reconciled'])
 recovered=new SQL.Database(durableSnapshot)
 assert.deepEqual(recovered.exec('SELECT id FROM pitch_observations ORDER BY id')[0].values.flat(),['B','C','D'],'Recovery persists earlier deletions without resurrecting A/A2')
 recovered.close()
 failPersist=true
 await assert.rejects(api.savePitchObservation({...note,id:'E',observedAt:3500}),/saveToStore/)
 failPersist=false
 events.length=0
 await api.deletePitchObservationsForSessionRange('fixture',3400,3600,{transpositionId:'concert',instrumentProfileId:null})
 assert.deepEqual(events.map(x=>x.kind),['session-range-deleted','reconciled'],'Recovery delete notifies specific removal before consumers full reload')
 assert.ok(!(await api.listPitchObservations()).some(x=>x.id==='E'))
 failPersist=true
 await assert.rejects(api.clearPitchObservations(),/saveToStore/)
 failPersist=false
 events.length=0
 await api.savePitchObservation({...note,id:'F',observedAt:4000})
 assert.deepEqual(events.map(x=>x.kind),['saved','reconciled'])
 recovered=new SQL.Database(durableSnapshot)
 assert.deepEqual(recovered.exec('SELECT id FROM pitch_observations ORDER BY id')[0].values.flat(),['F'],'A recovered store cannot resurrect pre-clear observations')
 recovered.close()
 events.length=0
 await api.clearPitchObservations()
 assert.deepEqual(events.map(x=>x.kind),['cleared'],'Normal/native-style successful persistence retains existing event behavior')
 console.log('PASS: actual repository SQL.js writes; repeated persistence rejection, recovered note snapshot, scoped/session/full deletion recovery, single ordered reconciliation, normal success events. Persistence injected; no native SQLite or IndexedDB.')
}finally{database.close()}

import {build} from 'esbuild'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const dir=await mkdtemp(join(tmpdir(),'program-share-'))
const data=new Map()
globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}
try {
 await build({stdin:{contents:`export * from './src/utils/practiceRoutineShare'; export * from './src/utils/practiceRoutines'; export * from './src/practiceTimeline/sectionDefaults'; export * from './src/practiceTimeline/storage/timelineStorage';`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',outfile:join(dir,'test.mjs')})
 const m=await import(pathToFileURL(join(dir,'test.mjs')))
 const program=m.saveTimeline({...m.createEmptyTimeline('Tempo ladder'),sections:[m.createDefaultSection({bpm:92,meter:'6/8',bars:8}),m.createDefaultSection({bpm:112,meter:'4/4',bars:4})]})
 const routine=m.createRoutine('Warm up',[m.createStep({title:'Long tones',kind:'metro',programId:program.id}),m.createStep({title:'Repeat',kind:'metro',programId:program.id})],null)
 const file=m.buildPracticePlanFile(routine)
 assert.equal(Object.keys(JSON.parse(file).programs).length,1)
 data.clear()
 const existing=m.saveTimeline(m.createEmptyTimeline('My existing program'))
 const result=m.importPracticePlanFromText(file);assert.ok(result.ok)
 const id=result.routine.steps[0].programId
 assert.notEqual(id,program.id);assert.equal(id,result.routine.steps[1].programId)
 const restored=m.getTimelineById(id)
 assert.deepEqual(restored.sections.map(s=>[s.bpm,s.meter,s.bars]),[[92,'6/8',8],[112,'4/4',4]])
 assert.equal(m.loadActiveTimelineId(),existing.id)
 const again=m.importPracticePlanFromText(file);assert.ok(again.ok);assert.notEqual(again.routine.steps[0].programId,id)
 const old=JSON.parse(file);delete old.programs
 assert.equal(m.parsePracticePlanFile(JSON.stringify(old)).routine.steps[0].programId,null)
 const malformed=JSON.parse(file);malformed.programs[program.id]={bad:true}
 assert.equal(m.parsePracticePlanFile(JSON.stringify(malformed)).ok,false)
 console.log('PASS: linked programs share once, import with fresh IDs, retain meter/tempo, preserve active program, handle legacy and malformed files')
}finally{await rm(dir,{recursive:true,force:true})}

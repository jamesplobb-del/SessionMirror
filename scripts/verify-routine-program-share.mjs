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
 await build({stdin:{contents:`export * from './src/utils/practiceRoutineShare'; export * from './src/utils/practiceRoutines'; export * from './src/utils/practiceChartStorage'; export * from './src/practiceTimeline/sectionDefaults'; export * from './src/practiceTimeline/storage/timelineStorage'; export * from './src/practiceTimeline/storage/routineFile';`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',outfile:join(dir,'test.mjs')})
 const m=await import(pathToFileURL(join(dir,'test.mjs')))
 const program=m.saveTimeline({...m.createEmptyTimeline('Tempo ladder'),sections:[m.createDefaultSection({bpm:92,meter:'6/8',bars:8}),m.createDefaultSection({bpm:112,meter:'4/4',bars:4})]})
 const routine=m.createRoutine('Warm up',[m.createStep({title:'Long tones',kind:'metro',programId:program.id}),m.createStep({title:'Repeat',kind:'metro',programId:program.id})],null)
 const file=m.buildPracticePlanFile(routine)
 assert.equal(m.PRACTICE_PLAN_VERSION,2,'shared .btplan schema stays at version 2')
 assert.equal(JSON.parse(file).version, m.PRACTICE_PLAN_VERSION)
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
 const scoreId='sender-score'
 const scoreBytes=new Uint8Array([37,80,68,70,45,49,46,55,10])
 await m.savePracticeChart(scoreId,new File([scoreBytes],'Etude.pdf',{type:'application/pdf'}))
 const musicPlan=m.createRoutine('Music practice',[m.createStep({title:'Etude',kind:'record',projectId:scoreId,desk:{...m.blankDesk('audio'),showMusic:true}})],null)
 const layout=m.buildPracticePlanFile(musicPlan)
 assert.equal(JSON.parse(layout).scores,undefined,'Layout must not contain music bytes')
 assert.equal(JSON.parse(layout).routine.steps[0].sharedScoreName,'Etude.pdf')
 const receivedLayout=m.importPracticePlanFromText(layout)
 assert.equal(receivedLayout.ok,true)
 assert.equal(receivedLayout.routine.steps[0].projectId,null)
 assert.equal(receivedLayout.routine.steps[0].sharedScoreName,'Etude.pdf')
 for (const [patternRepeat, repeatCount, measure] of [
   [{kind:'cycles',cycles:8},1,12],
   [{kind:'cycles',cycles:8},2,28],
   [{kind:'totalMeasures',measures:20},1,18],
 ]) {
   const mixed=m.saveTimeline({...m.createEmptyTimeline('Mixed meter'),sections:[m.createDefaultSection({
     bars:4,repeatCount,patternSteps:[{id:'a',meter:'4/4',subdivision:'off',bars:1},{id:'b',meter:'3/4',subdivision:'off',bars:1}],patternRepeat,
     advanced:{tempoMarkers:[{id:'late',measure,beat:2,bpm:132}]},
   })]})
   const standalone=m.parseRoutineFile(m.buildRoutineFile(mixed));assert.ok(standalone.ok)
   const plan=m.createRoutine('Pattern',[m.createStep({title:'Pattern exercise',kind:'metro',programId:mixed.id})],null)
   const imported=m.importPracticePlanFromText(m.buildPracticePlanFile(plan));assert.ok(imported.ok)
   const attached=m.getTimelineById(imported.routine.steps[0].programId)
   for(const restored of [standalone.routine,attached]) {
     const pin=restored.sections[0].advanced.tempoMarkers[0]
     assert.deepEqual([pin.measure,pin.beat,pin.bpm],[measure,2,132],'Mixed-meter tempo pin must survive standalone and embedded imports')
   }
 }
 console.log('PASS: linked programs, score placeholders, fresh IDs, meter/tempo pins, active program, legacy and malformed files')
}finally{await rm(dir,{recursive:true,force:true})}

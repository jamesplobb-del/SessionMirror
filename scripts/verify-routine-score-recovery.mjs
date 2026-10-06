// Actual routine score callbacks and routine-day loading; no DOM/device media.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { build } from 'esbuild'
import { PDFDocument } from 'pdf-lib'
async function bind(file, name, deps) {
  const source = await readFile(file, 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let value
  function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) value = n.initializer; ts.forEachChild(n, visit) }
  visit(ast); assert.ok(value, name)
  const code = ts.transpileModule(`export function bind(d){const {${Object.keys(deps).join(',')}}=d;return ${value.getText(ast)}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).bind(deps)
}
const built = await build({ stdin: { contents: "export * from './src/utils/routineMusic'; export * from './src/utils/practiceRoutines'", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'fixtures', setup(b) {
  b.onResolve({ filter: /\/plusAccess$/ }, () => ({ path: 'plus', namespace: 'fixture' }))
  b.onResolve({ filter: /\/chartDocument$/ }, () => ({ path: 'pdf', namespace: 'fixture' }))
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'plus' ? 'export const requirePlus=()=>true,canUsePlus=()=>true' : "export async function openPdfChart(bytes){await globalThis.__routineScorePdfValidate(bytes);return {destroy(){}}}" }))
} }] })
const api = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const document = await PDFDocument.create(); document.addPage([612,792])
const pdfBytes = await document.save()
globalThis.__routineScorePdfValidate = bytes => PDFDocument.load(bytes)
const pdf = new File([pdfBytes], 'SCORE.PDF', { type: '' })
const events = []; let confirmation = true, saveFails = false, deleteFails = false, present = false, confirmationEffect = () => {}
const working = { current: false }
const deps = { working, alive:{current:true}, requirePlus: () => true, setBusy: () => {}, setError: v => { if(v) events.push(['error',v]) }, step: { projectId: null, title: 'Piece' }, desk: {}, prepareRoutineMusicFile: api.prepareRoutineMusicFile,
  hasPracticeChart: () => present, showConfirm: async () => { events.push(['confirm']); confirmationEffect(); return confirmation }, onCreatePracticeItem: async () => { events.push(['create']); return 'p' },
  savePracticeChart: async (id,file) => { events.push(['save',id,file.type]); if(saveFails) throw Error('save failed') }, clearInkStrokes: () => { events.push(['clear']); return true },
  onChange: () => events.push(['change']), setRevision: () => {}, deletePracticeChart: async () => { events.push(['delete']); if(deleteFails) throw Error('delete failed') } }
const choose = await bind('src/components/RoutineMusicSetup.tsx','choose',deps)
for (const file of [new File([], 'empty.pdf', { type: 'application/pdf' }), new File(['bad'], 'bad.pdf', { type: 'application/pdf' })]) { events.length=0; await choose(file); assert.equal(events.some(e=>e[0]==='create'),false); assert.equal(events.some(e=>e[0]==='save'),false) }
for (const file of [pdf,new File([pdfBytes],'score.PDF',{type:'application/octet-stream'})]) { events.length=0; await choose(file); assert.deepEqual(events.map(e=>e[0]),['create','save','clear','change']); assert.equal(events[1][2],'application/pdf') }
deps.step.projectId='p';present=true;confirmation=false;events.length=0;await choose(pdf);assert.deepEqual(events.map(e=>e[0]),['confirm']);assert.equal(working.current,false)
confirmation=true;saveFails=true;events.length=0;await choose(pdf);assert.equal(events.some(e=>e[0]==='clear'),false);assert.equal(events.some(e=>e[0]==='change'),false)
saveFails=false;events.length=0;await choose(pdf);assert.deepEqual(events.map(e=>e[0]),['confirm','save','clear','change'])
const remove = await bind('src/components/RoutineMusicSetup.tsx','remove',deps)
confirmation=false;events.length=0;await remove();assert.deepEqual(events.map(e=>e[0]),['confirm'])
confirmation=true;deleteFails=true;events.length=0;await remove();assert.equal(events.some(e=>e[0]==='clear'),false)
deleteFails=false;events.length=0;await remove();assert.deepEqual(events.map(e=>e[0]),['confirm','delete','clear','change'])
confirmationEffect=()=>{deps.alive.current=false};events.length=0;await choose(pdf);assert.deepEqual(events.map(e=>e[0]),['confirm'])
deps.alive.current=true;events.length=0;await remove();assert.deepEqual(events.map(e=>e[0]),['confirm'])
deps.alive.current=true;confirmationEffect=()=>{}
// Exercise the other reachable replacement entry point's actual callback.
const step={id:'s',projectId:'p',desk:{},title:'Piece'}
const musicDeps={...deps,busyRef:{current:false},replaceId:{current:'s'},draft:{steps:[step]},MAX_ROUTINE_STEPS:30,alive:{current:true},setProgress:()=>{},props:{onCreatePracticeItem:deps.onCreatePracticeItem},musicExerciseTitle:()=> 'Music',createStep:x=>x,blankDesk:()=>({}),createMusicExercise:()=>({}),storeLibraryExercise:()=>{},patchStep:()=>events.push(['patch']),setDraft:()=>{},setExpanded:()=>{},setExerciseLibrary:()=>{},loadExerciseLibrary:()=>[],setRevision:()=>{}}
const importFiles=await bind('src/components/MusicRoutineBuilder.tsx','importFiles',musicDeps)
for(const mode of ['cancel','failed','success']){musicDeps.replaceId.current='s';confirmation=mode!=='cancel';saveFails=mode==='failed';events.length=0;await importFiles([pdf]);assert.equal(events.some(e=>e[0]==='clear'),mode==='success');assert.equal(events.some(e=>e[0]==='patch'),mode==='success')}
musicDeps.replaceId.current='s';saveFails=false;confirmation=true;confirmationEffect=()=>{musicDeps.alive.current=false};events.length=0;await importFiles([pdf]);assert.deepEqual(events.map(e=>e[0]),['confirm'])
confirmationEffect=()=>{}
// A migration write failure must retain every valid current-day progress field.
const storage=new Map();let failHistory=true, failDay=false
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if((failHistory&&k.includes('routine-history'))||(failDay&&k==='besttake:practice-routine-day:v1'))throw Error('quota');storage.set(k,v)},removeItem:k=>storage.delete(k)}
const routine=api.createRoutine('Rehearsal',[api.createStep({title:'Warmup'}),api.createStep({title:'Piece'}),api.createStep({title:'Etude'})],'trumpet')
let day=api.freshRoutineDay(routine.id)
day=api.settleRoutineDayStep(day,routine,routine.steps[0].id,'done',1000)
day=api.settleRoutineDayStep(day,routine,routine.steps[1].id,'skipped',1100)
day=api.startRoutineDayStep(day,routine.steps[2].id,'session',1200,{title:'Etude',projectId:'p'})
day=api.pauseRoutineDay(day,1500,api.parseStep(api.createStep({title:'Etude',desk:{...api.blankDesk('audio'),showMusic:true}})).desk)
storage.set('besttake:practice-routine-day:v1',JSON.stringify(day))
const loaded=api.loadRoutineDay(routine)
for(const key of ['doneStepIds','skippedStepIds','pausedStepId','elapsedMsByStep','sessionIdsByStep','itemsByStep','desksByStep'])assert.deepEqual(loaded[key],day[key],key)
failHistory=false;const retried=api.loadRoutineDay(routine);assert.deepEqual(retried.doneStepIds,day.doneStepIds);assert.deepEqual(api.loadRoutineHistory(routine.id)[0].doneStepIds,day.doneStepIds)
storage.delete('besttake:routine-history:v1:'+encodeURIComponent(routine.id)); failDay=true
const dayWriteRejected=api.loadRoutineDay(routine)
for(const key of ['doneStepIds','skippedStepIds','pausedStepId','elapsedMsByStep','sessionIdsByStep','itemsByStep','desksByStep'])assert.deepEqual(dayWriteRejected[key],day[key],key)
assert.deepEqual(api.loadRoutineHistory(routine.id)[0].doneStepIds,day.doneStepIds)
console.log('PASS: actual routine attachment/replacement/removal callbacks validate before creating folders; confirmation/failure preserve marks; success clears marks; migration quota/retry preserves progress')

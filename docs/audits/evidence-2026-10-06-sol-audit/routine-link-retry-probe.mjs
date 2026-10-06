import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require=createRequire('/Users/jameslobb/Documents/BestTake/package.json')
const {build}=require('esbuild')
const state={listeners:[],decodeCalls:0,importCalls:0,storageFail:true,alerts:[]}
globalThis.__linkRetryAudit=state
globalThis.window={setTimeout:()=>0}
const mocks={name:'native-router-boundaries',setup(builder){
 builder.onResolve({filter:/^@capacitor\/(app|core|filesystem)$/},a=>({path:a.path,namespace:'mock'}))
 builder.onResolve({filter:/context\/ActionSheetContext$|storage\/routineFile$|storage\/timelineStorage$|utils\/practiceRoutineShare$|utils\/routineLink$/},a=>({path:a.path,namespace:'mock'}))
 builder.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:
  a.path==='@capacitor/app' ? 'const s=globalThis.__linkRetryAudit;export const App={addListener:async(_e,fn)=>{s.listeners.push(fn)},getLaunchUrl:async()=>null};' :
  a.path==='@capacitor/core' ? 'export const Capacitor={isNativePlatform:()=>true};' :
  a.path==='@capacitor/filesystem' ? 'export const Encoding={UTF8:"utf8"};export const Filesystem={};' :
  a.path.endsWith('ActionSheetContext') ? 'export const canShowAlertOutsideTree=()=>true;export const showAlertOutsideTree=o=>globalThis.__linkRetryAudit.alerts.push(o);' :
  a.path.endsWith('routineFile') ? 'export const isRoutineFileName=()=>false;' :
  a.path.endsWith('timelineStorage') ? 'export const importRoutineFromText=()=>{throw Error("Wrong importer")};' :
  a.path.endsWith('practiceRoutineShare') ? 'export const isPracticePlanFileName=()=>true;export const importPracticePlanFileFromText=async()=>{const s=globalThis.__linkRetryAudit;s.importCalls++;return s.storageFail ? {ok:false,error:"Could not save this routine and its programs. Please check available storage and try again."} : {ok:true,routine:{id:"received",name:"Scales",steps:[]}};};' :
  'export const ROUTINE_APP_LINK_PREFIX="besttake://routine";export const decodeRoutineLink=async()=>{globalThis.__linkRetryAudit.decodeCalls++;return "valid routine JSON";};'
 }))
}}
const bundle=await build({absWorkingDir:'/Users/jameslobb/Documents/BestTake',entryPoints:['src/practiceTimeline/storage/routineFileOpen.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[mocks]})
const router=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
await router.initializeRoutineFileOpen()
assert.equal(state.listeners.length,1)
const flush=()=>new Promise(r=>setImmediate(r))
const url='besttake://routine#v1.same-teacher-link'
state.listeners[0]({url});await flush()
assert.equal(state.importCalls,1)
assert.equal(router.getPendingPracticePlanOpen(),null)
assert.match(state.alerts[0].message,/try again/)
state.storageFail=false
state.listeners[0]({url});await flush()
assert.equal(state.importCalls,1,'Verified defect: exact failed URL remains deduplicated after storage recovers')
assert.equal(router.getPendingPracticePlanOpen(),null)
state.listeners[0]({url:url+'-another-link'});await flush()
assert.equal(state.importCalls,2)
assert.equal(router.getPendingPracticePlanOpen()?.id,'received','Control: recovered importer accepts a different URL')
console.log(JSON.stringify({probe:'Native same shared routine link retry after recoverable import failure',result:'VERIFIED DEFECT',failedURLImporterCalls:1,retryImporterCalls:1,retryProducedRoutine:false,differentURLControl:'PASS',nativeAppUrlDelivery:'MOCKED',payloadImporter:'CONTROLLED BOUNDARY'}))

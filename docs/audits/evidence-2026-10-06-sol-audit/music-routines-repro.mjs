import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import ts from '/Users/jameslobb/Documents/BestTake/node_modules/typescript/lib/typescript.js'
import { build } from '/Users/jameslobb/Documents/BestTake/node_modules/esbuild/lib/main.js'
const root='/Users/jameslobb/Documents/BestTake'
const data=new Map(); let rejectedKey=null
const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(k===rejectedKey)throw new Error('quota');data.set(k,v)},removeItem:k=>data.delete(k)}
globalThis.localStorage=storage
async function bundled(file){const b=await build({entryPoints:[root+'/'+file],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))}
const ink=await bundled('src/components/practiceChart/chartInk.ts')
const points=[];for(let i=0;i<650;i++)points.push(0.1+(i%10)*0.01,0.1+Math.floor(i/10)*0.01)
const simplified=ink.simplifyStroke(points)
assert.ok(simplified.length>800)
assert.equal(ink.saveInkStrokes('part',[{page:0,colour:'black',points:simplified}]),true)
const reread=ink.loadInkStrokes('part')
assert.equal(reread[0].points.length,800)
console.log('REPRO annotation: '+simplified.length/2+' visible points saved successfully; reload keeps only '+reread[0].points.length/2+'; ending gesture lost')
data.clear()
const routines=await bundled('src/utils/practiceRoutines.ts')
const r=routines.createRoutine('Rehearsal',[routines.createStep({title:'Warmup'}),routines.createStep({title:'Piece'})],'trumpet')
let day=routines.freshRoutineDay(r.id);day=routines.settleRoutineDayStep(day,r,r.steps[0].id,'done')
storage.setItem('besttake:practice-routine-day:v1',JSON.stringify(day))
rejectedKey='besttake:routine-history:v1:'+encodeURIComponent(r.id)
const loaded=routines.loadRoutineDay(r)
assert.equal(loaded.doneStepIds.length,0);assert.ok(JSON.parse(storage.getItem('besttake:practice-routine-day:v1')).doneStepIds.includes(r.steps[0].id))
console.log('REPRO routine cold-load migration quota: legacy has done Warmup, returned fresh day loses visible completion')
rejectedKey=null;data.clear()
const raw=await fs.readFile(root+'/src/utils/practiceChartStorage.ts','utf8')
const ast=ts.createSourceFile('chart.ts',raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
const withoutImports=ast.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(ast)).join('\n')
const prelude=`const {localStorage,Capacitor,Filesystem,Directory,CHARTS_DIR,initAppFilesystem,isFilesystemMissingError,requirePlus,window,Share,deleteWebPracticeChart,loadWebPracticeChart,saveWebPracticeChart}=globalThis.__chartDeps;`
const compiled=ts.transpileModule(prelude+withoutImports,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
const disk=new Map()
globalThis.__chartDeps={localStorage:storage,Capacitor:{isNativePlatform:()=>true},Filesystem:{writeFile:async({path,data})=>disk.set(path,data),readFile:async({path})=>({data:disk.get(path)}),deleteFile:async({path})=>disk.delete(path)},Directory:{Data:'DATA'},CHARTS_DIR:'charts',initAppFilesystem:async()=>{},isFilesystemMissingError:()=>false,requirePlus:()=>true,window:{dispatchEvent:()=>{}}}
globalThis.CustomEvent=class{constructor(type,init){this.type=type;this.detail=init.detail}}
const chart=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'))
await chart.savePracticeChart('part',new File(['OLD_SCORE'],'old.pdf',{type:'application/pdf'}))
rejectedKey='besttake:practice-chart:v1:part'
await assert.rejects(chart.savePracticeChart('part',new File(['NEW_SCORE'],'new.pdf',{type:'application/pdf'})),/quota/)
const still=await chart.loadPracticeChart('part')
assert.equal(new TextDecoder().decode(still.bytes),'OLD_SCORE')
assert.equal(atob(disk.get('charts/part.pdf')),'NEW_SCORE')
assert.equal(chart.practiceChartName('part'),'old.pdf')
console.log('REPRO native chart replacement quota: rejected save, memory and name show OLD_SCORE/old.pdf; persisted file is NEW_SCORE')
rejectedKey=null;data.clear();disk.clear()
const setupRaw=await fs.readFile(root+'/src/components/RoutineMusicSetup.tsx','utf8')
const setupAst=ts.createSourceFile('setup.tsx',setupRaw,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let chooseNode
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(setupAst)==='choose')chooseNode=n.initializer;ts.forEachChild(n,visit)}visit(setupAst)
assert.ok(chooseNode)
const chooseCode=ts.transpileModule(`export function bind(d){const {requirePlus,setBusy,setError,step,onCreatePracticeItem,savePracticeChart,onChange,desk,setRevision}=d;return ${chooseNode.getText(setupAst)}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
const chooseModule=await import('data:text/javascript;base64,'+Buffer.from(chooseCode).toString('base64'))
let created=0,changed=0,visibleError=''
const choose=chooseModule.bind({requirePlus:()=>true,setBusy:()=>{},setError:v=>visibleError=v,step:{projectId:null,title:'Piece'},onCreatePracticeItem:async()=>{created++;return 'created'},savePracticeChart:chart.savePracticeChart,onChange:()=>changed++,desk:{},setRevision:()=>{}})
await choose(new File(['%PDF-1.7'],'score.pdf',{type:''}))
assert.equal(created,1);assert.equal(changed,0);assert.match(visibleError,/Choose a PDF/)
console.log('REPRO custom routine attach: Files PDF with empty MIME creates orphan item then rejects as unsupported')
// Save follows the routine replacement path and never changes the annotation storage.
const persistedStroke={page:0,colour:'red',points:[0.1,0.1,0.5,0.5]}
ink.saveInkStrokes('part',[persistedStroke])
await chart.savePracticeChart('part',new File(['SCORE_A'],'A.pdf',{type:'application/pdf'}))
await chart.savePracticeChart('part',new File(['SCORE_B'],'B.pdf',{type:'application/pdf'}))
assert.equal(ink.loadInkStrokes('part').length,1)
console.log('REPRO routine replacement primitive: B.pdf retains annotation authored on A.pdf; routine caller contains no clearInkStrokes')

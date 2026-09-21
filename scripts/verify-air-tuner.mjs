import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
const result=await build({entryPoints:['src/utils/reactiveSilkTuner.ts'],bundle:true,write:false,format:'esm',platform:'node'})
const {drawSilkTuner,silkFlowColor}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
const points=Array.from({length:110},(_,i)=>({x:i*3,y:150+Math.sin(i)*10,cents:i%30-15}))
function render(air,dark,active=true){const calls={radial:0,linear:0,fill:0,save:0,restore:0};const ctx=new Proxy({createLinearGradient(){calls.linear++;return {addColorStop(){}}},createRadialGradient(){calls.radial++;return {addColorStop(){}}},fill(){calls.fill++},save(){calls.save++},restore(){calls.restore++}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});return {color:drawSilkTuner(ctx,390,600,points,active,dark,air),calls}}
for(const dark of [false,true]){
 const original=render(false,dark),air=render(true,dark)
 assert.equal(air.color,silkFlowColor(points.at(-1).cents,dark))
 assert.equal(air.calls.radial,0,'No endpoint glow gradient')
 assert.ok(air.calls.linear<original.calls.linear,'Fewer gradient allocations than original')
 assert.ok(air.calls.fill<original.calls.fill,'Fewer fill operations than original')
 assert.equal(air.calls.save,air.calls.restore,'Canvas clipping must not leak between frames')
 assert.equal(render(true,dark,false).color,'transparent')
}
const css=await readFile('src/styles/reactive-silk-tuner.css','utf8')
assert.match(css,/@property --silk-wash\s*\{[^}]*inherits:\s*false/,'Preserve WebKit memory fix')
console.log('PASS: Silk uses its approved palette and preserves idle behavior, reduces drawing, balances canvas state and retains non-inheriting wash')

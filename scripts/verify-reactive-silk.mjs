import {build} from 'esbuild'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const dir=await mkdtemp(join(tmpdir(),'silk-test-'))
try {
 await build({entryPoints:['src/utils/reactiveSilkTuner.ts'],bundle:true,format:'esm',platform:'node',outfile:join(dir,'test.mjs')})
 const {silkPitchColor,silkTunerGeometry,drawSilkTuner}=await import(pathToFileURL(join(dir,'test.mjs')))
 for(const [c,color] of [[5,'#20ed78'],[-5,'#20ed78'],[5.1,'#f4c52b'],[-15,'#f4c52b'],[15.1,'#f54c62']])assert.equal(silkPitchColor(c),color)
 for(const h of [240,400,640,844]){const g=silkTunerGeometry(390,h);assert.equal(g.headroom,40);assert.ok(Math.abs(g.targetY-g.bandBottom-18)<.001);assert.ok(Math.abs(g.flatY-g.targetY-34)<.001);assert.ok(g.flatY<h-30)}
 const ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}})}, {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)})
 assert.equal(drawSilkTuner(ctx,390,600,[{x:346,y:300,cents:14}],true,false),'#f4c52b');assert.equal(drawSilkTuner(ctx,390,600,[{x:346,y:300,cents:14}],false,false),'transparent')
 console.log('PASS: pitch boundaries, endpoint clearance, target/Flat spacing, active color and idle reset')
} finally {await rm(dir,{recursive:true,force:true})}

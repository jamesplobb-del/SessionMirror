import {build} from 'esbuild'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const dir=await mkdtemp(join(tmpdir(),'tuner-history-'))
try {
 await build({entryPoints:['src/utils/tunerHistory.ts'],bundle:true,format:'esm',platform:'node',outfile:join(dir,'history.mjs')})
 const {appendTunerHistory,nearestTunerSample}=await import(pathToFileURL(join(dir,'history.mjs')))
 const samples=[], pitch={noteName:'A4',midi:69,frequencyHz:440,cents:0}
 appendTunerHistory(samples,0,pitch);pitch.cents=12
 assert.equal(samples[0].pitch.cents,0,'history must retain original note measurement')
 appendTunerHistory(samples,10,pitch);assert.equal(samples.length,1)
 appendTunerHistory(samples,20,null);assert.equal(samples.length,2,'silence boundary must survive throttling')
 assert.equal(nearestTunerSample(samples,19).pitch,null)
 for(let t=100;t<200000;t+=50)appendTunerHistory(samples,t,pitch)
 // Pruning is intentionally batched once per second to avoid shifting the array on every pitch frame.
 assert.ok(samples.length<=2600);assert.ok(samples[0].time>=samples.at(-1).time-121000)
 const snapshot=samples.slice();appendTunerHistory(samples,300000,pitch);assert.notEqual(snapshot.at(-1).time,samples.at(-1).time,'browsing snapshot remains anchored while listening')
 console.log('PASS: note preservation, silence, sample rate, bounded retention and anchored history')
}finally{await rm(dir,{recursive:true,force:true})}

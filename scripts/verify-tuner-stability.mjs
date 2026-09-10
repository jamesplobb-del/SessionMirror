import {build} from 'esbuild'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const dir=await mkdtemp(join(tmpdir(),'tuner-soak-'))
try {
 await build({stdin:{contents:`export * from './src/utils/stableNoteTracker'; export * from './src/utils/tunerHistory';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'test.mjs')})
 const {StableNoteTracker,STABLE_NOTE_THRESHOLDS,appendTunerHistory}=await import(pathToFileURL(join(dir,'test.mjs')))
 const history=[];let observations=0,maxSamples=0
 const tracker=new StableNoteTracker(()=>observations++)
 const context={tunerInstrument:'voice',transpositionId:'concert'}
 const measurements=[]
 for(let frame=0;frame<8*3600*120;frame++) {
   const timestamp=frame*1000/120
   tracker.ingest({midiNote:69,noteName:'A4',centsOffset:Math.sin(frame/50)*2,frequencyHz:440,confidence:.99,timestamp},context)
   appendTunerHistory(history,timestamp,{midi:69,noteName:'A4',cents:0,frequencyHz:440})
   maxSamples=Math.max(maxSamples,tracker.candidate?.samples.length??0)
   if(frame % (3600*120)===0){global.gc?.();measurements.push({hour:frame/(3600*120),heapMiB:Math.round(process.memoryUsage().heapUsed/1048576*100)/100})}
 }
 assert.ok(maxSamples<=STABLE_NOTE_THRESHOLDS.maximumCandidateSamples)
 assert.ok(history.length<=2600)
 tracker.finish();assert.equal(observations,1,'long held note still produces a valid observation')
 if(global.gc)assert.ok(measurements.at(-1).heapMiB-measurements[1].heapMiB<4,'retained heap should plateau')
 console.log(JSON.stringify({simulatedHours:8,inputFps:120,maxCandidateSamples:maxSamples,historySamples:history.length,measurements,observations},null,2))
 console.log('PASS: 8-hour accelerated tuner buffer soak')
}finally{await rm(dir,{recursive:true,force:true})}

import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const dir = await mkdtemp(join(tmpdir(), 'trim-metadata-'))
try {
 await build({entryPoints:['src/utils/trimTakeMetadata.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'test.mjs')})
 const {trimmedTakeMetadata:trim}=await import(pathToFileURL(join(dir,'test.mjs')))
 const original={duration:12,mediaType:'video',thumbnailUrl:'old',timelineOffsetMs:4000,performanceStartSeconds:4,pitchSeries:[{time:1,frequencyHz:440},{time:3,frequencyHz:441},{time:5,frequencyHz:442},{time:10,frequencyHz:443}]}
 const updated=trim(original,3,4)
 assert.equal(updated.duration,4);assert.equal(updated.timelineOffsetMs,1000);assert.equal(updated.performanceStartSeconds,1);assert.equal(updated.thumbnailUrl,'')
 assert.deepEqual(updated.pitchSeries,[{time:0,frequencyHz:441},{time:2,frequencyHz:442}]);assert.equal(original.pitchSeries.length,4)
 assert.equal(trim(original,5,1).timelineOffsetMs,0)
 assert.equal(trim({...original,mediaType:'audio'},0,12).thumbnailUrl,undefined)
 assert.deepEqual(trim({},0,1).pitchSeries,[])
 console.log('PASS: trim duration, pitch cropping, time origin, alignment, thumbnail reset, and source immutability')
} finally {await rm(dir,{recursive:true,force:true})}

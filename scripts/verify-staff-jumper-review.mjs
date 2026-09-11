import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const dir = await mkdtemp(join(tmpdir(), 'staff-review-'))
try {
 await build({stdin:{contents:`export * from './src/labs/staffJumper/staffJumperRhythm'; export * from './src/labs/staffJumper/staffJumperMusicLogic'; export * from './src/labs/staffJumper/staffJumperNotationLayout';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'test.mjs'),loader:{'.png':'dataurl','.jpg':'dataurl','.webp':'dataurl','.svg':'dataurl'}})
 const m = await import(pathToFileURL(join(dir,'test.mjs')))
 let checked=0
 for (const meter of ['simple','compound']) for (const difficulty of ['easy','medium','hard']) for(let seed=1;seed<=30;seed++) {
  const key={};const spec=m.METERS[meter]; let prior=null
  for(let i=0;i<300;i++) {
   const slot=m.getRhythmSlot(key,meter,difficulty,seed,i)
   assert.ok(slot.unitsIntoMeasure+slot.durationUnits<=spec.capacityUnits)
   if(prior) {assert.equal(slot.unitPosition,prior.unitPosition+prior.durationUnits);assert.ok(slot.spacingPosition-prior.spacingPosition>=.75-1e-7)}
   if(meter==='compound' && slot.durationUnits<12) assert.equal(Math.floor(slot.unitsIntoMeasure/6),Math.floor((slot.unitsIntoMeasure+slot.durationUnits-1)/6),'6/8 event must expose pulse boundary')
   if(slot.isRest) assert.equal(slot.beamGroupId,null)
   if(prior && (slot.isRest || prior.isRest) && slot.measureIndex===prior.measureIndex) {
    assert.ok(slot.spacingPosition-prior.spacingPosition>=1.05-1e-7,'rest must clear the neighbouring note')
   }
   if(prior && slot.beamGroupId!==null && prior.beamGroupId===slot.beamGroupId) assert.equal(Math.floor(slot.unitPosition/spec.pulseUnits),Math.floor(prior.unitPosition/spec.pulseUnits))
   prior=slot;checked++
  }
 }
 const config={key:'C',scaleMode:'major',range:'1-octave',difficulty:'medium',clef:'treble',tunerInstrument:'winds',transposition:'concert',instrumentId:null,playerModel:'frog',meter:'compound',tempoBpm:80,metronome:true,drone:false,lives:false,sessionSeed:12,customPitchClasses:[0,3,6,9]}
 const pool=m.customNotePool(config);assert.ok(pool.length>=2)
 for(let i=0;i<400;i++){const note=m.getTargetNoteAtStep(config,i);if(!note.isRest){assert.ok(config.customPitchClasses.includes(note.pitchClass));assert.ok(pool.includes(note.midi));assert.ok(note.customAccidental)}}
 const slots=[0,1].map((i)=>({step:i,xPx:100+i*100,opacity:1,note:{yPx:100,xPx:100+i*100,rhythm:{value:i?'sixteenth':'eighth',isRest:false,beamGroupId:1,barlineBeforeSpacingPosition:null}}}))
 const layout=m.layoutRhythm(slots)
 assert.equal(layout.beams.length,2)
 assert.ok(Math.abs(layout.beams[1].x2-layout.beams[1].x1)<=14,'Isolated sixteenth must have a hook, not a second full beam')
 assert.ok(Math.abs(layout.beams[0].x2-layout.beams[0].x1)===100)

 let scaleOpens=0
 let barOneEqualsBarThree=0
 let phraseCount=0
 for(let seed=1;seed<=40;seed++) {
  const run={key:'C',scaleMode:'major',range:'1-octave',difficulty:'hard',clef:'treble',tunerInstrument:'winds',transposition:'concert',instrumentId:null,playerModel:'frog',meter:'simple',tempoBpm:96,metronome:true,drone:false,lives:false,sessionSeed:seed}
  const sounded=[]
  const fingerprints=[]
  let lastMeasure=-1
  let cell=[]
  for(let i=0;i<80;i++) {
   const note=m.getTargetNoteAtStep(run,i)
   if(!note.isRest && sounded.length<8) sounded.push(note.midi)
   if(note.rhythm.measureIndex!==lastMeasure) {
    if(cell.length) fingerprints.push(cell.join('|'))
    cell=[`${note.isRest?'r':''}${note.rhythm.value}`]
    lastMeasure=note.rhythm.measureIndex
   } else {
    cell.push(`${note.isRest?'r':''}${note.rhythm.value}`)
   }
  }
  if(cell.length) fingerprints.push(cell.join('|'))
  const stepwiseUp=sounded.every((midi,index,arr)=>index===0||midi>arr[index-1])
  const span=sounded.at(-1)-sounded[0]
  if(stepwiseUp && span>=11) scaleOpens+=1
  for(let phrase=0;phrase+3<fingerprints.length;phrase+=4) {
   phraseCount+=1
   if(fingerprints[phrase]===fingerprints[phrase+2]) barOneEqualsBarThree+=1
  }
 }
 assert.ok(scaleOpens<=4,'hard runs must not routinely open with a scale')
 assert.ok(barOneEqualsBarThree/phraseCount<0.35,'bar three must not photocopy bar one')
 console.log(`PASS: ${checked} rhythm slots across meters/levels/seeds, pulse grouping, rest exclusions, spacing, mixed-beam hooks, 400 custom-note slots, phrase variety (${barOneEqualsBarThree}/${phraseCount} bar-1 reprints), and non-scale openings (${scaleOpens}/40).`)
} finally {await rm(dir,{recursive:true,force:true})}

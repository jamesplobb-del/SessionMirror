import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
const r=await build({stdin:{contents:`export * from './src/utils/instrumentProfiles';export * from './src/utils/tunerTransposition';export * from './src/utils/pitchConfig';export {INSTRUMENTS as LESSONS} from './src/labs/learnInstrument/instrumentData';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const m=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
const profiles=m.INSTRUMENT_PROFILES.map(p=>({...p,detectorMinHz:m.getTunerProfile(p.tunerInstrument).minHz,detectorMaxHz:m.getTunerProfile(p.tunerInstrument).maxHz}));
const trumpet=m.LESSONS.find(i=>i.id==='bb-trumpet').courses.chromatic.notes.filter(n=>[80,81,82].includes(n.writtenMidi));
const lessons=m.LESSONS.map(i=>({id:i.id,clef:i.clef,transposition:i.transpositionSemitones,beginnerNotes:i.courses.beginner.notes.map(n=>n.writtenLabel),chromaticNotes:i.courses.chromatic.notes.length}));
const output={profiles,lessons,trumpetUpperRegister:trumpet,excludedTunerExamples:[['bass-guitar',23],['piano',21],['piano',108],['piccolo',108]].map(([id,concertMidi])=>{const p=profiles.find(p=>p.id===id),hz=440*2**((concertMidi-69)/12);return{id,concertMidi,hz,inBounds:hz>=p.detectorMinHz&&hz<=p.detectorMaxHz}})};
await writeFile('release-review/2026-09-13/full-audit/instrument-probes.json',JSON.stringify(output,null,2));console.log(JSON.stringify({profileCount:profiles.length,lessonCount:lessons.length,trumpetUpperRegister:trumpet,excludedTunerExamples:output.excludedTunerExamples},null,2));

import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PitchDetector } from 'pitchy'

const dir = await mkdtemp(join(tmpdir(), 'instrument-review-'))
try {
  await build({ stdin: { contents: `
    export * from './src/labs/balance/balanceMusic';
    export * from './src/labs/balance/balanceStorage';
    export * from './src/labs/balance/balanceScoring';
    export * from './src/labs/staffJumper/staffJumperInstruments';
    export * from './src/labs/staffJumper/staffJumperMusicLogic';
    export * from './src/labs/staffJumper/staffNotationMap';
    export * from './src/utils/pitchConfig';
    export * from './src/utils/routinePresets';
  `, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'test.mjs'), loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl', '.svg': 'dataurl' } })
  const m = await import(pathToFileURL(join(dir, 'test.mjs')))
  for (const [id, written, sounding] of [
    ['piccolo',70,82], ['recorder',60,72], ['guitar',52,40],
    ['bass-guitar',40,28], ['double-bass',50,38], ['tenor-sax',60,46],
    ['bari-sax',67,46], ['bass-clarinet',60,46], ['euphonium-treble',60,46],
  ]) assert.equal(m.buildBalanceTargetsFromWritten([written],m.getBalanceInstrument(id))[0].concertMidi,sounding,id)
  assert.equal(new Set(m.BALANCE_INSTRUMENTS.map(i=>i.id)).size,m.BALANCE_INSTRUMENTS.length)
  assert.equal(m.getStaffJumperInstrument('viola').clef,'alto')
  assert.equal(m.getStaffPositionForNote('C',4,'alto').yPx,m.STAFF_LINE_Y_LIST[2])
  assert.equal(m.getKeySignatureMarkers('D','major','alto').length,2)
  assert.ok(m.STAFF_JUMPER_READING_CLEFS.includes('alto'))
  assert.equal(m.getBalanceInstrument('bass-clarinet').minWrittenMidi,51)
  assert.equal(m.getBalanceInstrument('ukulele').maxWrittenMidi,81)
  for(const id of ['piano-treble','piano-bass']) assert.equal(m.getBalanceInstrument(id).tunerInstrument,'strings')
  assert.equal(m.presetFamilyFor('recorder'),'woodwind')
  for(const [id,pc,octave] of [['violin',9,4],['flute',10,4],['alto-sax',10,3],['soprano-sax',10,3],['french-horn',5,4],['recorder',0,5]]) {
    assert.deepEqual(m.deskFor(id,{drone:true}).drone,{pitchClass:pc,octave},id)
  }
  let scaleCases=0
  for(const instrument of m.BALANCE_INSTRUMENTS) {
    const profile=m.getTunerProfile(instrument.tunerInstrument)
    for(const midi of [instrument.minWrittenMidi,instrument.maxWrittenMidi]) {
      const target=m.buildBalanceTargetsFromWritten([midi],instrument)[0]
      const hz=440*2**((target.concertMidi-69)/12)
      assert.ok(hz>=profile.minHz && hz<=profile.maxHz,`${instrument.id}: ${hz} outside detector`)
      assert.notEqual(m.readoutToConcertPitchClass({frequencyHz:hz,midi:target.concertMidi,noteName:'test'}),null)
    }
    for(const octaveRange of [1,2]) for(const direction of ['ascending','descending','upDown']) for(const scaleType of ['major','naturalMinor','harmonicMinor','melodicMinor','chromatic']) {
      const settings=m.createDefaultBalanceSettings(instrument.id)
      settings.routineType='scale'
      Object.assign(settings.scale,{octaveRange,direction,scaleType})
      const targets=m.buildBalanceTargets(settings,[])
      assert.ok(targets.length)
      for(const target of targets) assert.ok(target.writtenMidi>=instrument.minWrittenMidi && target.writtenMidi<=instrument.maxWrittenMidi)
      assert.equal(settings.scale.rootWrittenMidi,instrument.homeWrittenMidi)
      scaleCases++
    }
  }
  const alto=m.createDefaultBalanceSettings('alto-sax')
  alto.routineType='scale';alto.scale.octaveRange=2
  const notes=m.buildBalanceTargets(alto,[]).map(t=>t.writtenMidi)
  assert.equal(notes[0],67);assert.equal(notes.at(-1),90)
  assert.ok(notes.every(n=>[7,9,11,0,2,4,6].includes(n%12)),'G major must stay G major')
  assert.match(m.routineSummary(alto,[]),/range limited/)
  alto.scale.octaveRange=1
  assert.doesNotMatch(m.routineSummary(alto,[]),/range limited/)
  const custom=m.createDefaultBalanceSettings('ukulele')
  custom.routineType='custom';custom.selectedCustomRoutineId='saved'
  const routines=[{id:'saved',name:'Saved high notes',notes:[{id:'n1',writtenMidi:84}]}]
  assert.match(m.balanceCustomRoutineIssue(custom,routines),/outside.*range/)
  assert.deepEqual(m.buildBalanceTargets(custom,routines),[],'Do not launch unplayable saved notes')
  assert.equal(routines[0].notes[0].writtenMidi,84,'Validation must preserve the saved routine')
  custom.instrumentId='piano-treble'
  assert.equal(m.balanceCustomRoutineIssue(custom,routines),null)
  assert.equal(m.buildBalanceTargets(custom,routines)[0].writtenMidi,84)
  custom.instrumentId='ukulele';routines[0].notes[0].writtenMidi=72
  assert.equal(m.balanceCustomRoutineIssue(custom,routines),null,'Editing into range restores play')
  assert.equal(m.buildBalanceTargets(custom,routines)[0].writtenMidi,72)
  const saved={version:3,settings:{...alto,scale:{...alto.scale,octaveRange:2}},customRoutines:routines}
  globalThis.localStorage={getItem:()=>JSON.stringify(saved)}
  assert.equal(m.loadBalanceData('alto-sax').settings.scale.rootWrittenMidi,67,'Reload must preserve G major')
  delete globalThis.localStorage
  const target=m.buildBalanceTargetsFromWritten([60],m.getBalanceInstrument('piano-treble'))[0]
  const acc=m.createBalanceScoreAccumulator(target,10)
  m.addBalancePitchSample(acc,{timestamp:0,centsFromTarget:0})
  m.addBalancePitchSample(acc,{timestamp:1500,centsFromTarget:0})
  assert.equal(acc.balancedMs,0,'Re-strike silence must not score')
  let audioCases=0
  for(const id of ['strings','winds']) for(const rate of [44100,48000]) {
    const profile=m.getTunerProfile(id)
    const detector=PitchDetector.forFloat32Array(profile.frameSizeMic)
    for(const hz of [41.2034,65.4064,82.4069,440,1567.9817,...(id==='winds'?[3135.9635]:[])]) for(const harmonic of [false,true]) {
      const samples=Float32Array.from({length:profile.frameSizeMic},(_,i)=>{
        const phase=2*Math.PI*hz*i/rate
        return .3*Math.sin(phase)+(harmonic?.2*Math.sin(2*phase)+.1*Math.sin(3*phase):0)
      })
      const [actual,clarity]=detector.findPitch(samples,rate)
      assert.ok(Math.abs(1200*Math.log2(actual/hz))<3,`${id}: ${hz} tracked as ${actual}`)
      assert.ok(clarity>=profile.clarityMinMic)
      audioCases++
    }
  }
  console.log(`PASS: instrument transpositions, all detector range endpoints, ${scaleCases} scale cases, viola notation, routine defaults, saved-routine validation, range labels, decay scoring, and ${audioCases} synthetic audio cases.`)
} finally { await rm(dir,{recursive:true,force:true}) }

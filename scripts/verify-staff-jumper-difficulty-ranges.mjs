// Each Staff Jumper level starts on a graded range for the instrument, and
// the game actually stays inside it. Run: node scripts/verify-staff-jumper-difficulty-ranges.mjs
import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = await mkdtemp(join(tmpdir(), 'staff-tiers-'))
try {
  await build({
    stdin: {
      contents: `export * from './src/labs/staffJumper/staffJumperMusicLogic'; export * from './src/labs/staffJumper/staffJumperDifficultyRanges'; export * from './src/labs/staffJumper/staffJumperInstruments';`,
      resolveDir: process.cwd(),
    },
    bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'test.mjs'),
    loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl', '.svg': 'dataurl' },
  })
  const m = await import(pathToFileURL(join(dir, 'test.mjs')))
  const levels = ['easy', 'medium', 'hard']
  const B_FLAT_4 = 70

  let instruments = 0
  for (const instrument of m.STAFF_JUMPER_INSTRUMENTS) {
    const tiers = levels.map((level) => m.difficultyRangeFor(instrument.id, level))
    if (!tiers[0]) continue
    instruments++
    const compass = instrument.fullRange ?? instrument.range
    let prior = null
    for (const [index, tier] of tiers.entries()) {
      if (!tier) continue
      assert.ok(tier.lowMidi < tier.highMidi, `${instrument.id} ${levels[index]} is empty`)
      assert.ok(tier.lowMidi >= compass.minMidi && tier.highMidi <= compass.maxMidi,
        `${instrument.id} ${levels[index]} leaves the instrument's compass`)
      if (prior) {
        assert.ok(tier.lowMidi <= prior.lowMidi && tier.highMidi >= prior.highMidi,
          `${instrument.id} ${levels[index]} drops notes from the level below`)
      }
      prior = tier
    }
  }
  assert.ok(instruments >= 20, `expected graded ranges for the band and string instruments, got ${instruments}`)

  for (const [instrumentId, transposition] of [
    ['bass-clarinet', 'bb_octave'], ['tenor-sax', 'bb_octave'], ['bari-sax', 'eb_octave'],
  ]) {
    assert.equal(m.getStaffJumperInstrument(instrumentId).transposition, transposition,
      `${instrumentId} must sound an octave below its written pitch`)
  }

  for (const [id, highestWrittenMidi] of [
    ['french-horn', 84], ['recorder', 84], ['piccolo', 96], ['bassoon', 77],
  ]) {
    assert.equal(m.resolveFullWrittenRange(id, 'concert', 'treble', 'winds').maxMidi,
      highestWrittenMidi, `${id} range picker must stop at its published top`)
  }

  // The bug that started this: Easy on clarinet crossing the break.
  for (const id of ['clarinet', 'bass-clarinet']) {
    assert.ok(m.difficultyRangeFor(id, 'easy').highMidi <= B_FLAT_4, `${id} Easy must stay at or below throat B♭`)
  }
  assert.ok(m.difficultyRangeFor('clarinet', 'medium').highMidi > B_FLAT_4, 'clarinet Medium is where the break arrives')

  // And the game itself never writes a note outside the level's range.
  let notes = 0
  const clarinet = m.getStaffJumperInstrument('clarinet')
  for (const key of ['C', 'F', 'G', 'D', 'Bb', 'Eb']) {
    for (const difficulty of levels) {
      const range = m.difficultyRangeFor('clarinet', difficulty)
      for (let seed = 1; seed <= 8; seed++) {
        const config = {
          key, scaleMode: 'major', range: '1-octave', difficulty,
          clef: clarinet.clef, tunerInstrument: 'winds', transposition: clarinet.transposition,
          rangeLowMidi: range.lowMidi, rangeHighMidi: range.highMidi,
          instrumentId: 'clarinet', playerModel: 'trumpeter', meter: 'simple', tempoBpm: 80,
          metronome: false, drone: false, lives: false, sessionSeed: seed,
        }
        for (let step = 0; step < 160; step++) {
          const note = m.getTargetNoteAtStep(config, step)
          if (note.isRest) continue
          assert.ok(note.midi >= range.lowMidi && note.midi <= range.highMidi,
            `clarinet ${difficulty} in ${key} wrote MIDI ${note.midi}, outside ${range.lowMidi}–${range.highMidi}`)
          if (difficulty === 'easy') assert.ok(note.midi <= B_FLAT_4, `clarinet Easy in ${key} crossed the break`)
          notes++
        }
      }
    }
  }

  // Instruments with no graded source keep the old key-and-octave behaviour.
  for (const id of ['recorder', 'guitar', 'bass-guitar', 'ukulele']) {
    for (const level of levels) assert.equal(m.difficultyRangeFor(id, level), null, `${id} has no graded source`)
  }
  assert.equal(m.difficultyRangeFor(null, 'easy'), null)

  console.log(`ok — ${instruments} instruments graded, ${notes} clarinet notes checked`)
} finally {
  await rm(dir, { recursive: true, force: true })
}

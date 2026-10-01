import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({ entryPoints: ['src/utils/tunerTransposition.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const keys = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
assert.equal(new Set(keys.TUNER_KEY_OPTIONS.map(option => option.keyLabel)).size, keys.TUNER_KEY_OPTIONS.length)
assert.deepEqual(keys.TUNER_KEY_OPTIONS.map(option => option.keyLabel), ['C', 'D', 'E♭', 'F', 'G', 'A', 'B♭'])
for (const saved of keys.TUNER_TRANSPOSITION_OPTIONS) {
  assert.ok(keys.isTunerTranspositionId(saved.id), 'Every historical setting remains valid')
  const key = keys.getTunerKeyOption(saved.id)
  assert.equal(key.keyLabel, saved.keyLabel)
  const variants = keys.getTunerOctaveOptions(key.id)
  assert.ok(variants.some(option => option.id === saved.id), 'The octave control can restore every historical preset')
  const octaveDifference = (saved.writtenOffsetSemitones - key.writtenOffsetSemitones) / 12
  assert.equal(Number.isInteger(octaveDifference), true)
  for (const concertMidi of [24, 60, 72, 96]) {
    const written = keys.concertMidiToWrittenMidi(concertMidi, saved.id)
    assert.equal(written, concertMidi + saved.writtenOffsetSemitones)
    assert.equal(keys.writtenMidiToConcertMidi(written, saved.id), concertMidi, 'Key/octave changes preserve sounding pitch')
  }
}
assert.equal(keys.tunerOctaveLabel('concert'), 'Standard for this key')
assert.equal(keys.tunerOctaveLabel('c_octave_up'), 'Written one octave lower')
assert.equal(keys.tunerOctaveLabel('bb_octave'), 'Written one octave higher')
console.log('PASS: unique key choices preserve all historical octave IDs and concert/written pitch round trips')

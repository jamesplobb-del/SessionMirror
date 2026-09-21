import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({
  stdin: { contents: `
    export * from './src/metronome/pulseModes'
    export * from './src/metronome/pulseResolution'
    export * from './src/metronome/metronomeTiming'
    export * from './src/metronome/metronomeNotation'
    export * from './src/utils/deskMetronome'
  `, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
})
const m = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const units = { half: 8, 'dotted-half': 12, quarter: 4, 'dotted-quarter': 6, eighth: 2, sixteenth: 1 }
let cases = 0
for (const [meter, modes] of Object.entries(m.METER_PULSE_MODES)) {
  const [numerator, denominator] = meter.split('/').map(Number)
  for (const mode of modes) {
    for (const feelId of mode.feelOptions?.map(feel => feel.id) ?? [undefined]) {
      const timing = m.resolvePulseTiming({ meter, pulseModeId: mode.id, feelId })
      assert.equal(timing.pulseCount * units[timing.pulseUnit], numerator * 16 / denominator, `${meter}/${mode.id}: pulses fill the written bar`)
      assert.equal(timing.accentLevels.length, timing.pulseCount)
      assert.equal(timing.accentLevels[0], 'strong')
      const grouping = mode.feelOptions?.find(feel => feel.id === feelId)?.grouping
      if (grouping) {
        assert.equal(grouping.reduce((a, b) => a + b, 0), timing.pulseCount)
        let start = 0
        grouping.forEach((length, i) => {
          assert.equal(timing.accentLevels[start], i === 0 ? 'strong' : 'medium', `${meter}: group head accent`)
          for (let j = 1; j < length; j++) assert.equal(timing.accentLevels[start + j], 'weak')
          start += length
        })
      }
      for (const subdivision of mode.availableSubdivisions) {
        const pulseTicks = m.ticksPerPulse(meter, subdivision, timing.pulseCount)
        const barTicks = m.ticksPerBar(meter, subdivision, timing.pulseCount)
        assert.equal(barTicks, timing.pulseCount * pulseTicks)
        const notation = m.getRhythmCellNotation(meter, subdivision, timing.pulseCount)
        assert.equal(notation.count, pulseTicks, `${meter}: drawn notes match audible ticks`)
        for (const bpm of [30, 60, 120, 240]) {
          const interval = m.secondsPerSchedulerTick(meter, bpm, subdivision, timing.pulseCount)
          assert.ok(Math.abs(interval * barTicks - timing.pulseCount * 60 / bpm) < 1e-9, `${meter}: correct bar duration`)
          // iOS converts the same interval to sample frames; allow rounding of
          // at most half a frame per tick for either hardware sample rate.
          for (const rate of [44100, 48000]) {
            const nativeDuration = Math.round(interval * rate) * barTicks / rate
            assert.ok(Math.abs(nativeDuration - interval * barTicks) <= barTicks / (2 * rate) + 1e-9)
          }
          cases++
        }
        for (let tick = 0; tick < barTicks; tick++) {
          const tier = m.resolveClickTier({ meter, subdivision, pulseCount: timing.pulseCount, accentLevels: timing.accentLevels }, tick)
          if (tick % pulseTicks) assert.equal(tier, 'subdivision')
          else assert.equal(tier, m.accentLevelToClickTier(tick / pulseTicks, timing.accentLevels[tick / pulseTicks]))
        }
        const restored = m.normalizeDeskMetronome({ bpm: 120, meter, pulseModeId: mode.id, feelId, subdivision, accentLevels: timing.accentLevels, soundId: 'classic' })
        assert.equal(restored.pulseModeId, mode.id)
        assert.equal(restored.subdivision, subdivision)
        assert.deepEqual(restored.accentLevels, timing.accentLevels)
      }
    }
  }
}
const threeQuarter = m.resolvePulseTiming({ meter: '3/4' })
const threeEighth = m.resolvePulseTiming({ meter: '3/8', pulseModeId: 'default' })
assert.equal(threeQuarter.pulseUnit, 'quarter')
assert.equal(threeEighth.pulseUnit, 'eighth')
assert.equal(m.secondsPerSchedulerTick('3/4', 120, 'off', 3), 0.5)
assert.equal(m.secondsPerSchedulerTick('3/8', 120, 'off', 3), 0.5, 'Eighth=120 and quarter=120 have the same click interval')
assert.equal(m.secondsPerSchedulerTick('3/8', 240, 'off', 3), 0.25, 'At a constant quarter=120, eighths sound twice as fast')
const inOne = m.resolvePulseTiming({ meter: '3/8' })
assert.equal(inOne.pulseModeId, 'compound', 'Selecting 3/8 defaults to counting in one')
assert.equal(inOne.pulseUnit, 'dotted-quarter')
assert.equal(inOne.defaultSubdivision, '8ths')
assert.equal(m.getPulseNotation('3/8').dotted, true, 'Tempo displays a dotted quarter')
assert.equal(m.getRhythmCellNotation('3/8', inOne.defaultSubdivision).beams, 1, 'Subdivision displays eighth notes')
assert.equal(inOne.pulseCount, 1)
assert.equal(m.ticksPerBar('3/8', '8ths', inOne.pulseCount), 3)
assert.equal(m.secondsPerSchedulerTick('3/8', 120, '8ths', inOne.pulseCount), 1 / 6)
for (const [meter, pulses, accents] of [
  ['6/8', 2, ['strong', 'weak']],
  ['9/8', 3, ['strong', 'weak', 'weak']],
  ['12/8', 4, ['strong', 'weak', 'medium', 'weak']],
]) {
  const t = m.resolvePulseTiming({ meter })
  assert.equal(t.pulseCount, pulses)
  assert.deepEqual(t.accentLevels, accents)
  assert.equal(m.ticksPerPulse(meter, '8ths', pulses), 3)
}
console.log(`PASS: ${Object.keys(m.METER_PULSE_MODES).length} meters, ${cases} tempo/rhythm/grouping cases; notation, accents, bar duration, native sample rounding and routine restoration.`)

const default38 = m.normalizeDeskMetronome({ meter: '3/8', bpm: 120 })
assert.equal(default38.pulseModeId, 'compound')
assert.equal(default38.subdivision, '8ths')
assert.deepEqual(default38.accentLevels, ['strong'])
assert.equal(m.ticksPerBar('3/8', default38.subdivision) * m.secondsPerSchedulerTick('3/8', 120, default38.subdivision), 0.5, 'At dotted-quarter=120 each 3/8 bar lasts half a second')
console.log('PASS: 3/8 defaults to dotted-quarter=120 with three eighth-note subdivisions per bar.')

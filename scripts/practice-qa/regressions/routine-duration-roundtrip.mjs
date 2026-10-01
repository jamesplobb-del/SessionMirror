// Run: node scripts/practice-qa/regressions/routine-duration-roundtrip.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const builderFiles = [
  'src/components/MusicRoutineBuilder.tsx',
  'src/components/GuidedRoutineBuilder.tsx',
]

function optionalMinutesMaximum(source, file, sharedMaximum) {
  const inputs = [...source.matchAll(/<input\b[^>]*\baria-label="Exercise minutes"[^>]*>/g)]
  assert.equal(inputs.length, 1, `${file}: expected one Exercise minutes input`)
  const input = inputs[0][0]
  const preceding = source.slice(Math.max(0, inputs[0].index - 240), inputs[0].index)
  assert.match(preceding, /Minutes\s*<small>· optional<\/small>/,
    `${file}: input should remain the optional exercise-duration field`)
  assert.match(input, /\bmax=\{MAX_STEP_MINUTES\}/,
    `${file}: optional duration must use the model's shared maximum`)
  return sharedMaximum
}

const bundle = await build({
  stdin: {
    contents: "export * from './src/utils/practiceRoutines'",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
})
const routines = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
assert.equal(routines.MAX_STEP_MINUTES, 180, 'Existing advertised three-hour practice items remain supported')
const maxima = await Promise.all(builderFiles.map(async file =>
  optionalMinutesMaximum(await readFile(file, 'utf8'), file, routines.MAX_STEP_MINUTES)))
const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
}

for (const [index, max] of maxima.entries()) {
  const durations = [...new Set([0, 5, 60, 61, 120, max])]
  for (const minutes of durations) {
    const requested = routines.createRoutine(`Duration ${index}-${minutes}`,
      [routines.createStep({ title: 'Practice item', minutes })], 'trumpet')
    routines.saveRoutine(requested)
    const reloaded = routines.loadRoutine()
    assert.equal(reloaded?.id, requested.id, 'routine should survive storage round trip')
    assert.equal(reloaded?.steps[0]?.minutes, minutes,
      `builder input allows ${minutes} minutes; storage changed it to ${reloaded?.steps[0]?.minutes}`)
  }
}
assert.equal(routines.clampMinutes(-1), 0)
assert.equal(routines.clampMinutes(181), routines.MAX_STEP_MINUTES)
assert.equal(routines.clampMinutes(120.6), 121)
assert.equal(routines.clampMinutes(Number.NaN), 5)
assert.equal(routines.clampMinutes(Infinity), 5)

console.log(`PASS: duration round trips for builder maxima ${maxima.join(' and ')}`)

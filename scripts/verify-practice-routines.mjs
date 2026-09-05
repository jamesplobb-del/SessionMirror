// Exercise daily-routine storage, presets, and suggestions.
// Run: node scripts/verify-practice-routines.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function load(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
}

const instruments = await load('src/utils/instrumentProfiles.ts')
assert.equal(instruments.instrumentHeading('trumpet'), 'Trumpet')
assert.equal(instruments.describeHandsFreeGate(34), 'Loud gate')
assert.equal(instruments.describeHandsFreeGate(16), 'Quiet gate')

const routines = await load('src/utils/practiceRoutines.ts')
const presets = await load('src/utils/routinePresets.ts')

const routine = presets.buildPresetRoutine(presets.getRoutinePresets('trumpet')[1], 'trumpet')
assert.ok(routine.steps.length >= 5, 'A full brass preset has a complete sitting')
assert.equal(routine.instrumentId, 'trumpet')
assert.ok(
  routine.steps.every((step) => !/Clarke|Arban|Stamp|Remington/i.test(step.title)),
  'Preset titles stay method-neutral',
)
assert.ok(routine.steps.some((step) => step.kind === 'tune' && step.desk?.showDrone), 'Long tones bring a drone')
assert.ok(routine.steps.some((step) => step.kind === 'metro' && step.desk?.showMetronome), 'A click step starts the metronome')

routines.saveRoutine(routine)
const reloaded = routines.loadRoutine()
assert.equal(reloaded?.id, routine.id)
assert.equal(reloaded?.steps.length, routine.steps.length)
assert.deepEqual(reloaded?.steps[0].desk?.metronome, routine.steps[0].desk?.metronome)

const day = routines.loadRoutineDay(reloaded)
assert.equal(day.date, routines.todayKey())
assert.equal(day.doneStepIds.length, 0)
const first = routines.nextOpenStep(reloaded, day)
assert.equal(first?.id, reloaded.steps[0].id)

const marked = routines.reconcileDay(
  { ...day, doneStepIds: [reloaded.steps[0].id, 'gone-step'], skippedStepIds: [reloaded.steps[1].id] },
  reloaded,
)
assert.deepEqual(marked.doneStepIds, [reloaded.steps[0].id])
assert.ok(!marked.doneStepIds.includes('gone-step'))
assert.equal(routines.routineProgress(reloaded, marked).done, 1)
assert.equal(routines.routineProgress(reloaded, marked).complete, false)

const allDone = {
  ...marked,
  doneStepIds: reloaded.steps.map((step) => step.id),
  skippedStepIds: [],
}
assert.equal(routines.reconcileDay(allDone, reloaded).completedAt !== null, true)
assert.equal(routines.routineProgress(reloaded, routines.reconcileDay(allDone, reloaded)).complete, true)

const retuned = { ...reloaded, instrumentId: 'trombone', updatedAt: Date.now() }
const stillDone = routines.reconcileDay(allDone, retuned)
assert.equal(retuned.instrumentId, 'trombone')
assert.deepEqual(stillDone.doneStepIds, allDone.doneStepIds, 'Changing instrument must not wipe today’s checks')

const suggestions = presets.getStepSuggestions('trumpet', 'long-tones')
assert.ok(suggestions.some((text) => /Stamp/i.test(text)), 'Trumpet long tones suggest Stamp')
assert.ok(!suggestions.some((text) => /Remington/i.test(text)), 'Remington stays off a trumpet list')
const bone = presets.getStepSuggestions('trombone', 'long-tones')
assert.ok(bone.some((text) => /Remington/i.test(text)), 'Trombone long tones can mention Remington')

const hornDesk = presets.deskFor('french-horn', { drone: true, pitch: true })
assert.equal(hornDesk.drone.pitchClass, 5, 'Horn long tones drone on F')
const trumpetDesk = presets.deskFor('trumpet', { drone: true })
assert.equal(trumpetDesk.drone.pitchClass, 10, 'Trumpet long tones drone on B♭')

routines.saveRoutine(null)
assert.equal(routines.loadRoutine(), null)
storage.set('besttake:practice-routine:v1', '{broken')
assert.equal(routines.loadRoutine(), null, 'Corrupt storage must not prevent startup')

console.log('practice routines: ok')

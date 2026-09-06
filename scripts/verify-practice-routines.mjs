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

// Session groundwork: pause/resume, process restart, multiple routines, and real persistence failures.
const plan = routines.createRoutine('Session test', [routines.createStep({ title: 'Tone', kind: 'tune' }), routines.createStep({ title: 'Excerpt', kind: 'record' })], 'flute')
const [tone, excerpt] = plan.steps
let sitting = routines.startRoutineDayStep(routines.freshRoutineDay(plan.id), tone.id, 'sitting-a', 1000)
sitting = routines.checkpointRoutineDay(sitting, 11000, routines.blankDesk())
assert.equal(sitting.elapsedMsByStep[tone.id], 10000)
sitting = routines.pauseRoutineDay(sitting, 16000)
assert.equal(sitting.pausedStepId, tone.id)
assert.equal(sitting.activeStepId, null)
assert.equal(sitting.elapsedMsByStep[tone.id], 15000)
sitting = routines.startRoutineDayStep(sitting, tone.id, 'sitting-a', 116000)
sitting = routines.settleRoutineDayStep(sitting, plan, tone.id, 'done', 121000)
assert.equal(sitting.elapsedMsByStep[tone.id], 20000, 'A long break contributes zero practice time')
assert.deepEqual(sitting.sessionIdsByStep[tone.id], ['sitting-a'], 'Resume is the same sitting')

// Peeking at Home holds the clock but keeps the item current, so coming back
// needs no second decision - and the time spent reading still does not count.
let peek = routines.startRoutineDayStep(routines.freshRoutineDay(plan.id), tone.id, 'sitting-peek', 1000)
peek = routines.holdRoutineDay(peek, 11000)
assert.equal(peek.elapsedMsByStep[tone.id], 10000, 'Time up to the peek is banked')
assert.equal(peek.activeStepId, tone.id, 'The item stays current while Home is open')
assert.equal(peek.activeStepStartedAt, null, 'The clock is stopped while Home is open')
assert.equal(peek.pausedStepId, null, 'A peek is not a pause')
// A long read of the Today list, then back to work.
peek = routines.resumeRoutineDay(peek, 71000)
assert.equal(peek.elapsedMsByStep[tone.id], 10000, 'Reading Today adds no practice time')
peek = routines.checkpointRoutineDay(peek, 76000)
assert.equal(peek.elapsedMsByStep[tone.id], 15000, 'Only playing time accrues after returning')
// Resuming is idempotent and never revives a genuine pause.
const paused = routines.pauseRoutineDay(peek, 80000)
assert.equal(routines.resumeRoutineDay(paused, 90000).activeStepStartedAt, null, 'Resume cannot restart a paused day')
assert.equal(routines.holdRoutineDay(paused, 95000), paused, 'Holding an already-paused day is a no-op')
assert.equal(sitting.pausedStepId, null)
sitting = routines.startRoutineDayStep(sitting, excerpt.id, 'sitting-b', 122000)
sitting = routines.checkpointRoutineDay(sitting, 132000)
routines.saveRoutineDay(sitting)
const restarted = routines.loadRoutineDay(plan)
assert.equal(restarted.activeStepId, null, 'Cold start cannot silently restart tools or timers')
assert.equal(restarted.pausedStepId, excerpt.id)
assert.equal(restarted.elapsedMsByStep[excerpt.id], 10000, 'Cold start accrues no offline hours')
const different = routines.createRoutine('Other plan', [routines.createStep({ title: 'Tone' })], 'trumpet')
routines.saveRoutineDay(routines.freshRoutineDay(different.id))
assert.deepEqual(routines.loadRoutineDay(plan).doneStepIds, [tone.id], 'Switching plans preserves each checklist')
routines.saveRoutineDay({ ...restarted, date: '2020-01-01' })
assert.ok(routines.loadRoutineHistory(plan.id).some(day => day.date === '2020-01-01'), 'Earlier days remain in history')
const finished = routines.settleRoutineDayStep(restarted, plan, excerpt.id, 'skipped', 133000)
assert.ok(finished.completedAt)
assert.equal(finished.doneStepIds.length, 1, 'Skipped does not mean completed')
const revised = routines.reconcileDay(restarted, { ...plan, steps: [tone] })
assert.equal(revised.pausedStepId, null, 'Removing the paused item removes its resume target')
assert.deepEqual(plan.steps[0].desk, null, 'Session desk snapshots never mutate routine presets')
localStorage.setItem = () => { throw new Error('QuotaExceededError') }
assert.throws(() => routines.saveRoutineDay(finished), /QuotaExceededError/, 'Failed progress persistence reaches the UI')

const { PracticeTransitionGate } = await load('src/utils/practiceTransitions.ts')
const gate = new PracticeTransitionGate()
let release
let starts = 0
const pending = gate.run('same-item', async () => { starts++; await new Promise(resolve => { release = resolve }) })
const duplicate = gate.run('same-item', async () => { starts++ })
assert.equal(duplicate, pending, 'Repeated taps share the same operation')
await assert.rejects(gate.run('different-item', async () => {}), /Another practice item/)
await Promise.resolve()
release()
await pending
assert.equal(starts, 1)
assert.equal(gate.busy, false)
await assert.rejects(gate.run('failure', async () => { throw new Error('Database unavailable') }), /Database unavailable/)
assert.equal(gate.busy, false, 'Failures release the navigation guard')
await gate.run('retry', async () => { starts++ })
assert.equal(starts, 2)
console.log('Session flow checks passed: paused time, restart recovery, daily archive, plan isolation, skipped outcomes, storage errors, duplicate taps, competing navigation, and retry after failure.')

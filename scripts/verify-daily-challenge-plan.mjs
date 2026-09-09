import assert from 'node:assert/strict'
import { build } from 'esbuild'
const memory = new Map()
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) }
const compiled = await build({ stdin: { contents: `export * from './src/utils/dailyChallengePlan'; export * from './src/utils/dailyChallenges'; export * from './src/utils/instrumentProfiles'; export * from './src/utils/practiceRoutines';`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.svg': 'dataurl', '.png': 'dataurl' }, define: { 'import.meta.env': '{}' } })
const c = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const now = new Date()
for (const instrument of c.INSTRUMENT_PROFILES) {
 const plan = c.getDailyChallengePlan(instrument.id, null, now)
 assert.equal(plan.instrumentId, instrument.id)
 assert.equal(plan.practice.routine.instrumentId, instrument.id)
 assert.equal(plan.practice.routine.steps.length, 1)
 assert.equal(plan.practice.routine.steps[0].minutes, 1)
 assert.ok(plan.practice.routine.steps[0].title)
 if (instrument.family !== 'Brass') assert.doesNotMatch(plan.practice.routine.steps[0].title, /buzz|lip slur/i)
 assert.deepEqual(c.getDailyChallengePlan(instrument.id, null, now), plan, 'Reopen preserves exact challenge')
}
memory.clear()
const original = c.createRoutine('My routine', [c.createStep({ title: 'My exact exercise', kind: 'tune' })], 'trumpet')
c.saveRoutine(original)
const plan = c.getDailyChallengePlan('trumpet', original, now)
assert.equal(plan.practice.sourceRoutineId, original.id)
assert.equal(plan.practice.routine.steps[0].title, 'My exact exercise')
assert.deepEqual(c.getDailyChallengePlan('trumpet', null, now), plan, 'Deleting/editing a routine cannot reroll today')
assert.deepEqual(c.loadRoutine(), original, 'Generated challenge never writes saved routine')
assert.equal(c.resolveDailyPractice(plan, original).temporary, false)
assert.equal(c.resolveDailyPractice(plan, null).temporary, true)
assert.equal(c.resolveDailyPractice(plan, { ...original, steps: original.steps.map(s => ({ ...s, title: 'Changed exercise' })) }).temporary, true)
assert.equal(c.resolveDailyPractice(plan, { ...original, instrumentId: 'flute' }).temporary, true)
const step = plan.practice.routine.steps[0]
let day = c.freshRoutineDay(plan.practice.routine.id)
day.doneStepIds = [step.id]
day.elapsedMsByStep[step.id] = 59000
c.recordPlannedRoutine(day)
assert.equal(c.trophyCount(c.loadChallengeProgress()), 0)
day.elapsedMsByStep[step.id] = 60000
c.recordPlannedRoutine(day)
assert.equal(c.trophyCount(c.loadChallengeProgress()), 1)
c.recordPlannedRoutine(day)
assert.equal(c.trophyCount(c.loadChallengeProgress()), 1)
const tomorrow = new Date(now); tomorrow.setDate(now.getDate()+1)
assert.notEqual(c.getDailyChallengePlan('trumpet', original, tomorrow).date, plan.date)
// Locate one Staff challenge today, then verify exact outcome matching.
memory.clear()
let staff
for (const i of c.INSTRUMENT_PROFILES) {
 const p = c.getDailyChallengePlan(i.id, null, now)
 if (p.game.route === 'staff-jumper') { staff = p; break }
}
assert.ok(staff)
const event = { game: 'staff-jumper', instrumentId: staff.game.instrumentId, key: staff.game.key, scaleMode: 'major', correctNotes: 8, startedAtMs: now.getTime() }
assert.equal(c.recordPlannedGame({ ...event, key: 'not-the-key' }), false)
assert.equal(c.recordPlannedGame({ ...event, instrumentId: 'not-the-instrument' }), false)
assert.equal(c.recordPlannedGame({ ...event, correctNotes: 7 }), false)
assert.equal(c.recordPlannedGame({ ...event, scaleMode: 'minor' }), false)
assert.equal(c.recordPlannedGame({ ...event, startedAtMs: now.getTime()-86400000 }), false)
assert.equal(c.recordPlannedGame(event), true)
assert.equal(c.recordPlannedGame(event), false)
memory.clear()
let balance
for (const i of c.INSTRUMENT_PROFILES) {
 const p = c.getDailyChallengePlan(i.id, null, now)
 if (p.game.route === 'balance') { balance = p; break }
}
assert.ok(balance)
const balanceEvent = { game: 'balance', instrumentId: balance.game.instrumentId, date: balance.date, completed: true }
assert.equal(c.recordPlannedGame({ ...balanceEvent, completed: false }), false)
assert.equal(c.recordPlannedGame({ ...balanceEvent, date: null }), false)
assert.equal(c.recordPlannedGame(balanceEvent), true)
console.log('Daily plans passed: every instrument, frozen targets, untouched routine, duration thresholds, exact game settings, midnight, and duplicate awards.')

import assert from 'node:assert/strict'
import { build } from 'esbuild'
async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const { advanceAutoStart } = await load('src/utils/autoStartGate.ts')
const { getAutoRecordProfile } = await load('src/utils/appSettings.ts')
for (const threshold of [10, 45, 80]) {
  const profile = getAutoRecordProfile(threshold)
  let since = null
  for (let time = 0; time <= 480; time += 48) {
    const pulse = time % 144 === 0
    const decision = advanceAutoStart(since, time, pulse ? profile.gate * 5 : profile.gate / 2, profile.gate, profile.holdMs)
    assert.equal(decision.start, false, 'Separate spikes must not accumulate into a start')
    since = decision.since
  }
  assert.equal(advanceAutoStart(0, profile.holdMs, profile.gate * 2, profile.gate, profile.holdMs).start, true)
  assert.equal(advanceAutoStart(0, 999, NaN, profile.gate, profile.holdMs).start, false)
}
const { buildGoalRoutine, PRACTICE_GOALS } = await load('src/utils/routineGoals.ts')
const { INSTRUMENT_PROFILES } = await load('src/utils/instrumentProfiles.ts')
const { getStepTemplates } = await load('src/utils/routinePresets.ts')
for (const instrument of INSTRUMENT_PROFILES) for (const goal of PRACTICE_GOALS) for (const minutes of [10, 20, 30, 45]) {
  const routine = buildGoalRoutine(instrument.id, goal.id, minutes)
  const validTitles = getStepTemplates(instrument.id).map(item => item.title)
  assert.ok(routine.steps.length)
  assert.equal(routine.steps.reduce((sum, item) => sum + item.minutes, 0), minutes)
  assert.ok(routine.steps.every(item => validTitles.includes(item.title)), `${instrument.id}: exercises must belong to selected instrument`)
  assert.equal(new Set(routine.steps.map(item => item.id)).size, routine.steps.length)
}
const store = new Map()
globalThis.localStorage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) }
globalThis.window = { innerWidth: 390, innerHeight: 844 }
const positions = await load('src/utils/floatingWidgetLayout.ts')
store.set('sessionmirror:persistent-widget-pos:test', JSON.stringify({ x: 90, y: 230 }))
assert.equal(positions.loadPersistentWidgetPosition('test'), null, 'Legacy auto-clamped offsets should not move cards on launch')
positions.savePersistentWidgetPosition('test', 20, 30)
assert.deepEqual(positions.loadPersistentWidgetPosition('test'), { x: 20, y: 30 })
window.innerWidth = 844; window.innerHeight = 390
assert.equal(positions.loadPersistentWidgetPosition('test'), null, 'A different orientation uses the default layout')
console.log('Passed: transient rejection, sustained starts, instrument-specific goal plans, duration totals, and deliberate take-card positions.')

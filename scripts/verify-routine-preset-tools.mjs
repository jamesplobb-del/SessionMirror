// Run: node scripts/verify-routine-preset-tools.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({
  stdin: { contents: `
    export * from './src/utils/routinePresets';
    export * from './src/utils/routineGoals';
    export * from './src/utils/instrumentProfiles';
    export * from './src/utils/practiceRoutines';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm',
})
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
}
const step = (instrument, id) => {
  const template = api.getStepTemplates(instrument).find(item => item.id === id)
  assert.ok(template, `${instrument}: missing ${id}`)
  return api.stepFromTemplate(template, instrument)
}
let presetCount = 0
let goalCount = 0
for (const instrument of [...api.INSTRUMENT_PROFILES.map(item => item.id), null]) {
  const templates = api.getStepTemplates(instrument)
  assert.equal(new Set(templates.map(item => item.id)).size, templates.length, `${instrument}: duplicate template IDs`)
  for (const preset of api.getRoutinePresets(instrument)) {
    const routine = api.buildPresetRoutine(preset, instrument)
    assert.equal(routine.steps.length, preset.templateIds.length, `${instrument}: silently missing preset steps`)
    assert.equal(routine.steps.reduce((sum, item) => sum + item.minutes, 0), api.presetMinutes(preset, instrument))
    api.saveRoutine(routine)
    const saved = api.loadRoutine()
    for (const [index, item] of routine.steps.entries()) {
      assert.equal(saved.steps[index].kind, item.kind, `${instrument}: tab survives storage`)
      for (const flag of ['showMetronome', 'showDrone', 'pitchTrackerEnabled']) {
        assert.equal(saved.steps[index].desk?.[flag], item.desk?.[flag], `${instrument}: ${flag} survives storage`)
      }
    }
    presetCount++
  }
  for (const goal of api.PRACTICE_GOALS) {
    const routine = api.buildGoalRoutine(instrument, goal.id, 20)
    assert.ok(routine.steps.length > 0)
    assert.equal(routine.steps.reduce((sum, item) => sum + item.minutes, 0), 20)
    for (const item of routine.steps) {
      const template = templates.find(candidate => candidate.title === item.title)
      assert.ok(template, `${instrument}/${goal.id}: exercise belongs to this instrument`)
      assert.equal(item.kind, template.kind)
      assert.deepEqual(item.desk, template.desk(instrument))
    }
    goalCount++
  }
  for (const id of ['long-tones', 'sustained', 'tenor-register']) {
    if (!templates.some(item => item.id === id)) continue
    const item = step(instrument, id)
    assert.equal(item.kind, 'tune', `${instrument}/${id}: opens Tuner`)
    assert.equal(item.desk.mode, 'audio')
    assert.equal(item.desk.showDrone, true)
    assert.equal(item.desk.pitchTrackerEnabled, true)
    assert.equal(item.desk.showMetronome, true)
    assert.equal(item.desk.metronome.bpm, 60)
  }
  for (const template of templates.filter(item => item.kind === 'metro')) {
    assert.equal(template.desk(instrument).showMetronome, true, `${instrument}/${template.id}: click is available`)
  }
}
for (const instrument of ['trumpet', 'french-horn', 'trombone', 'euphonium', 'tuba']) {
  const item = step(instrument, 'buzzing')
  assert.equal(item.kind, 'tune', `${instrument}: buzzing starts on Tuner`)
  assert.equal(item.desk.showDrone, true)
  assert.equal(item.desk.pitchTrackerEnabled, true)
  assert.equal(item.desk.showMetronome, false)
}
for (const instrument of ['flute', 'clarinet', 'soprano-sax', 'alto-sax', 'tenor-sax', 'oboe', 'bassoon']) {
  assert.equal(step(instrument, 'breathing').desk.showDrone, false, `${instrument}: no full-instrument drone for isolated setup`)
}
assert.equal(step('voice', 'body').desk.mode, 'video', 'Unpitched breathing uses posture feedback')
assert.equal(step('voice', 'body').desk.showDrone, false)
assert.equal(step('voice', 'sirens').desk.showDrone, false, 'A moving siren has no fixed drone target')
assert.equal(step('trumpet', 'flow').desk.metronome.bpm, 72, 'Flow studies retain their own pacing')
assert.equal(step('trumpet', 'flow').desk.showDrone, false)
for (const instrument of ['guitar', 'bass-guitar', 'ukulele']) {
  assert.ok(api.getStepTemplates(instrument).every(item => !['bow-warmup', 'bowing', 'shifting'].includes(item.id)))
}
for (const instrument of ['violin', 'viola', 'cello', 'double-bass']) {
  assert.equal(step(instrument, 'bow-warmup').desk.mode, 'video')
  assert.equal(step(instrument, 'intonation').desk.showDrone, true)
}
assert.ok(api.getStepTemplates('piano').every(item => !item.desk('piano')?.showDrone))
assert.match(step('recorder', 'technique').title, /Thumb/)
assert.doesNotMatch(step('recorder', 'breathing').title, /harmonics/i)
console.log(`PASS: ${presetCount} presets, ${goalCount} goal plans, sustained-tone tools, brass buzzing, and instrument-specific exceptions`)

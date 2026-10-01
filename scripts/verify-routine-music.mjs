// Run: node scripts/verify-routine-music.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const result = await build({
  stdin: { contents: `export * from './src/utils/routineMusic'; export * from './src/utils/practiceRoutines'; export * from './src/utils/routineLibrary'; export * from './src/utils/deskMetronome'`, resolveDir: process.cwd() },
  bundle: true, plugins:[{name:'plus-entitled-fixture',setup(b){b.onResolve({filter:/\/plusAccess$/},()=>({path:'plus',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const canUsePlus=()=>true, requirePlus=()=>true'}))}}], write: false, platform: 'node', format: 'esm', external: ['pdfjs-dist/*'],
})
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
}
assert.deepEqual(api.loadExerciseLibrary(), [], 'First use must not seed any scores or exercises')
assert.deepEqual(api.loadRoutineLibrary(), [], 'First use must not seed a routine')

const first = api.createMusicExercise('Clarke_Study-2.PDF', 'score-a')
const second = api.createMusicExercise('Lyrical-study.jpg', 'score-b')
assert.equal(first.title, 'Clarke Study 2')
assert.equal(first.kind, 'record')
assert.equal(first.minutes, 0, 'Import should not require a duration')
assert.equal(first.desk.mode, 'audio')
assert.equal(first.desk.showMusic, true, 'New music must launch the existing reader')
assert.notEqual(first.id, second.id)
// Execute the actual builder's derived count: unscored practice items are not selected library rows.
const builderSource = await readFile('src/components/MusicRoutineBuilder.tsx', 'utf8')
const countExpression = builderSource.match(/const selectedMusicCount = ([^\n]+)/)?.[1]
assert.ok(countExpression, 'Builder must derive its visible music selection count')
assert.match(builderSource, /<span>\{selectedMusicCount\} selected<\/span>/)
const countMusic = new Function('music', 'draft', `return ${countExpression}`)
const visibleMusic = [{ step: first }, { step: second }]
const oldPractice = [{ projectId: 'unscored-a' }, { projectId: 'unscored-b' }]
assert.equal(countMusic([{ step: first }], { steps: oldPractice }), 0, 'Two old practice items cannot count as selected when the sole visible score is unchecked')
const mixedSteps = [...oldPractice, first, { ...first, id: 'repeat-piece' }]
const beforeCount = JSON.stringify(mixedSteps)
assert.equal(countMusic(visibleMusic, { steps: mixedSteps }), 1, 'Repeated occurrences count as one selected library row')
assert.equal(countMusic(visibleMusic, { steps: [...mixedSteps, second] }), 2)
assert.equal(JSON.stringify(mixedSteps), beforeCount, 'Counting must preserve every draft item')
first.referenceVideoId = 'dQw4w9WgXcQ'
first.desk.showMetronome = true
first.desk.pitchTrackerEnabled = true
first.desk.showDrone = true
first.desk.drone = { pitchClass: 10, octave: 3 }
first.desk.metronome = api.normalizeDeskMetronome({ bpm: 100, meter: '7/8', soundId: 'woodblock', accentLevels: ['strong', 'silent', 'weak', 'medium', 'silent', 'weak', 'weak'] })
second.desk.metronome = api.normalizeDeskMetronome({ bpm: 72, meter: '3/4' })
second.desk.autoSoundRecording = true
second.referenceVideoId = 'example-ref'
second.programId = 'example-program'
const plan = api.createRoutine('Morning music', [first, second], 'trumpet')
api.storeLibraryRoutine(plan)
for (const step of plan.steps) api.storeLibraryExercise({ instrumentId: plan.instrumentId, step })
api.saveRoutine(plan)
const reloaded = api.loadRoutine()
assert.deepEqual(reloaded.steps.map(step => step.projectId), ['score-a', 'score-b'])
assert.equal(reloaded.steps[0].referenceVideoId, first.referenceVideoId, 'An exercise keeps its chosen reference alongside its score')
assert.deepEqual(reloaded.steps[0].desk.metronome, first.desk.metronome, 'All advanced click settings survive save/reload')
assert.equal(reloaded.steps[1].desk.metronome.bpm, 72, 'Other exercises retain their own settings')
assert.deepEqual(api.loadRoutineLibrary()[0], reloaded)

const reused = api.reuseMusicExercise(api.loadExerciseLibrary().find(item => item.step.id === first.id).step)
assert.equal(reused.projectId, first.projectId, 'Reuse opens the same imported file and practice history')
assert.deepEqual(reused.desk, first.desk)
reused.desk.metronome.accentLevels[0] = 'silent'
reused.desk.drone.pitchClass = 0
assert.equal(first.desk.metronome.accentLevels[0], 'strong', 'Editing a reused setup cannot mutate the original')
assert.equal(first.desk.drone.pitchClass, 10)
assert.equal(api.reuseMusicExercise({ ...first, kind: 'tune' }).kind, 'record', 'Music selected from an older tuner exercise opens in the music workspace')

const copied = api.copyExerciseTools(first, second)
assert.equal(copied.projectId, 'score-b')
assert.equal(copied.id, second.id)
assert.equal(copied.referenceVideoId, second.referenceVideoId)
assert.equal(copied.programId, second.programId)
assert.equal(copied.desk.autoSoundRecording, true)
assert.deepEqual(copied.desk.metronome, first.desk.metronome)
assert.equal(copied.desk.pitchTrackerEnabled, true)
copied.desk.metronome.accentLevels[0] = 'silent'
copied.desk.drone.pitchClass = 5
assert.equal(first.desk.metronome.accentLevels[0], 'strong')
assert.equal(first.desk.drone.pitchClass, 10)
assert.equal(second.desk.metronome.bpm, 72, 'Copy returns a new destination setup')
const game = api.createStep({ kind: 'game', title: 'Game' })
assert.equal(api.copyExerciseTools(first, game), game, 'Copy cannot change non-workspace exercises')
await assert.rejects(api.prepareRoutineMusicFile(new File([], 'empty.pdf', { type: 'application/pdf' })), /empty/)
await assert.rejects(api.prepareRoutineMusicFile(new File(['text'], 'notes.txt', { type: 'text/plain' })), /Choose a PDF/)
console.log('PASS: empty library; selected score-row count; individual imported scores; advanced settings persistence; reuse isolation; selective tool copying; invalid/empty files')

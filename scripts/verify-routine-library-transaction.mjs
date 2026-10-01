// Run: node scripts/verify-routine-library-transaction.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({
  stdin: { contents: "export * from './src/utils/routineLibrary'; export * from './src/utils/practiceRoutines'", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'entitled-fixture', setup(builder) {
    builder.onResolve({ filter: /\/plusAccess$/ }, () => ({ path: 'plus', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const canUsePlus=()=>true, requirePlus=()=>true' }))
  } }],
})
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const ROUTINES = 'besttake:routine-library:v1'
const EXERCISES = 'besttake:exercise-library:v1'
const storage = new Map()
const writes = []
let rejectWrite = () => false
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => {
    if (rejectWrite(key, value)) throw new Error('Quota exceeded')
    storage.set(key, value); writes.push(['set', key])
  },
  removeItem: key => { storage.delete(key); writes.push(['remove', key]) },
}

const original = api.createRoutine('Original', [api.createStep({ title: 'Etude', minutes: 60 })], 'trumpet')
const unrelated = api.createRoutine('Other', [api.createStep({ title: 'Scales', minutes: 5 })], 'trumpet')
api.storeLibraryRoutineWithExercises(original)
api.storeLibraryRoutineWithExercises(unrelated)
const before = new Map(storage)
const edited = { ...original, updatedAt: original.updatedAt + 1, steps: [{ ...original.steps[0], minutes: 120 }] }
writes.length = 0
rejectWrite = key => key === ROUTINES
assert.throws(() => api.storeLibraryRoutineWithExercises(edited), /Quota exceeded/)
assert.deepEqual(storage, before, 'Routine quota failure restores existing exercise setups and leaves both libraries byte-for-byte unchanged')
assert.deepEqual(writes, [['set', EXERCISES], ['set', EXERCISES]], 'Rollback touches only the successfully mutated exercise key')

rejectWrite = () => false
api.storeLibraryRoutineWithExercises(edited)
api.storeLibraryRoutineWithExercises(edited)
assert.equal(api.loadRoutineLibrary().filter(item => item.id === edited.id).length, 1, 'Retry never duplicates a routine')
assert.equal(api.loadExerciseLibrary().filter(item => item.step.id === edited.steps[0].id).length, 1, 'Retry never duplicates reused exercises')
assert.equal(api.loadExerciseLibrary().find(item => item.step.id === edited.steps[0].id).step.minutes, 120)
assert.deepEqual(api.loadRoutineLibrary().find(item => item.id === unrelated.id), unrelated, 'Unrelated routine remains unchanged')

const staleSnapshot = new Map(storage)
writes.length = 0
api.storeLibraryRoutineWithExercises(original)
assert.deepEqual(storage, staleSnapshot, 'Older Today copy cannot overwrite newer saved routine or exercises')
assert.deepEqual(writes, [], 'Stale save performs no writes')

const next = api.createRoutine('Next', [api.createStep({ title: 'Piece', minutes: 180 })], 'trumpet')
const newerUnrelated = { ...unrelated, updatedAt: unrelated.updatedAt + 1, name: 'Newer saved name' }
api.storeLibraryRoutineWithExercises(newerUnrelated)
api.storeLibraryRoutineWithExercises(next, unrelated)
assert.equal(api.loadRoutineLibrary().find(item => item.id === unrelated.id).name, newerUnrelated.name, 'Preserving previous routine keeps its newer saved edit')
assert.equal(api.loadRoutineLibrary()[0].id, next.id)

// The first write itself fails: no rollback write should be attempted.
writes.length = 0
rejectWrite = () => true
assert.throws(() => api.storeLibraryRoutineWithExercises({ ...next, updatedAt: next.updatedAt + 1, steps: [{ ...next.steps[0], minutes: 90 }] }), /Quota exceeded/)
assert.deepEqual(writes, [])

// Previously absent keys must remain absent after a failed first save.
storage.clear(); writes.length = 0
rejectWrite = key => key === ROUTINES
assert.throws(() => api.storeLibraryRoutineWithExercises(next), /Quota exceeded/)
assert.equal(storage.size, 0)
assert.deepEqual(writes, [['set', EXERCISES], ['remove', EXERCISES]])

rejectWrite = () => false
api.storeLibraryRoutineWithExercises(original)
const oldExercises = storage.get(EXERCISES)
rejectWrite = (key, value) => key === ROUTINES || (key === EXERCISES && value === oldExercises)
assert.throws(() => api.storeLibraryRoutineWithExercises(edited), error => error instanceof api.RoutineLibraryRecoveryError && /could not be restored/.test(error.message), 'Rollback failure is reported honestly, never presented as restored data')

console.log('PASS: quota failure rolls back prior exercise setups; retry deduplicates; unrelated/newer routines survive; only mutated keys restore; absent keys and failed rollback handled')

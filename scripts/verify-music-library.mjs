import assert from 'node:assert/strict'
import { build } from 'esbuild'

const storage = new Map()
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
const result = await build({ stdin: { contents: `export * from './src/utils/musicLibrary'; export * from './src/utils/routineLibrary'; export * from './src/utils/routineMusic'; export * from './src/utils/practiceRoutines'; export * from './src/utils/deskMemory'`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', external: ['pdfjs-dist/*'] })
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
assert.deepEqual(api.loadMusicOrder(), [])
assert.deepEqual(api.loadMusicOrganization(), { folders: [], placements: {} })
assert.equal(api.loadMusicSetup('a'), null)
api.saveMusicOrder(['b', 'a', 'b', 'deleted'])
assert.deepEqual(api.loadMusicOrder(), ['b', 'a', 'deleted'])
assert.deepEqual(api.orderMusic([{ id: 'new' }, { id: 'a' }, { id: 'b' }], api.loadMusicOrder()).map(item => item.id), ['b', 'a', 'new'])
api.saveMusicOrganization({ folders: [{ id: 'method', name: 'Clarke Studies' }], placements: { a: 'method' } })
assert.deepEqual(api.loadMusicOrganization(), { folders: [{ id: 'method', name: 'Clarke Studies' }], placements: { a: 'method' } })
storage.set('besttake:music-folders:v1', JSON.stringify({ folders: [{ id: 'method', name: 'Clarke Studies' }], placements: { a: 'missing' } }))
assert.deepEqual(api.loadMusicOrganization().placements, {}, 'Removed folders cannot strand music outside All music')
storage.delete('besttake:music-folders:v1')
const study = api.createMusicExercise('Study.pdf', 'a')
study.desk.showMetronome = true
study.desk.metronome = { ...study.desk.metronome, bpm: 100, meter: '7/8' }
study.desk.pitchTrackerEnabled = true
api.storeLibraryExercise({ instrumentId: 'trumpet', step: study })
assert.equal(api.loadMusicSetup('a').metronome.bpm, 100, 'Library opens with the exercise setup saved in routines')
const saved = { ...study.desk, metronome: { ...study.desk.metronome, bpm: 112 }, autoSoundRecording: true }
api.saveMusicSetup('a', saved)
assert.equal(api.loadMusicSetup('a').metronome.bpm, 112)
assert.equal(api.loadMusicSetup('a').autoSoundRecording, true, 'Explicit hands-free selection stays with the score')
assert.equal(api.loadMusicSetup('b'), null, 'Scores do not inherit each other’s tools')
assert.equal(api.loadMusicScoreSettings('a'), null)
api.saveMusicScoreSettings('a', { referenceQuery: '', referenceVideoId: 'abc123DEF45', programId: 'program-one' })
assert.deepEqual(api.loadMusicScoreSettings('a'), { referenceQuery: '', referenceVideoId: 'abc123DEF45', programId: 'program-one' })
assert.equal(api.loadMusicScoreSettings('b'), null, 'References and programs stay with the selected score')
assert.equal(api.reuseMusicExercise(study).desk.metronome.bpm, 112, 'New routine selections use the score’s latest setup')
assert.equal(api.reuseMusicExercise(study).referenceVideoId, 'abc123DEF45')
assert.equal(api.reuseMusicExercise(study).programId, 'program-one')
assert.equal(study.desk.metronome.bpm, 100, 'An existing routine keeps its individual setup')
storage.set('besttake:music-setup:v1:a', 'broken')
assert.equal(api.loadMusicSetup('a').metronome.bpm, 100, 'Corrupt personal settings fall back to the routine setup')
api.saveLastSurface({ mode: 'audio', tab: 'music' })
assert.equal(api.loadLastSurface().tab, 'music')
console.log('PASS: library ordering, missing/deleted entries, saved score setup, routine fallback and isolation, Music navigation restore')

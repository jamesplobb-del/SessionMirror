import assert from 'node:assert/strict'
import { build } from 'esbuild'
const storage = new Map()
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
async function load(entry, plugins = []) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', plugins })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const passages = await load('src/utils/practicePassages.ts')
const passage = { startSeconds: 62, endSeconds: 78, positionSeconds: 65, loop: true }
passages.savePracticePassage('trumpet', 'youtube:abcdefghijk', passage)
assert.deepEqual(passages.loadPracticePassage('trumpet', 'youtube:abcdefghijk'), passage)
assert.equal(passages.loadPracticePassage('flute', 'youtube:abcdefghijk').startSeconds, null)
assert.equal(passages.loadPracticePassage('trumpet', 'youtube:other-video').startSeconds, null)
assert.equal(passages.parsePassageTime('1:02.5'), 62.5)
assert.equal(passages.parsePassageTime('1:99'), null)
assert.equal(passages.parsePassageTime('-2'), null)
assert.equal(passages.parsePassageTime('Infinity'), null)
assert.equal(passages.normalizePassage({ ...passage, endSeconds: 61 }).loop, false)
assert.equal(passages.normalizePassage({ ...passage, positionSeconds: NaN }).positionSeconds, 0)
const routines = await load('src/utils/practiceRoutines.ts')
const step = routines.createStep({ title: 'Old title', kind: 'record', programId: 'program-one', projectId: 'project-one' })
assert.equal(routines.parseStep(step).programId, 'program-one')
assert.equal(routines.parseStep({ ...step, programId: 42 }).programId, null)

// A reference pinned in the builder must survive a save/load round trip, and
// anything that is not a real YouTube video ID must not.
const pinned = routines.createStep({ title: 'Pinned', kind: 'record', referenceVideoId: 'dQw4w9WgXcQ' })
assert.equal(pinned.referenceVideoId, 'dQw4w9WgXcQ')
assert.equal(routines.parseStep(pinned).referenceVideoId, 'dQw4w9WgXcQ')
assert.equal(routines.createStep({ title: 'Bad', referenceVideoId: 'not-an-id-at-all' }).referenceVideoId, null)
assert.equal(routines.createStep({ title: 'Bad', referenceVideoId: 'https://youtu.be/dQw4w9WgXcQ' }).referenceVideoId, null)
assert.equal(routines.createStep({ title: 'None' }).referenceVideoId, null)
// An unpinned step keeps its search term as the fallback.
assert.equal(routines.createStep({ title: 'Query', referenceQuery: 'Haydn trumpet' }).referenceVideoId, null)
const plan = routines.createRoutine('Session', [step], 'trumpet')
let day = routines.startRoutineDayStep(routines.freshRoutineDay(plan.id), step.id, 'sitting-one', 1000, { title: step.title, projectId: step.projectId })
day = routines.settleRoutineDayStep(day, { ...plan, steps: [{ ...step, title: 'New title' }] }, step.id, 'done', 5000)
assert.equal(day.itemsByStep[step.id].title, 'Old title', 'History titles are snapshots')
routines.saveRoutineDay(day)
assert.equal(routines.loadRoutineHistory(plan.id)[0].itemsByStep[step.id].projectId, 'project-one')

// Exercise the real timeline engine with only the native click boundary replaced.
let resolveStart
const click = { stop() {}, start: () => new Promise(resolve => { resolveStart = resolve }),
  applySectionConfig() {}, subscribeBar: () => () => {}, subscribePulse: () => () => {}, getSnapshot: () => ({ bpm: 80 }) }
globalThis.__sessionClick = click
const plugin = { name: 'native-click-boundary', setup(builder) {
  builder.onResolve({ filter: /sharedMetronomeEngine$/ }, () => ({ path: 'click', namespace: 'test' }))
  builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const sharedMetronomeEngine = globalThis.__sessionClick;' }))
} }
const { TimelinePlaybackEngine } = await load('src/practiceTimeline/playback/timelinePlaybackEngine.ts', [plugin])
const { createEmptyTimeline, createDefaultSection } = await load('src/practiceTimeline/sectionDefaults.ts')
const engine = new TimelinePlaybackEngine()
let originalCalls = 0, observerCalls = 0
engine.setCallbacks({ onStateChange: () => originalCalls++ })
const unsubscribe = engine.subscribe(() => observerCalls++)
const timeline = { ...createEmptyTimeline(), sections: [createDefaultSection()] }
assert.equal(engine.prepareSession(timeline), true)
assert.ok(originalCalls && observerCalls, 'Routine observers coexist with existing view callbacks')
const pending = engine.togglePlay()
engine.pause()
resolveStart(true)
assert.equal(await pending, false, 'Pause during native startup cannot resurrect playback')
assert.equal(engine.getState().playing, false)
const pendingExit = engine.togglePlay()
engine.exitSession()
resolveStart(true)
assert.equal(await pendingExit, false)
assert.equal(engine.getState().sessionActive, false)
unsubscribe()
const calls = observerCalls
engine.prepareSession(timeline)
assert.equal(observerCalls, calls)
console.log('Session extensions passed: passage/source isolation, time validation, program IDs, historical snapshots, timeline observers, and cancellation during native startup.')

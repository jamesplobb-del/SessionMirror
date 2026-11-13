import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { build } from 'esbuild'

const file = 'src/App.tsx'
const ast = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let callback
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleOpenMusicScore') callback = node.initializer.arguments[0]
  ts.forEachChild(node, visit)
}
visit(ast)
assert.ok(callback)
const originalDesk = { mode: 'audio', showMusic: true, autoSoundRecording: true, pitchTrackerEnabled: true, showMetronome: true, showDrone: true, audioEnhancerEnabled: true, showTakeCards: true, metronome: { bpm: 96 } }
const list = { id: 'setlist', name: 'Concert', entries: [{ id: 'first', projectId: 'score', scoreName: 'Piece', cue: 'Opening', desk: originalDesk }, { id: 'reprise', projectId: 'score', scoreName: 'Piece', cue: 'Reprise', desk: originalDesk }] }

async function scenario(overrides = {}) {
  const events = []
  const routine = { id: 'practice', steps: ['one', 'two'] }
  const day = { completedStepIds: ['one'], activeStepId: 'two' }
  let context
  let desk
  let recent
  const owner = { current: 'score' }
  const deps = {
    requirePlus: () => true, isRecording: false, isStopping: false,
    runPracticeTransition: async (_key, work) => work(), hasPracticeChart: () => true,
    activeProjectIdRef: { current: 'score' }, setMusicTakesVisible: () => {},
    routineDayRef: { current: day }, routineRef: { current: routine },
    commitRoutineDay: next => { assert.deepEqual(next.completedStepIds, ['one']); events.push('pause') },
    pauseRoutineDay: current => ({ ...current, activeStepId: null }), liveDeskSnapshotRef: { current: {} },
    pauseRoutineProgram: () => {}, focusedRoutineContextRef: { current: { routineId: 'practice' } },
    focusedPracticeSessionIdRef: { current: 'session' }, endPracticeSession: async () => events.push('detach'),
    focusedPracticeRef: { current: {} }, setFocusedPracticeSessionId: () => {}, setFocusedPractice: () => {}, setFocusedReferenceTakeId: () => {},
    handleSelectProject: async id => events.push(['score', id]), loadMusicSetup: () => originalDesk, blankDesk: () => ({}),
    applyDeskSnapshot: next => { desk = next }, loadExerciseLibrary: () => [], loadMusicScoreSettings: () => ({ programId: 'live-program', referenceVideoId: null }),
    selectPracticeReference: () => {}, buildYoutubeProxyUrl: value => value, getSelectedReferenceUrl: () => null,
    prepareRoutineProgram: value => { assert.equal(value, null, 'Setlist navigation must not prepare a timed program') },
    musicSetupOwnerRef: owner, setMusicWorkspaceExpandRequest: () => {}, pauseYoutubeProxy: () => {}, youtubeIframeRef: { current: null },
    prepareNewYoutubeReference: () => {}, setYoutubeAutoPlayOnLoad: value => assert.equal(value, false),
    setYoutubeUrl: () => {}, canUsePlus: () => true, setChartVisible: () => {}, updateSettings: () => {},
    setMusicLibraryOpen: value => assert.equal(value, false), handleAudioPracticeTabChange: tab => assert.equal(tab, 'music'),
    rememberLastPracticeDestination: () => {}, rememberRecentMusic: value => { recent = value }, setActiveMusicSetlist: value => { context = value }, setTakeDeleteError: () => {},
    ...overrides,
  }
  const compiled = ts.transpileModule(`export function bind(deps) { const {${Object.keys(deps).join(',')}} = deps; const handleOpenMusicScore = ${callback.getText(ast)}; return handleOpenMusicScore }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
  return { open: module.bind(deps), events, owner, day, routine, get desk() { return desk }, get context() { return context }, get recent() { return recent } }
}
const before = JSON.stringify(list)
const fixture = await scenario()
await fixture.open('score', { list, entryId: 'first' })
assert.ok(fixture.events.includes('detach'), 'Same-score setlist entry detaches the routine sitting')
assert.equal(fixture.owner.current, null, 'Setlist setup cannot overwrite the score library setup')
for (const flag of ['autoSoundRecording', 'pitchTrackerEnabled', 'showMetronome', 'showDrone', 'audioEnhancerEnabled', 'showTakeCards']) assert.equal(fixture.desk[flag], false, `${flag} opens quiet`)
assert.equal(fixture.desk.metronome.bpm, 96, 'Saved tempo remains available for deliberate use')
assert.deepEqual(fixture.day.completedStepIds, ['one'], 'Reading does not complete routine steps')
assert.equal(JSON.stringify(list), before, 'Reading never mutates saved entries or their setup')
await fixture.open('score', { list, entryId: 'reprise' })
assert.equal(fixture.context.entryId, 'reprise', 'Repeated pieces retain distinct occurrence identity')
assert.deepEqual(fixture.recent, { projectId: 'score', setlist: { id: list.id, entryId: 'reprise' } })
for (const [overrides, entryId, pattern] of [
  [{ isRecording: true }, 'first', /Stop recording/],
  [{ hasPracticeChart: () => false }, 'first', /no longer available/],
  [{ requirePlus: () => false }, 'first', /Unlock Music/],
  [{}, 'deleted', /entry is no longer available/],
]) {
  const blocked = await scenario(overrides)
  await assert.rejects(blocked.open('score', { list, entryId }), pattern)
  assert.deepEqual(blocked.events, [], 'Blocked navigation makes no session/project mutations')
  assert.equal(blocked.context, undefined)
}
console.log('PASS: setlist reader silence, same-score routine detachment, independent occurrence identity, progress/setup preservation and blocked-navigation recovery')

const bundled = await build({ entryPoints: ['src/utils/recentMusic.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { rememberRecentMusic, resolveRecentMusic } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
const storage = new Map()
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
const canRead = id => id === 'score' || id === 'earlier'
assert.equal(resolveRecentMusic(canRead), null, 'First launch falls back to the Library')
storage.set('sessionmirror:last-practice-destination', JSON.stringify({ kind: 'music', projectId: 'earlier' }))
assert.deepEqual(resolveRecentMusic(canRead), { projectId: 'earlier' }, 'Existing installs reuse their remembered score')
storage.set('sessionmirror:last-practice-destination', JSON.stringify({ kind: 'routine', routineId: 'latest' }))
storage.set('besttake:music-setlists:v1', JSON.stringify([list]))
rememberRecentMusic(fixture.recent)
assert.equal(resolveRecentMusic(canRead).setlist.entryId, 'reprise', 'Reopen the exact occurrence even after using a routine')
storage.set('besttake:music-setlists:v1', JSON.stringify([{ ...list, name: 'Renamed', entries: [list.entries[0]] }]))
assert.equal(resolveRecentMusic(canRead).setlist.list.name, 'Renamed')
assert.equal(resolveRecentMusic(canRead).setlist.entryId, 'first', 'A removed entry uses the first available piece in its setlist')
storage.delete('besttake:music-setlists:v1')
assert.deepEqual(resolveRecentMusic(canRead), { projectId: 'score' }, 'A deleted setlist can still reopen its surviving score')
assert.equal(resolveRecentMusic(() => false), null, 'A deleted score falls back to the Library')
rememberRecentMusic({ projectId: 'earlier' })
assert.deepEqual(resolveRecentMusic(canRead), { projectId: 'earlier' }, 'Opening a standalone score replaces setlist history')
console.log('PASS: Continue Music history, repeated entries, renamed/deleted setlists, standalone scores, and Library fallback')

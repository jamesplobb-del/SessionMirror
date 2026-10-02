// Execute the production callbacks in isolated fixtures, without initializing media or StoreKit.
// Run: node scripts/verify-routine-start-recovery.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { build } from 'esbuild'

async function bindCallback(file, name, dependencies) {
  const source = await readFile(file, 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let callback
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) {
      const value = node.initializer
      callback = ts.isCallExpression(value) ? value.arguments[0] : value
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(callback && ts.isArrowFunction(callback), `${file}: missing production callback ${name}`)
  const compiled = ts.transpileModule(`export function bind(deps) {
    const { ${Object.keys(dependencies).join(', ')} } = deps;
    const ${name} = ${callback.getText(ast)};
    return ${name};
  }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
  return module.bind(dependencies)
}

const bundle = await build({ entryPoints: ['src/utils/practiceRoutines.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { createRoutine, createStep } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const draft = createRoutine('Rehearsal', [createStep({ title: 'Piece', minutes: 120 })], 'trumpet')

for (const [file, name, busyKey, busySetter, librarySetter] of [
  ['src/components/GuidedRoutineBuilder.tsx', 'saveDraft', 'savingRef', 'setSaving', 'setLibrary'],
  ['src/components/MusicRoutineBuilder.tsx', 'save', 'busyRef', 'setBusy', 'setExerciseLibrary'],
]) {
  const events = []
  const busy = { current: false }
  let release
  let launches = 0
  let stored = 0
  let storageFails = false
  let rollbackFails = false
  class RoutineLibraryRecoveryError extends Error {}
  let allowSave = true
  let resume
  let launch = () => new Promise((resolve, reject) => { release = { resolve, reject } })
  const save = await bindCallback(file, name, {
    draft, createStep, routine: null, props: { onSaveAndStart: next => start(next), onSave: () => events.push('saved') },
    instrumentName: 'Trumpet', instrument: 'trumpet', pendingSetup: [], missingMusic: [],
    canSaveRoutine: (_next, action) => { resume = action; return allowSave },
    requirePlus: () => assert.fail('Free no-score routine must not request music or hands-free access'),
    [busyKey]: busy, [busySetter]: value => events.push(['busy', value]),
    alive: { current: true }, setError: value => events.push(['error', value]),
    setDraft: next => events.push(['draft', next]), [librarySetter]: () => {},
    loadRoutineLibrary: () => [draft], loadExerciseLibrary: () => [],
    RoutineLibraryRecoveryError,
    storeLibraryRoutineWithExercises: () => {
      if (rollbackFails) throw new RoutineLibraryRecoveryError('Previous library data could not be restored. Your draft is still here.')
      if (storageFails) throw new Error('Storage full')
      stored++
    },
    storeLibraryExercise: () => {}, openItemSetup: () => assert.fail('Unexpected setup'), setExpanded: () => {},
    onSaveAndStart: next => start(next), onSave: () => events.push('saved'),
  })
  function start(next) { launches++; assert.equal(next.steps[0].minutes, 120); return launch() }
  const first = save(true)
  assert.equal(busy.current, true, `${name}: busy state covers asynchronous launch`)
  await save(true)
  assert.equal(launches, 1, `${name}: double tap starts once`)
  release.reject(new Error('Media unavailable'))
  await first
  assert.equal(busy.current, false)
  assert.ok(events.some(([kind, message] = []) => kind === 'error' && /draft is still here/.test(message)), `${name}: rejection reaches visible recovery error`)
  assert.equal(events.find(([kind] = []) => kind === 'draft')[1].id, draft.id, `${name}: draft identity survives rejection`)
  assert.equal(stored, 1, `${name}: routine stays saved after launch failure`)

  launch = async () => {}
  await save(true)
  assert.equal(launches, 2, `${name}: retry launches successfully`)
  assert.equal(busy.current, false)
  storageFails = true
  await save(true)
  assert.equal(launches, 2, `${name}: storage failure prevents launch`)
  assert.equal(busy.current, false)
  storageFails = false
  rollbackFails = true
  await save(true)
  assert.equal(launches, 2, `${name}: failed rollback prevents launch`)
  assert.ok(events.some(([kind, message] = []) => kind === 'error' && /could not be restored/.test(message)), `${name}: recovery failure remains visible instead of being replaced by a generic error`)
  rollbackFails = false
  allowSave = false
  await save(true)
  assert.equal(launches, 2, `${name}: cancelling paywall cannot launch`)
  assert.equal(busy.current, false)
  allowSave = true
  await resume()
  // Resume intentionally returns void, so allow its asynchronous callback to settle.
  await Promise.resolve()
  assert.equal(launches, 3, `${name}: unlock resumes the requested launch`)
  assert.equal(busy.current, false)

  for (const feature of ['music', 'handsfree']) {
    let entitled = false
    let unlockResume
    let savedPaid = 0
    let startedPaid = 0
    const paidBusy = { current: false }
    const paidDraft = { ...draft, steps: [{ ...draft.steps[0], desk: { showMusic: feature === 'music', autoSoundRecording: feature === 'handsfree' } }] }
    const startPaid = async () => { startedPaid++ }
    const savePaid = await bindCallback(file, name, {
      draft: paidDraft, createStep, routine: null, props: { onSaveAndStart: startPaid, onSave: () => {} },
      instrumentName: 'Trumpet', instrument: 'trumpet', pendingSetup: [], missingMusic: [],
      canSaveRoutine: () => true,
      requirePlus: (requested, action) => { assert.equal(requested, feature); unlockResume = action; return entitled },
      [busyKey]: paidBusy, [busySetter]: () => {}, alive: { current: true },
      setError: () => {}, setDraft: () => {}, [librarySetter]: () => {},
      loadRoutineLibrary: () => [], loadExerciseLibrary: () => [], RoutineLibraryRecoveryError,
      storeLibraryRoutineWithExercises: () => { savedPaid++ },
      onSaveAndStart: startPaid, onSave: () => {}, openItemSetup: () => {}, setExpanded: () => {},
    })
    const before = JSON.stringify(paidDraft)
    await savePaid(true)
    assert.equal(savedPaid, 0, `${name}: expired ${feature} access cannot save/start as a downgraded routine`)
    assert.equal(startedPaid, 0)
    assert.equal(paidBusy.current, false)
    assert.equal(JSON.stringify(paidDraft), before, `${name}: cancel unlock preserves paid setup and draft`)
    entitled = true
    unlockResume()
    await Promise.resolve(); await Promise.resolve()
    assert.equal(savedPaid, 1)
    assert.equal(startedPaid, 1, `${name}: unlocking resumes the original paid launch`)
    entitled = false
    await savePaid(false)
    assert.equal(savedPaid, 2, `${name}: existing paid draft can still be saved for later without launching`)
    assert.equal(startedPaid, 1)
  }
}

let launched = false
const closeEvents = []
const appStart = await bindCallback('src/App.tsx', 'handleSaveAndStartRoutine', {
  commitSavedRoutine: () => true, setIncomingRoutine: () => {}, routineRef: { current: draft },
  routineDayRef: { current: null }, routineResumeStep: () => draft.steps[0],
  handleStartRoutineStep: async () => { if (!launched) throw new Error('Media unavailable') },
  setRoutineBuilderDraft: () => {}, setRoutineBuilderRequest: value => closeEvents.push(value),
})
await assert.rejects(appStart(draft), /Media unavailable/)
assert.deepEqual(closeEvents, [], 'App preserves the builder on failed launch')
launched = true
await appStart(draft)
assert.deepEqual(closeEvents, [null], 'App closes after successful launch')

let repairOpened = false
const openMissing = await bindCallback('src/App.tsx', 'openRoutineStep', {
  setActiveMusicSetlist: () => {}, routineRef: { current: { ...draft, steps: [{ ...draft.steps[0], projectId: 'missing', desk: { showMusic: true } }] } },
  routineDayRef: { current: null }, todayKey: () => 'today', requirePlus: () => true,
  canUsePlus: () => true, hasPracticeChart: () => false,
  handleOpenRoutineBuilder: mode => { repairOpened = mode === 'edit' }, setTakeDeleteError: () => {},
})
await assert.rejects(openMissing(draft.steps[0].id), /Import Piece/)
assert.equal(repairOpened, true, 'Missing score opens repair and cannot report a successful launch')

let hasAccess = false
let retryPaid
let requestedFeature
let accessRepair = false
const accessErrors = []
const openPaid = await bindCallback('src/App.tsx', 'openRoutineStep', {
  setActiveMusicSetlist: () => {}, routineRef: { current: { ...draft, steps: [{ ...draft.steps[0], projectId: 'missing', desk: { showMusic: true } }] } },
  routineDayRef: { current: null }, todayKey: () => 'today',
  requirePlus: (feature, retry) => { requestedFeature = feature; retryPaid = retry; return hasAccess },
  canUsePlus: () => hasAccess, hasPracticeChart: () => false,
  handleOpenRoutineBuilder: () => { accessRepair = true }, setTakeDeleteError: value => accessErrors.push(value),
  runPracticeTransition: async (_key, work) => work(),
})
await assert.rejects(openPaid(draft.steps[0].id), /Unlock Plus.*music/)
assert.equal(requestedFeature, 'music')
assert.equal(accessRepair, false, 'Inactive access is blocked before room changes or missing-file repair')
hasAccess = true
retryPaid()
await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
assert.equal(accessRepair, true, 'Home paywall retry runs the original step and reaches score repair after unlock')
assert.ok(accessErrors.some(message => /Import Piece/.test(message)))

for (const remembered of [false, true]) {
  const openHandsFree = await bindCallback('src/App.tsx', 'openRoutineStep', {
    setActiveMusicSetlist: () => {}, routineRef: { current: { ...draft, steps: [{ ...draft.steps[0], desk: remembered ? null : { autoSoundRecording: true } }] } },
    routineDayRef: { current: remembered ? { routineId: draft.id, date: 'today', desksByStep: { [draft.steps[0].id]: { autoSoundRecording: true } } } : null },
    todayKey: () => 'today', requirePlus: feature => { assert.equal(feature, 'handsfree'); return false },
  })
  await assert.rejects(openHandsFree(draft.steps[0].id), /Unlock Plus.*hands-free/, 'Both routine and remembered paid desk setups require explicit unlock')
}

const openFree = await bindCallback('src/App.tsx', 'openRoutineStep', {
  setActiveMusicSetlist: () => {}, routineRef: { current: draft }, routineDayRef: { current: null }, todayKey: () => 'today',
  requirePlus: () => assert.fail('Central free step cannot be paywalled'), canUsePlus: () => false,
  recordingModeRef: { get current() { throw new Error('Reached free launch path') } },
})
await assert.rejects(openFree(draft.steps[0].id), /Reached free launch path/)

const homeErrors = []
const continueHome = await bindCallback('src/components/PracticeHub.tsx', 'startRoutineStep', {
  startingRoutineStepId: null, setStartingRoutineStepId: () => {}, setLaunchError: message => homeErrors.push(message),
  onStartRoutineStep: async () => { throw new Error('Unlock Plus to use this item’s music. Your routine is still saved.') },
})
await continueHome(draft.steps[0].id)
assert.ok(homeErrors.some(message => /Unlock Plus/.test(message)), 'Today continuation shows the access explanation instead of a generic failure')

const hubBusy = { current: false }
let hubAttempt = 0
const hubStart = await bindCallback('src/components/PracticeHub.tsx', 'saveAndStartRoutine', {
  startingSavedRoutineRef: hubBusy, setLaunchError: () => {},
  onSaveAndStartRoutine: async () => { if (!hubAttempt++) throw new Error('Media unavailable') },
})
await assert.rejects(hubStart(draft), /Media unavailable/)
assert.equal(hubBusy.current, false)
await hubStart(draft)
assert.equal(hubBusy.current, false, 'Hub propagates failure and permits retry')

console.log('PASS: builder recovery/double taps/storage failure; music and hands-free access gates/resume; free routines remain free; App success-only close; score repair; Today access explanation')

// Exercise the actual selection handler: global library order, hidden selections,
// stale IDs, the routine limit, cancellation at the access gate, and retry.
const selectionEvents = []
let selectionError = ''
let selectionAllowed = true
let selectionRetry
let handoffFails = false
const selection = ['b', 'gone', 'a']
const selectionMusic = [{ id: 'a' }, { id: 'b' }]
const selectionWorking = { current: false }
// The component derives this from the tapped order; keep it in step with `selection`.
const selectedMusic = []
const syncSelected = () => selectedMusic.splice(0, selectedMusic.length, ...selection.map(id => selectionMusic.find(item => item.id === id)).filter(Boolean))
syncSelected()
const createSelected = await bindCallback('src/components/MusicLibrary.tsx', 'createSelectedRoutine', {
  working: selectionWorking, disabled: false, music: selectionMusic, selectedIds: selection, selectedMusic,
  MAX_ROUTINE_STEPS: 12, setError: value => { selectionError = value },
  requirePlus: (_feature, retry) => { selectionRetry = retry; return selectionAllowed },
  scoreStep: item => ({ projectId: item.id, title: item.id, desk: { marker: item.id } }),
  onCreateRoutine: steps => { if (handoffFails) throw new Error('Switching'); selectionEvents.push(steps) },
})
createSelected()
assert.deepEqual(selectionEvents[0].map(step => step.projectId), ['b', 'a'], 'Uses the order the scores were tapped in; includes retained filtered selections; ignores stale IDs')
assert.deepEqual(selection, ['b', 'gone', 'a'], 'Handoff retains selection for cancellation')
selectionAllowed = false
createSelected()
assert.equal(selectionEvents.length, 1, 'Cancelled access gate does not open a draft')
selectionAllowed = true
selectionRetry()
assert.equal(selectionEvents.length, 2, 'Unlock retries the selected scores')
handoffFails = true
createSelected()
assert.equal(selectionError, 'Switching', 'Blocked handoff produces a visible recoverable error')
handoffFails = false
selectionWorking.current = true
createSelected()
assert.equal(selectionEvents.length, 2, 'Busy library does not open a draft')
selectionWorking.current = false
for (let i = 0; i < 13; i++) { const id = `limit-${i}`; selectionMusic.push({ id }); selection.push(id) }
syncSelected()
createSelected()
assert.match(selectionError, /up to 12/)
assert.equal(selectionEvents.length, 2, 'Over-limit selection never silently drops scores')
selection.length = 0
createSelected()
assert.equal(selectionEvents.length, 2, 'Empty selection does not open a routine')
console.log('PASS: library-selected routine order, retained selection, stale IDs, Plus cancellation/retry, busy/failure recovery and explicit size limit')

const handoffEvents = []
const handoffBusy = { current: false }
const transitionBusy = { current: { busy: false } }
let overlayAllowed = true
const handoff = await bindCallback('src/App.tsx', 'handleCreateRoutineFromMusic', {
  captureBusyRef: handoffBusy, practiceTransition: transitionBusy, isRecording: false, isStopping: false,
  canOpenOverlaySheet: () => overlayAllowed, isExperimentalOpen: false, createRoutine, MAX_ROUTINE_STEPS: 12,
  preferredInstrumentId: 'trumpet', handleOpenPracticeHome: () => handoffEvents.push('home'),
  setIncomingRoutine: () => {}, setRoutineBuilderDraft: next => handoffEvents.push(next),
  setRoutineBuilderRequest: mode => handoffEvents.push(mode),
})
handoff(draft.steps)
assert.equal(handoffEvents[1].instrumentId, 'trumpet')
assert.notEqual(handoffEvents[1].id, draft.id, 'New library draft has independent routine identity')
assert.equal(handoffEvents[2], 'build')
handoffBusy.current = true
assert.throws(() => handoff(draft.steps), /still switching/)
handoffBusy.current = false
overlayAllowed = false
assert.throws(() => handoff(draft.steps), /still switching/)
overlayAllowed = true
assert.throws(() => handoff([]), /Choose 1 to 12/)
assert.equal(handoffEvents.length, 3, 'Blocked/invalid handoffs never replace or reopen the draft')
console.log('PASS: App creates an independent draft and blocks unavailable handoffs before mutation')

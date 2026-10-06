import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire('/Users/jameslobb/Documents/BestTake/package.json')
const ts = require('typescript')
const { build } = require('esbuild')
const root = '/Users/jameslobb/Documents/BestTake'
const source = await readFile(root + '/src/App.tsx', 'utf8')
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
async function compileFunction(callback, dependencies) {
  const text = ts.transpileModule(`export const bind = deps => { const { ${Object.keys(dependencies).join(', ')} } = deps; return (${callback.getText(ast)}); }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  const module = await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`)
  return module.bind(dependencies)
}
async function bindCallback(name, dependencies) {
  let callback
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) {
      const value = node.initializer
      callback = ts.isCallExpression(value) ? value.arguments[0] : value
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(callback && ts.isArrowFunction(callback), `Production callback missing: ${name}`)
  return compileFunction(callback, dependencies)
}
let moduleSequence = 0
async function load(entry, plugins = []) {
  const bundle = await build({ absWorkingDir: root, entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', plugins })
  const code = bundle.outputFiles[0].text + `\nexport const auditInstance = ${++moduleSequence};`
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}
const routines = await load('src/utils/practiceRoutines.ts')
const { createRoutine, createStep, freshRoutineDay, holdRoutineDay, resumeRoutineDay, startRoutineDayStep, checkpointRoutineDay, pauseRoutineDay } = routines
const routine = createRoutine('Daily routine', [createStep({title: 'Scales', minutes: 5})], 'trumpet')
const stepId = routine.steps[0].id
const createDay = () => startRoutineDayStep(freshRoutineDay(routine.id), stepId, 'sitting', 1000)
const previousDateNow = Date.now
try {
  const refs = { day: { current: createDay() }, focus: { current: {routineId: routine.id, stepId} }, session: { current: 'sitting' } }
  const noop = () => {}
  let practiceHub = false
  const setIsPracticeHubOpen = value => {practiceHub = value}
  const commitRoutineDay = value => { refs.day.current = value }
  const dismiss = await bindCallback('dismissPracticeHub', { markOverlayClosed: noop, setIsPracticeHubOpen, routineDayRef: refs.day, commitRoutineDay, resumeRoutineDay })
  const home = await bindCallback('handleOpenPracticeHome', {
    isRecording:false, isStopping:false, canOpenOverlaySheet:()=>true, isExperimentalOpen:false,
    routineDayRef:refs.day, commitRoutineDay, holdRoutineDay, liveDeskSnapshotRef:{current:null}, pauseRoutineProgram:noop,
    sharedMetronomeEngine:{stop:noop}, applyDroneFromDesk:noop, setShowPitch:noop, setQuickSettingsOpen:noop,
    setIsVaultOpen:noop, setIsSettingsOpen:noop, restoreRoutineAfterChallenge:noop, setIsPracticeHubOpen, deferHudMediaPause:noop,
  })
  const quick = await bindCallback('handleOpenQuickPractice', {
    practiceTransition:{current:{busy:false}}, captureBusyRef:{current:false}, triggerLightHaptic:noop,
    settings:{hapticFeedback:false}, handleAutoSoundRecordingChange:noop, exitRoutineProgram:noop,
    focusedPracticeSessionIdRef:refs.session, endPracticeSession:async()=>{}, setTakeDeleteError:noop,
    focusedPracticeRef:{current:{}}, focusedRoutineContextRef:refs.focus, setFocusedPractice:noop,
    setFocusedReferenceTakeId:noop, setFocusedPracticeSessionId:noop, focusedPreviousChallengerRef:{current:null},
    setMusicPageVisible:noop, setLabsRoute:noop, handleAudioPracticeTabChange:noop, handleRecordingModeChange:noop,
    dismissPracticeHub:dismiss,
  })
  const pause = await bindCallback('handlePauseRoutine', {
    practiceTransition:{current:{busy:false}}, captureBusyRef:{current:false}, routineDayRef:refs.day,
    triggerLightHaptic:noop, settings:{hapticFeedback:false}, commitRoutineDay, pauseRoutineDay,
    liveDeskSnapshotRef:{current:null}, pauseRoutineProgram:noop, sharedMetronomeEngine:{stop:noop},
    applyDroneFromDesk:noop, deferHudMediaPause:noop,
  })
  Date.now = () => 31000
  home()
  assert.equal(practiceHub, true)
  assert.equal(refs.day.current.activeStepStartedAt, null)
  assert.equal(refs.day.current.elapsedMsByStep[stepId], 30000)
  Date.now = () => 36000
  pause() // Actual JSX caller at App.tsx:6498 pauses before opening Quick Record.
  quick()
  assert.equal(practiceHub, false)
  assert.equal(refs.focus.current, null)
  assert.equal(refs.day.current.activeStepId, null, 'Actual UI wrapper pauses the routine before leaving its context')
  assert.equal(refs.day.current.activeStepStartedAt, null)
  commitRoutineDay(checkpointRoutineDay(refs.day.current, 96000))
  assert.equal(refs.day.current.elapsedMsByStep[stepId], 30000, 'Actual UI wrapper prevents Quick Record accruing routine time')
  console.log(JSON.stringify({probe:'Home → Quick Record including actual JSX pause wrapper', result:'PASS; CANDIDATE REJECTED', focusContext:refs.focus.current, activeStepId:refs.day.current.activeStepId, elapsedBeforeQuickMs:30000, elapsedAfterQuickMinuteMs:refs.day.current.elapsedMsByStep[stepId]}))

  let effect
  function findEffect(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('checkpointRoutineDay(day, Date.now(), liveDeskSnapshotRef.current)') && node.arguments[0]?.getText(ast).includes('const suspend')) effect = node.arguments[0]
    ts.forEachChild(node, findEffect)
  }
  findEffect(ast)
  assert.ok(effect, 'Routine background production effect missing')
  const nativeDay = {current:createDay()}
  const nativeWindow = new EventTarget()
  let checkpoint
  nativeWindow.setInterval = callback => {checkpoint=callback; return 1}
  nativeWindow.clearInterval = noop
  const nativeDocument = new EventTarget()
  nativeDocument.visibilityState='visible'
  let programsPaused=0
  const bindEffect = await compileFunction(effect, {
    routineDayRef:nativeDay, commitRoutineDay:value=>nativeDay.current=value, checkpointRoutineDay,
    liveDeskSnapshotRef:{current:null}, pauseRoutineDay, pauseRoutineProgram:()=>programsPaused++,
    Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'ios'}, sharedMetronomeEngine:{stop:noop},
    applyDroneFromDesk:noop,setIsPracticeHubOpen:noop,
    window:nativeWindow,document:nativeDocument,APP_BACKGROUND_SUSPEND_EVENT:'sessionmirror:app-background-suspend',
  })
  const cleanup = bindEffect()
  Date.now=()=>11000
  nativeWindow.dispatchEvent(new CustomEvent('sessionmirror:app-background-suspend',{detail:{reason:'capacitor-pause'}}))
  assert.equal(nativeDay.current.activeStepId,stepId)
  assert.equal(programsPaused,0)
  nativeDocument.visibilityState='hidden'
  nativeDocument.dispatchEvent(new Event('visibilitychange'))
  assert.equal(nativeDay.current.activeStepId,stepId,'Defect: native visibility change never retries the dropped background event')
  Date.now=()=>611000
  checkpoint()
  assert.equal(nativeDay.current.elapsedMsByStep[stepId],610000)
  cleanup()
  console.log(JSON.stringify({probe:'Native pause before hidden visibility',result:'VERIFIED CONDITIONAL DEFECT', activeStepId:nativeDay.current.activeStepId, programsPaused, backgroundIntervalCountedMs:600000, nativeDeviceTiming:'UNTESTED'}))
} finally { Date.now=previousDateNow }

const mocks = {name:'browser-boundaries',setup(builder){
  builder.onResolve({filter:/^@capacitor\/(core|filesystem)$/},args=>({path:args.path,namespace:'mock'}))
  builder.onResolve({filter:/\.\/(filesystemInit|takeStorage)$/},args=>({path:args.path,namespace:'mock'}))
  builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:
    args.path==='@capacitor/core' ? 'export const Capacitor={isNativePlatform:()=>false};' :
    args.path==='@capacitor/filesystem' ? 'export const Directory={Data:"DATA"}; export const Filesystem={};' :
    args.path.endsWith('filesystemInit') ? 'export const LIBRARY_DIR="library";export const initAppFilesystem=async()=>{};export const nativeDataFileExists=async()=>false;' :
    'export const applyStrictPlaybackSrc=x=>x;export const deleteTakeFile=async()=>{};export const normalizeBlobMime=x=>x;export const NATIVE_AUDIO_MIME="audio/mp4";'
  }))
}}
const firstSession=await load('src/utils/libraryStorage.ts',[mocks])
const saved=await firstSession.persistLibraryAudio(new Blob(['audio fixture'],{type:'audio/wav'}),'reference-id','audio/wav')
assert.equal(await firstSession.resolveLibraryPlaybackUrl(saved.filePath,''),saved.playbackUrl)
const freshSession=await load('src/utils/libraryStorage.ts',[mocks])
const restored=await freshSession.resolveLibraryPlaybackUrl(saved.filePath,'')
assert.equal(restored,'','Defect: persisted library audio path has no playback URL after module reload')
console.log(JSON.stringify({probe:'Web imported reference audio reload',result:'VERIFIED DEFECT',filePath:saved.filePath,initialPlaybackURLExists:Boolean(saved.playbackUrl),restoredPlaybackURL:restored,nativeFilesystem:'NOT EXERCISED'}))

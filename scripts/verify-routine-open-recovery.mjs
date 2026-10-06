import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(new URL('../package.json', import.meta.url))
const { build } = require('esbuild')
const flush = () => new Promise(resolve => setImmediate(resolve))
let fixtureId = 0

const boundaries = {
  name: 'native-routine-open-boundaries',
  setup(builder) {
    builder.onResolve({ filter: /^@capacitor\/(app|core|filesystem)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onResolve({ filter: /context\/ActionSheetContext$|(?:^|\/)routineFile$|(?:^|\/)timelineStorage$|utils\/practiceRoutineShare$|utils\/routineLink$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
      const prefix = 'const state = globalThis.__routineOpenRecovery;'
      const modules = {
        '@capacitor/app': `${prefix} export const App = { addListener: async (_event, listener) => { state.listeners.push(listener) }, getLaunchUrl: async () => state.launchUrl ? { url: state.launchUrl } : null };`,
        '@capacitor/core': 'export const Capacitor = { isNativePlatform: () => true };',
        '@capacitor/filesystem': `${prefix} export const Encoding = { UTF8: 'utf8' }; export const Filesystem = { readFile: async ({path}) => { state.reads.push(path); if (state.readFails) throw new Error('temporary read failure'); return {data: 'valid routine'} }, deleteFile: async ({path}) => { state.deleted.push(path) } };`,
      }
      let contents = modules[args.path]
      if (contents === undefined) {
        if (args.path.endsWith('ActionSheetContext')) contents = `${prefix} export const canShowAlertOutsideTree = () => true; export const showAlertOutsideTree = options => state.alerts.push(options);`
        else if (args.path.endsWith('routineFile')) contents = "export const isRoutineFileName = name => name.endsWith('.btroutine');"
        else if (args.path.endsWith('timelineStorage')) contents = `${prefix} export const importRoutineFromText = () => { state.programCalls++; if (state.programThrows) throw new Error('temporary program storage failure'); return state.programFails ? {ok: false, error: 'Could not save program. Try again.'} : {ok: true, routine: {id: 'program', name: 'Tempo study'}, warnings: []} };`
        else if (args.path.endsWith('practiceRoutineShare')) contents = `${prefix} export const isPracticePlanFileName = name => name.endsWith('.btplan'); export const importPracticePlanFileFromText = async () => { state.planCalls++; if (state.planThrows) throw new Error('temporary plan storage failure'); return state.planFails ? {ok: false, error: 'Check available storage and try again.'} : {ok: true, routine: {id: 'received', name: 'Scales', steps: []}} };`
        else contents = `${prefix} export const ROUTINE_APP_LINK_PREFIX = 'besttake://routine'; export const decodeRoutineLink = async () => { state.decodeCalls++; if (state.decodeGate) await state.decodeGate; if (state.decodeThrows) throw new Error('temporary decode failure'); return state.decodeFails ? null : 'valid routine' };`
      }
      return { contents }
    })
  },
}
const bundled = await build({ absWorkingDir: projectRoot, entryPoints: ['src/practiceTimeline/storage/routineFileOpen.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [boundaries] })

async function fixture(overrides = {}) {
  const state = {
    listeners: [], alerts: [], reads: [], deleted: [], decodeCalls: 0,
    planCalls: 0, programCalls: 0, ...overrides,
  }
  globalThis.__routineOpenRecovery = state
  globalThis.window = { setTimeout: () => 0 }
  const code = `${bundled.outputFiles[0].text}\n// fixture ${++fixtureId}`
  const router = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  const initialized = router.initializeRoutineFileOpen()
  if (state.launchUrl && state.decodeGate) await flush()
  else await initialized
  await router.initializeRoutineFileOpen()
  assert.equal(state.listeners.length, 1, 'initializer registers only one listener')
  const open = async url => { state.listeners[0]({url}); await flush() }
  return {state, router, open, initialized}
}
const link = 'besttake://routine#same-teacher-link'
const originalWarn = console.warn
const warnings = []
console.warn = (...args) => warnings.push(args)
{
  const {state, router, open} = await fixture({planFails: true})
  await open(link)
  assert.equal(state.planCalls, 1)
  assert.equal(router.getPendingPracticePlanOpen(), null)
  assert.match(state.alerts[0].message, /try again/)
  state.planFails = false
  await open(link)
  assert.equal(state.planCalls, 2, 'same failed URL must retry after storage recovers')
  assert.equal(router.getPendingPracticePlanOpen()?.id, 'received')
  await open(link)
  assert.equal(state.planCalls, 2, 'successful URL remains deduplicated')
  assert.equal(state.alerts.filter(alert => alert.tone === 'success').length, 1)
}
for (const failure of ['decodeFails', 'decodeThrows', 'planThrows']) {
  const {state, router, open} = await fixture({[failure]: true})
  await open(link)
  assert.equal(router.getPendingPracticePlanOpen(), null)
  state[failure] = false
  await open(link)
  assert.equal(state.decodeCalls, 2, `${failure} releases the failed identity`)
  assert.equal(router.getPendingPracticePlanOpen()?.id, 'received')
}
{
  let release
  const decodeGate = new Promise(resolve => { release = resolve })
  const {state, router, open, initialized} = await fixture({decodeGate, launchUrl: link})
  // The cold launch is still decoding when its warm listener receives the same URL.
  await open(link)
  assert.equal(state.decodeCalls, 1, 'concurrent cold/warm delivery must decode once')
  assert.equal(state.planCalls, 0)
  release()
  await initialized
  await flush()
  assert.equal(state.planCalls, 1)
  assert.equal(router.getPendingPracticePlanOpen()?.id, 'received')
  await open(link)
  assert.equal(state.planCalls, 1)
}
for (const failure of ['readFails', 'planFails', 'planThrows']) {
  const {state, router, open} = await fixture({[failure]: true})
  const url = 'file:///Documents/Inbox/lesson.btplan'
  await open(url)
  assert.equal(router.getPendingPracticePlanOpen(), null)
  assert.deepEqual(state.deleted, [], 'failed import keeps Inbox file available for retry')
  state[failure] = false
  await open(url)
  assert.equal(router.getPendingPracticePlanOpen()?.id, 'received')
  assert.deepEqual(state.deleted, [url], 'successful import cleans Inbox exactly once')
  const count = state.planCalls
  await open(url)
  assert.equal(state.planCalls, count)
  assert.deepEqual(state.deleted, [url])
}
for (const failure of ['readFails', 'programFails', 'programThrows']) {
  const {state, router, open} = await fixture({[failure]: true})
  const url = 'file:///Documents/Inbox/tempo.btroutine'
  await open(url)
  assert.equal(router.getPendingRoutineOpen()?.status, 'failed')
  assert.deepEqual(state.deleted, [])
  state[failure] = false
  await open(url)
  assert.equal(router.getPendingRoutineOpen()?.status, 'imported')
  assert.deepEqual(state.deleted, [url])
  const count = state.programCalls
  await open(url)
  assert.equal(state.programCalls, count)
}
{
  const {state, open} = await fixture()
  await open('file:///Documents/Inbox/photo.jpg')
  await open('https://example.com/lesson.btplan')
  await open('')
  assert.equal(state.alerts.length, 0)
  assert.equal(state.reads.length, 0)
  assert.equal(state.planCalls, 0)
}
console.warn = originalWarn
console.log('PASS routine-open recovery: same-link failure/retry, malformed/throw recovery, cold/warm concurrency, successful dedupe, plan/program Inbox preservation and cleanup, unrelated URLs.')

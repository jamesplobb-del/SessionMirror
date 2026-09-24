import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = await mkdtemp(join(tmpdir(), 'music-share-'))
const storage = new Map()
const charts = new Map()
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
globalThis.__musicShareCharts = charts
const mockPlugin = { name: 'music-share-mocks', setup(build) {
  build.onResolve({ filter: /practiceChartStorage$/ }, () => ({ path: 'practiceChartStorage', namespace: 'music-share-mock' }))
  build.onLoad({ filter: /.*/, namespace: 'music-share-mock' }, () => ({ contents: `
    export function hasPracticeChart(id){return globalThis.__musicShareCharts.has(id)}
    export function practiceChartName(id){return globalThis.__musicShareCharts.get(id)?.fileName??null}
  `, loader: 'js' }))
} }

try {
  await build({ stdin: { contents: `export * from './src/utils/practiceRoutineShare'; export * from './src/utils/practiceRoutines'; export * from './src/utils/routineLibrary';`, resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'test.mjs'), plugins: [mockPlugin] })
  const m = await import(pathToFileURL(join(dir, 'test.mjs')))
  const senderId = 'sender-score'
  charts.set(senderId, { fileName: 'Clarke Studies.pdf' })
  const routine = m.createRoutine('Studies', [m.createStep({ title: 'Clarke at 100', kind: 'record', projectId: senderId, desk: { ...m.blankDesk('audio'), showMusic: true } })], null)
  const layout = m.buildPracticePlanFile(routine)
  assert.equal(JSON.parse(layout).scores, undefined)
  assert.equal(JSON.parse(layout).routine.steps[0].sharedScoreName, 'Clarke Studies.pdf')
  const imported = await m.importPracticePlanFileFromText(layout)
  assert.equal(imported.ok, true)
  assert.equal(imported.routine.steps[0].projectId, null)
  assert.equal(imported.routine.steps[0].sharedScoreName, 'Clarke Studies.pdf')
  assert.equal(imported.routine.steps[0].title, 'Clarke at 100')
  assert.equal(imported.routine.steps[0].desk.showMusic, true)
  assert.equal(m.loadRoutineLibrary()[0].id, imported.routine.id)

  // Older files may carry score bytes. Keep the setup, but leave the music slot empty.
  const oldPackage = JSON.parse(layout)
  oldPackage.version = 2
  oldPackage.routine.steps[0].sharedScoreName = null
  oldPackage.scores = { [senderId]: { fileName: 'Clarke Studies.pdf', mimeType: 'application/pdf', data: 'JVBERi0xLjcK' } }
  const older = await m.importPracticePlanFileFromText(JSON.stringify(oldPackage))
  assert.equal(older.ok, true)
  assert.equal(older.routine.steps[0].projectId, null)
  assert.equal(older.routine.steps[0].sharedScoreName, 'Clarke Studies.pdf')
  assert.equal(charts.size, 1, 'Import must not create a local score')
  console.log('PASS: shared layouts omit score bytes; older packages import as music placeholders')
} finally { await rm(dir, { recursive: true, force: true }) }

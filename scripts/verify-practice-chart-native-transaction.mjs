// Native chart replacement commits a versioned file through its metadata pointer.
// Run: node scripts/verify-practice-chart-native-transaction.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const plugin = { name: 'native-chart-boundaries', setup(builder) {
  builder.onResolve({ filter: /^@capacitor\/(core|filesystem|share)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
  builder.onResolve({ filter: /\/(filesystemInit|webPracticeChartStorage|plusAccess)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents:
    args.path === '@capacitor/core' ? 'export const Capacitor={isNativePlatform:()=>true};' :
    args.path === '@capacitor/filesystem' ? 'export const Directory={Data:"DATA"};export const Filesystem=globalThis.__nativeChartFixture.filesystem;' :
    args.path === '@capacitor/share' ? 'export const Share={share:async options=>globalThis.__nativeChartFixture.shared.push(options)};' :
    args.path.endsWith('filesystemInit') ? 'export const CHARTS_DIR="charts";export const initAppFilesystem=async()=>{};export const isFilesystemMissingError=e=>e?.message==="missing";' :
    args.path.endsWith('plusAccess') ? 'export const requirePlus=()=>true;' :
    'export const loadWebPracticeChart=async()=>{throw Error("Unexpected web path")};export const saveWebPracticeChart=loadWebPracticeChart;export const deleteWebPracticeChart=loadWebPracticeChart;'
  }))
} }
const bundle = await build({ entryPoints: ['src/utils/practiceChartStorage.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [plugin] })
const encoded = Buffer.from(bundle.outputFiles[0].text).toString('base64')
const inkBundle = await build({ entryPoints: ['src/components/practiceChart/chartInk.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const ink = await import(`data:text/javascript;base64,${Buffer.from(inkBundle.outputFiles[0].text).toString('base64')}`)
let sequence = 0
const freshModule = () => import(`data:text/javascript;base64,${encoded}#native-${++sequence}`)
const id = 'part/section'
const key = `besttake:practice-chart:v1:${id}`
const legacyPath = `charts/${encodeURIComponent(id)}.pdf`
const oldBytes = '%PDF OLD_SCORE'
const newBytes = '%PDF NEW_SCORE'
const readText = chart => new TextDecoder().decode(chart.bytes)
const file = (bytes = newBytes, name = 'new-larger-orchestral-score.pdf', type = 'application/pdf') => new File([bytes], name, { type })
function fixture({ legacy = true } = {}) {
  const state = {
    storage: new Map(), disk: new Map(), writes: [], deletes: [], shared: [],
    failMetadata: false, quota: Infinity, partialWriteFailure: false, deleteReject: () => false, failInkClear: false,
  }
  if (legacy) {
    state.storage.set(key, JSON.stringify({ filePath: legacyPath, mimeType: 'application/pdf', fileName: 'old.pdf' }))
    state.disk.set(legacyPath, btoa(oldBytes))
  }
  state.filesystem = {
    writeFile: async ({ path, data }) => {
      state.writes.push(path)
      state.disk.set(path, state.partialWriteFailure ? data.slice(0, 4) : data)
      if (state.partialWriteFailure) throw Error('partial write failure')
    },
    readFile: async ({ path }) => {
      if (!state.disk.has(path)) throw Error('missing')
      return { data: state.disk.get(path) }
    },
    deleteFile: async ({ path }) => {
      state.deletes.push(path)
      if (state.deleteReject(path)) throw Error('cleanup failure')
      state.disk.delete(path)
    },
    getUri: async ({ path }) => ({ uri: `file:///${path}` }),
  }
  globalThis.__nativeChartFixture = state
  globalThis.localStorage = {
    getItem: storageKey => state.storage.get(storageKey) ?? null,
    setItem: (storageKey, value) => {
      const total = [...state.storage].reduce((n, [k, v]) => n + (k === storageKey ? 0 : k.length + v.length), 0) + storageKey.length + value.length
      if ((storageKey === key && state.failMetadata) || total > state.quota) throw Error('quota exceeded')
      state.storage.set(storageKey, value)
    },
    removeItem: storageKey => {
      if (state.failInkClear && storageKey === `besttake:practice-chart-ink:v1:${id}`) throw Error('ink clear failure')
      state.storage.delete(storageKey)
    },
  }
  globalThis.window = new EventTarget()
  return state
}

// Existing canonical metadata remains readable, and a quota failure preserves
// both the loaded score and the bytes a fresh launch will read.
for (const replacement of [file(), file('IMAGE_BYTES', 'new.png', 'image/png')]) {
  const state = fixture()
  const api = await freshModule()
  assert.equal(api.hasPracticeChart(id), true)
  assert.equal(readText(await api.loadPracticeChart(id)), oldBytes)
  const oldMetadata = state.storage.get(key)
  state.quota = [...state.storage].reduce((n, [k, v]) => n + k.length + v.length, 0)
  await assert.rejects(api.savePracticeChart(id, replacement), /quota/)
  assert.equal(state.storage.get(key), oldMetadata)
  assert.equal(readText(await api.loadPracticeChart(id)), oldBytes)
  assert.equal(api.practiceChartName(id), 'old.pdf')
  assert.equal(atob(state.disk.get(legacyPath)), oldBytes)
  assert.equal(state.disk.size, 1, 'Failed metadata commit cleans the staged replacement')
  assert.notEqual(state.writes[0], legacyPath, 'Neither MIME replaces the original bytes before commit')
  const cold = await freshModule()
  assert.equal(readText(await cold.loadPracticeChart(id)), oldBytes)
  assert.equal(cold.practiceChartName(id), 'old.pdf')
}

// A failed write may still leave partial bytes; they must be cleaned and never
// acquire a metadata pointer, for an existing score and a first import alike.
for (const legacy of [true, false]) {
  const state = fixture({ legacy })
  const api = await freshModule()
  state.partialWriteFailure = true
  await assert.rejects(api.savePracticeChart(id, file()), /partial write failure/)
  assert.equal(state.disk.size, legacy ? 1 : 0)
  assert.ok(state.deletes.includes(state.writes[0]), 'Partial staged bytes are cleaned')
  const cold = await freshModule()
  assert.equal(cold.hasPracticeChart(id), legacy)
  assert.equal(legacy ? readText(await cold.loadPracticeChart(id)) : await cold.loadPracticeChart(id), legacy ? oldBytes : null)
}

// If failed-stage cleanup itself rejects, the original error and committed
// score survive. Only an unreferenced staged file may remain.
{
  const state = fixture()
  const api = await freshModule()
  state.failMetadata = true
  state.deleteReject = path => path !== legacyPath
  await assert.rejects(api.savePracticeChart(id, file()), /quota exceeded/)
  assert.equal(atob(state.disk.get(legacyPath)), oldBytes)
  assert.equal(readText(await (await freshModule()).loadPracticeChart(id)), oldBytes)
  assert.equal(state.disk.size, 2)
}

// Old-file cleanup is optional after commit. Its rejection must not leave the
// cache or a fresh launch pointing at the old score or report a failed import.
{
  const state = fixture()
  const api = await freshModule()
  await api.loadPracticeChart(id)
  state.deleteReject = path => path === legacyPath
  const saved = await api.savePracticeChart(id, file())
  assert.match(saved.filePath, /^charts\/part%2Fsection\.v-[a-zA-Z0-9-]+\.pdf$/)
  assert.equal(readText(saved), newBytes)
  assert.equal(readText(await api.loadPracticeChart(id)), newBytes)
  const cold = await freshModule()
  assert.equal(readText(await cold.loadPracticeChart(id)), newBytes)
  assert.equal(cold.practiceChartName(id), file().name)
  assert.equal(JSON.parse(state.storage.get(key)).filePath, saved.filePath)
  await cold.exportPracticeChart(id)
  assert.deepEqual(state.shared.at(-1).files, [`file:///${saved.filePath}`])
  state.deleteReject = () => false
  await cold.deletePracticeChart(id)
  assert.equal(state.disk.has(saved.filePath), false)
  assert.equal((await freshModule()).hasPracticeChart(id), false)
}

// A read started before replacement may finish after the new score commits.
// It must not put old bytes back in the shared cache.
{
  const state = fixture()
  const api = await freshModule()
  const readFile = state.filesystem.readFile
  let finishOldRead
  state.filesystem.readFile = ({ path }) => path === legacyPath
    ? new Promise(resolve => { const data = state.disk.get(path); finishOldRead = () => resolve({ data }) })
    : readFile({ path })
  const pendingOld = api.loadPracticeChart(id)
  assert.equal(typeof finishOldRead, 'function')
  const committed = await api.savePracticeChart(id, file())
  finishOldRead()
  assert.equal(readText(await pendingOld), newBytes, 'Late old-file read resolves the currently committed replacement')
  assert.equal((await api.loadPracticeChart(id)).attachmentId, committed.attachmentId)
  assert.equal(readText(await api.loadPracticeChart(id)), newBytes, 'Late reads cannot overwrite the committed cache')
}

// Successful retries retire old canonical/versioned paths across MIME changes.
{
  const state = fixture()
  const api = await freshModule()
  state.failMetadata = true
  await assert.rejects(api.savePracticeChart(id, file()), /quota/)
  state.failMetadata = false
  const pdf = await api.savePracticeChart(id, file())
  assert.equal(state.disk.size, 1)
  assert.equal(state.disk.has(legacyPath), false)
  const image = await api.savePracticeChart(id, file('IMAGE_BYTES', 'new.png', 'image/png'))
  assert.notEqual(image.filePath, pdf.filePath)
  assert.equal(state.disk.size, 1)
  assert.equal(state.disk.has(pdf.filePath), false)
  const coldImage = await (await freshModule()).loadPracticeChart(id)
  assert.equal(coldImage.fileName, 'new.png')
  assert.equal(coldImage.mimeType, 'image/png')
  assert.ok(coldImage.objectUrl)
}

// Annotation ownership follows only a committed attachment. Failed optional
// clearing must never put a legacy or v2 old part's marks on a replacement.
for (const legacyInk of [true, false]) {
  const state = fixture()
  const api = await freshModule()
  const stroke = { page: 0, colour: 'red', width: 'fine', points: [0.1, 0.2, 0.4, 0.5] }
  const inkKey = `besttake:practice-chart-ink:v1:${id}`
  if (legacyInk) state.storage.set(inkKey, JSON.stringify([stroke]))
  else {
    const first = await api.savePracticeChart(id, file(oldBytes, 'same.pdf'))
    assert.ok(first.attachmentId)
    assert.equal(ink.saveInkStrokes(id, [stroke]), true)
    assert.equal(JSON.parse(state.storage.get(inkKey)).attachmentId, first.attachmentId)
  }
  assert.deepEqual(ink.loadInkStrokes(id), [stroke])
  const beforeInk = state.storage.get(inkKey)
  const beforeMetadata = state.storage.get(key)
  const previousAttachmentId = JSON.parse(beforeMetadata).attachmentId ?? null
  state.failMetadata = true
  await assert.rejects(api.savePracticeChart(id, file(newBytes, 'same.pdf')), /quota/)
  assert.equal(state.storage.get(key), beforeMetadata)
  assert.deepEqual(ink.loadInkStrokes(id), [stroke], 'Rejected replacement preserves old annotation ownership')
  state.failMetadata = false
  const replaced = await api.savePracticeChart(id, file(newBytes, 'same.pdf'))
  assert.ok(replaced.attachmentId)
  assert.equal(state.storage.get(inkKey), beforeInk)
  state.failInkClear = true
  assert.equal(ink.clearInkStrokes(id), false)
  assert.deepEqual(ink.loadInkStrokes(id), [], 'Old marks fail closed even when clearing rejects')
  const cold = await freshModule()
  assert.equal((await cold.loadPracticeChart(id)).attachmentId, replaced.attachmentId)
  assert.deepEqual(ink.loadInkStrokes(id), [])
  const newStroke = { ...stroke, colour: 'black' }
  assert.equal(ink.saveInkStrokes(id, [newStroke]), true)
  assert.equal(JSON.parse(state.storage.get(inkKey)).attachmentId, replaced.attachmentId)
  assert.deepEqual(ink.loadInkStrokes(id), [newStroke])
  assert.equal(ink.saveInkStrokes(id, [stroke], previousAttachmentId), false, 'Old-reader callbacks cannot rebind marks after replacement')
  assert.equal(ink.saveInkStrokes(id, [], previousAttachmentId), false, 'Old-reader Undo cannot clear new attachment marks')
  assert.deepEqual(ink.loadInkStrokes(id), [newStroke])
  assert.equal(ink.saveInkStrokes(id, [newStroke], replaced.attachmentId), true)
  await cold.deletePracticeChart(id)
  assert.deepEqual(ink.loadInkStrokes(id), [], 'Deleted attachment cannot regain its v2 marks')
  const reattached = await api.savePracticeChart(id, file())
  assert.notEqual(reattached.attachmentId, replaced.attachmentId)
  assert.deepEqual(ink.loadInkStrokes(id), [], 'A newly attached part never inherits leftover v2 marks')
}

// Versioned metadata cannot point at another project or leave the chart folder.
for (const filePath of ['charts/other.v-token.pdf', `charts/${encodeURIComponent(id)}.v-../outside.pdf`, `charts/${encodeURIComponent(id)}.v-token.png`]) {
  const state = fixture()
  state.storage.set(key, JSON.stringify({ filePath, mimeType: 'application/pdf', fileName: 'invalid.pdf' }))
  assert.equal((await freshModule()).hasPracticeChart(id), false)
}
console.log('PASS: native score metadata commit preserves legacy/cached/cold scores on quota and partial writes; failed cleanup preserves commit semantics; retry/MIME changes/export/delete/versioned path validation; legacy/v2 ink ownership survives failed replacement and rejects old marks after failed clear')

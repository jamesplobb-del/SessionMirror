// Expected to fail until browser Music scores survive a full page reload.
// Run: node scripts/practice-qa/regressions/music-web-reload.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const storage = new Map()
let failSetKey = null
let failRemoveKey = null
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => {
    if (key === failSetKey) throw new Error('Injected localStorage write failure')
    storage.set(key, value)
  },
  removeItem: key => {
    if (key === failRemoveKey) throw new Error('Injected localStorage removal failure')
    storage.delete(key)
  },
}
const chartRecords = new Map()
const stores = new Set()
let failNextWrite = false
globalThis.indexedDB = {
  open(name, version) {
    assert.equal(name, 'besttake-practice-charts')
    assert.equal(version, 1)
    const request = {}
    queueMicrotask(() => {
      const db = {
        objectStoreNames: { contains: store => stores.has(store) },
        createObjectStore(store) { stores.add(store) },
        close() {},
        transaction(store, mode = 'readonly') {
          assert.equal(store, 'charts')
          const tx = { error: null }
          const operations = []
          const shouldFail = mode === 'readwrite' && failNextWrite
          if (shouldFail) failNextWrite = false
          tx.objectStore = () => ({
            put: (value, key) => operations.push(['put', key, value]),
            delete: key => operations.push(['delete', key]),
            get(key) {
              const read = {}
              queueMicrotask(() => { read.result = chartRecords.get(key); read.onsuccess?.() })
              return read
            },
          })
          if (mode === 'readwrite') queueMicrotask(() => {
            if (shouldFail) {
              tx.error = new Error('Injected IndexedDB transaction failure')
              tx.onabort?.()
              return
            }
            for (const [operation, key, value] of operations) {
              if (operation === 'put') chartRecords.set(key, value)
              else chartRecords.delete(key)
            }
            tx.oncomplete?.()
          })
          return tx
        },
      }
      request.result = db
      request.onupgradeneeded?.()
      request.onsuccess?.()
    })
    return request
  },
}

const directory = await mkdtemp(join(tmpdir(), 'besttake-music-web-reload-'))
try {
  const firstPath = join(directory, 'chart-first.mjs')
  const reloadPath = join(directory, 'chart-after-reload.mjs')
  await build({
    entryPoints: ['src/utils/practiceChartStorage.ts'],
    outfile: firstPath, bundle: true, platform: 'node', format: 'esm',
    plugins: [{
      name: 'browser-storage-fixtures',
      setup(build) {
        build.onResolve({ filter: /\/plusAccess$/ }, () => ({ path: 'plus', namespace: 'fixture' }))
        build.onLoad({ filter: /^plus$/, namespace: 'fixture' }, () => ({
          contents: 'export const canUsePlus=()=>true, requirePlus=()=>true',
        }))
        build.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: 'capacitor-core', namespace: 'fixture' }))
        build.onLoad({ filter: /^capacitor-core$/, namespace: 'fixture' }, () => ({
          contents: 'export const Capacitor={isNativePlatform:()=>false}',
        }))
        build.onResolve({ filter: /^@capacitor\/share$/ }, () => ({ path: 'capacitor-share', namespace: 'fixture' }))
        build.onLoad({ filter: /^capacitor-share$/, namespace: 'fixture' }, () => ({ contents: 'export const Share={share:async()=>{}}' }))
        build.onResolve({ filter: /^@capacitor\/filesystem$/ }, () => ({ path: 'capacitor-filesystem', namespace: 'fixture' }))
        build.onLoad({ filter: /^capacitor-filesystem$/, namespace: 'fixture' }, () => ({ contents: 'export const Directory={Data:"DATA"}; export const Filesystem={}' }))
        build.onResolve({ filter: /^\.\/filesystemInit$/ }, () => ({ path: 'filesystem-init', namespace: 'fixture' }))
        build.onLoad({ filter: /^filesystem-init$/, namespace: 'fixture' }, () => ({ contents: 'export const CHARTS_DIR="practice-charts"; export const initAppFilesystem=async()=>{}; export const isFilesystemMissingError=()=>false' }))
      },
    }],
  })
  await copyFile(firstPath, reloadPath)
  const first = await import(pathToFileURL(firstPath))
  const projectId = 'qa-web-reload-score'
  const pdf = Object.assign(new Blob(['%PDF-1.4\nscore-one'], { type: 'application/pdf' }), { name: 'qa-score.pdf' })
  await first.savePracticeChart(projectId, pdf)
  assert.equal(first.hasPracticeChart(projectId), true, 'imported score is available before reload')
  assert.equal(first.practiceChartName(projectId), 'qa-score.pdf', 'availability metadata is synchronous')
  assert.equal(new TextDecoder().decode((await first.loadPracticeChart(projectId)).bytes), '%PDF-1.4\nscore-one')

  // A fresh module instance models a page reload: JS memory is gone, while
  // browser storage remains. No delete action is called at any point.
  const afterReload = await import(pathToFileURL(reloadPath))
  assert.equal(afterReload.hasPracticeChart(projectId), true,
    'imported browser score should still appear in Music after reload')
  assert.equal(new TextDecoder().decode((await afterReload.loadPracticeChart(projectId)).bytes), '%PDF-1.4\nscore-one',
    'reader should reopen original PDF bytes after reload')

  const imageId = 'qa-web-reload-image'
  const image = Object.assign(new Blob(['png-image-bytes'], { type: 'image/png' }), { name: 'score.png' })
  await afterReload.savePracticeChart(imageId, image)
  const imageChart = await afterReload.loadPracticeChart(imageId)
  assert.equal(await (await fetch(imageChart.objectUrl)).text(), 'png-image-bytes')
  await copyFile(reloadPath, join(directory, 'chart-image-after-reload.mjs'))
  const afterImageReload = await import(pathToFileURL(join(directory, 'chart-image-after-reload.mjs')))
  const restoredImage = await afterImageReload.loadPracticeChart(imageId)
  assert.equal(restoredImage.mimeType, 'image/png')
  assert.equal(await (await fetch(restoredImage.objectUrl)).text(), 'png-image-bytes', 'image bytes survive reload')

  const visiblePreferenceId = 'qa-web-visible-preference'
  const visiblePreferenceScore = Object.assign(new Blob(['visibility-test'], { type: 'image/webp' }), { name: 'visible.webp' })
  failSetKey = `besttake:practice-chart-visible:v1:${visiblePreferenceId}`
  await afterImageReload.savePracticeChart(visiblePreferenceId, visiblePreferenceScore)
  failSetKey = null
  await copyFile(reloadPath, join(directory, 'chart-after-visibility-quota.mjs'))
  const afterVisibilityQuota = await import(pathToFileURL(join(directory, 'chart-after-visibility-quota.mjs')))
  assert.equal(await (await fetch((await afterVisibilityQuota.loadPracticeChart(visiblePreferenceId)).objectUrl)).text(), 'visibility-test',
    'optional visibility preference failure must not report a durable import as failed')

  failNextWrite = true
  const replacement = Object.assign(new Blob(['%PDF-1.4\nreplacement'], { type: 'application/pdf' }), { name: 'replacement.pdf' })
  await assert.rejects(afterImageReload.savePracticeChart(projectId, replacement), /Injected IndexedDB transaction failure/)
  assert.equal(afterImageReload.practiceChartName(projectId), 'qa-score.pdf', 'failed transaction leaves old index intact')
  await copyFile(reloadPath, join(directory, 'chart-after-failed-replace.mjs'))
  const afterFailedReplace = await import(pathToFileURL(join(directory, 'chart-after-failed-replace.mjs')))
  assert.equal(new TextDecoder().decode((await afterFailedReplace.loadPracticeChart(projectId)).bytes), '%PDF-1.4\nscore-one',
    'failed replacement preserves old score bytes')

  const priorImageChart = await afterFailedReplace.loadPracticeChart(imageId)
  const oldImageUrl = priorImageChart.objectUrl
  const newImage = Object.assign(new Blob(['new-image'], { type: 'image/jpeg' }), { name: 'new-score.jpg' })
  await afterFailedReplace.savePracticeChart(imageId, newImage)
  await assert.rejects(fetch(oldImageUrl), 'replacement revokes the old image URL')
  await copyFile(reloadPath, join(directory, 'chart-after-replace.mjs'))
  const afterReplace = await import(pathToFileURL(join(directory, 'chart-after-replace.mjs')))
  assert.equal(afterReplace.practiceChartName(imageId), 'new-score.jpg')
  assert.equal(await (await fetch((await afterReplace.loadPracticeChart(imageId)).objectUrl)).text(), 'new-image')

  chartRecords.delete(projectId)
  await copyFile(reloadPath, join(directory, 'chart-after-missing-record.mjs'))
  const afterMissingRecord = await import(pathToFileURL(join(directory, 'chart-after-missing-record.mjs')))
  assert.equal(afterMissingRecord.hasPracticeChart(projectId), true, 'metadata index is synchronously visible before reconciliation')
  assert.equal(await afterMissingRecord.loadPracticeChart(projectId), null, 'missing durable bytes return no score')
  assert.equal(afterMissingRecord.hasPracticeChart(projectId), false, 'missing bytes clear stale availability metadata')

  const liveImageUrl = (await afterReplace.loadPracticeChart(imageId)).objectUrl
  failNextWrite = true
  await assert.rejects(afterReplace.deletePracticeChart(imageId), /Injected IndexedDB transaction failure/)
  assert.equal(afterReplace.hasPracticeChart(imageId), true, 'failed deletion restores availability metadata')
  assert.equal(await (await fetch(liveImageUrl)).text(), 'new-image', 'failed deletion preserves loaded image')

  const imageMetadataKey = 'besttake:practice-chart:v1:qa-web-reload-image'
  const preservedMetadata = storage.get(imageMetadataKey)
  failNextWrite = true
  failSetKey = imageMetadataKey
  await assert.rejects(afterReplace.deletePracticeChart(imageId), /Music is still stored on this device/)
  failSetKey = null
  assert.equal(chartRecords.has(imageId), true, 'failed metadata restoration leaves the source blob intact')
  assert.equal(storage.has(imageMetadataKey), false, 'failed metadata restoration is surfaced instead of silently hiding it')
  storage.set(imageMetadataKey, preservedMetadata)
  await afterReplace.deletePracticeChart(imageId)
  assert.equal(afterReplace.hasPracticeChart(imageId), false)
  await assert.rejects(fetch(liveImageUrl), 'deleting a score releases its object URL')
  await copyFile(reloadPath, join(directory, 'chart-after-delete.mjs'))
  const afterDelete = await import(pathToFileURL(join(directory, 'chart-after-delete.mjs')))
  assert.equal(await afterDelete.loadPracticeChart(imageId), null, 'deleted image stays deleted after reload')

  const cleanupId = 'qa-web-auxiliary-delete-cleanup'
  const cleanupImage = Object.assign(new Blob(['cleanup-image'], { type: 'image/png' }), { name: 'cleanup.png' })
  await afterDelete.savePracticeChart(cleanupId, cleanupImage)
  const cleanupChart = await afterDelete.loadPracticeChart(cleanupId)
  failRemoveKey = `besttake:practice-chart-view:v1:${cleanupId}`
  await afterDelete.deletePracticeChart(cleanupId)
  failRemoveKey = null
  assert.equal(afterDelete.hasPracticeChart(cleanupId), false, 'auxiliary view cleanup failure still evicts the deleted score')
  await assert.rejects(fetch(cleanupChart.objectUrl), 'deleted cached image URL is released despite view cleanup failure')
  await copyFile(reloadPath, join(directory, 'chart-after-auxiliary-cleanup-failure.mjs'))
  const afterAuxiliaryCleanupFailure = await import(pathToFileURL(join(directory, 'chart-after-auxiliary-cleanup-failure.mjs')))
  assert.equal(await afterAuxiliaryCleanupFailure.loadPracticeChart(cleanupId), null,
    'committed deletion remains deleted after reload when view cleanup fails')
  console.log('PASS: PDF/image reload, synchronous index, failed and successful replacement, stale-record cleanup, and deletion')
} finally {
  delete globalThis.indexedDB
  delete globalThis.localStorage
  await rm(directory, { recursive: true, force: true })
}

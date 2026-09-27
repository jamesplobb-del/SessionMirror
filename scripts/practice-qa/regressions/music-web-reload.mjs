// Expected to fail until browser Music scores survive a full page reload.
// Run: node scripts/practice-qa/regressions/music-web-reload.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
}

const directory = await mkdtemp(join(tmpdir(), 'besttake-music-web-reload-'))
try {
  const firstPath = join(directory, 'chart-first.mjs')
  const reloadPath = join(directory, 'chart-after-reload.mjs')
  await build({
    entryPoints: ['src/utils/practiceChartStorage.ts'],
    outfile: firstPath, bundle: true, platform: 'node', format: 'esm',
  })
  await copyFile(firstPath, reloadPath)
  const first = await import(pathToFileURL(firstPath))
  const projectId = 'qa-web-reload-score'
  const pdf = Object.assign(new Blob(['%PDF-1.4\n'], { type: 'application/pdf' }), { name: 'qa-score.pdf' })
  await first.savePracticeChart(projectId, pdf)
  assert.equal(first.hasPracticeChart(projectId), true, 'imported score is available before reload')
  assert.ok(await first.loadPracticeChart(projectId), 'reader can open imported score before reload')

  // A fresh module instance models a page reload: JS memory is gone, while
  // browser storage remains. No delete action is called at any point.
  const afterReload = await import(pathToFileURL(reloadPath))
  assert.equal(afterReload.hasPracticeChart(projectId), true,
    'imported browser score should still appear in Music after reload')
  assert.ok(await afterReload.loadPracticeChart(projectId),
    'reader should reopen the original score after reload')
  console.log('PASS: browser Music score remains available after page reload')
} finally {
  delete globalThis.localStorage
  await rm(directory, { recursive: true, force: true })
}

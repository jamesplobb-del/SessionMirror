import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundled = await build({
  entryPoints: ['src/utils/lastPracticeDestination.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
})
const { loadLastPracticeDestination, saveLastPracticeDestination } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
)
const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
}

assert.equal(loadLastPracticeDestination(), null)
saveLastPracticeDestination({ kind: 'routine', routineId: 'routine-1' })
assert.deepEqual(loadLastPracticeDestination(), { kind: 'routine', routineId: 'routine-1' })
saveLastPracticeDestination({ kind: 'music', projectId: 'score-1' })
assert.deepEqual(loadLastPracticeDestination(), { kind: 'music', projectId: 'score-1' })
storage.set('sessionmirror:last-practice-destination', '{bad json')
assert.equal(loadLastPracticeDestination(), null)
storage.set('sessionmirror:last-practice-destination', '{"kind":"music","projectId":42}')
assert.equal(loadLastPracticeDestination(), null)

console.log('PASS: last routine or standalone score survives relaunch; invalid saved destinations are ignored')

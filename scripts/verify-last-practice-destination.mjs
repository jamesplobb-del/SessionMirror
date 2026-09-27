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

const projectBundle = await build({
  entryPoints: ['src/utils/lastActiveProject.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm',
})
const { chooseInitialProjectId, rememberActiveProjectId } = await import(
  `data:text/javascript;base64,${Buffer.from(projectBundle.outputFiles[0].text).toString('base64')}`
)
const projects = [
  { id: 'new-empty', name: 'New folder', createdAt: 2 },
  { id: 'saved-takes', name: 'Saved takes', createdAt: 1 },
]
assert.equal(chooseInitialProjectId(projects), 'new-empty')
rememberActiveProjectId('saved-takes')
assert.equal(chooseInitialProjectId(projects), 'saved-takes')
assert.equal(chooseInitialProjectId(projects.slice(0, 1)), 'new-empty')
assert.equal(chooseInitialProjectId([]), null)

console.log('PASS: practice destination and last-used Take Vault folder survive relaunch; deleted folders fall back safely')

import { build } from 'esbuild'
import assert from 'node:assert/strict'

async function load(entry, plugins = []) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' }, plugins })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const store = new Map(), assets = new Map(), rejected = new Set(), nativePaths = new Set()
globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
globalThis.window = { localStorage }
globalThis.sharedRecovery = { assets, rejected, nativePaths }
const boundaries = { name: 'shared-storage', setup(b) {
  b.onResolve({ filter: /multitrackAssets$|^@capacitor\/filesystem$/ }, a => ({ path: a.path, namespace: 'storage-double' }))
  b.onLoad({ filter: /.*/, namespace: 'storage-double' }, ({ path }) => ({ contents: path.endsWith('multitrackAssets') ? `
    export const persistAsset=async s=>{if(s.startsWith('multitrack-asset:'))return s;if(globalThis.sharedRecovery.rejected.has(s))throw Error('persist rejected');return globalThis.sharedRecovery.assets.get(s)??s};
    export const restoreAsset=async s=>{if(globalThis.sharedRecovery.rejected.has(s))throw Error('read rejected');return globalThis.sharedRecovery.assets.get(s)??null};`
    : `export const Directory={Data:'DATA'};export const Filesystem={stat:async({path})=>{if(!globalThis.sharedRecovery.nativePaths.has(path))throw Error('missing native');return{size:1}},getUri:async({path})=>({uri:'file:///'+path})};` }))
} }
const persistence = await load('src/multitrack/state/multitrackPersistence.ts', [boundaries])
const makeTake = (id, videoUrl) => ({ id, name: id, videoUrl, thumbnailUrl: '', filePath: '', videoMimeType: 'video/mp4', mediaType: 'video', duration: 20, mirrorPlayback: false })
const source = { projectId: 'shared-recovery', name: 'Ensemble', layoutId: 'four', panels: [
  { kind: 'performance', id: 'a', take: makeTake('vault-a', 'blob:vault'), mirrored: true },
  { kind: 'performance', id: 'b', take: makeTake('collab-missing', 'multitrack-asset:missing'), trimStartSec: 2, trimEndSec: 15, timelineOffsetMs: -10000, volume: .4, muted: true, sectionStartSec: 10 },
  { kind: 'performance', id: 'c', take: { ...makeTake('collab-good', 'multitrack-asset:good'), thumbnailUrl: 'multitrack-asset:bad-thumb' } },
  { kind: 'performance', id: 'd', take: makeTake('collab-rejected', 'multitrack-asset:rejected') },
], practice: { bpm: 100, countInBars: 1 }, backing: { kind: 'none', volume: .7 }, sheetMusic: { kind: 'sheet-music', id: 'music', asset: null } }
assets.set('multitrack-asset:good', 'blob:good'); assets.set('blob:good', 'multitrack-asset:good')
rejected.add('multitrack-asset:rejected'); rejected.add('multitrack-asset:bad-thumb')
await persistence.saveMultitrackSession(source)
let current = await persistence.loadMultitrackSession([source.panels[0].take], source.projectId)
for (let pass = 0; pass < 3; pass++) {
  assert.equal(current.panels[0].take.id, 'vault-a'); assert.equal(current.panels[0].mirrored, true)
  assert.equal(current.panels[2].take.id, 'collab-good'); assert.equal(current.panels[2].take.thumbnailUrl, '')
  for (const index of [1, 3]) {
    assert.equal(current.panels[index].take, null)
    assert.equal(current.panels[index].missingTakeId, source.panels[index].take.id)
    assert.equal(current.panels[index].missingSharedTake.videoUrl, source.panels[index].take.videoUrl)
  }
  for (const key of ['trimStartSec','trimEndSec','timelineOffsetMs','volume','muted','sectionStartSec']) assert.equal(current.panels[1][key], source.panels[1][key])
  assert.match(current.recoveryNotice, /recordings are missing/)
  await persistence.saveMultitrackSession({ ...current, name: `Ensemble edit ${pass}` })
  current = await persistence.loadMultitrackSession([source.panels[0].take], source.projectId)
}
assets.set('multitrack-asset:missing', 'blob:missing-restored'); assets.set('blob:missing-restored', 'multitrack-asset:missing')
assets.set('multitrack-asset:rejected', 'blob:rejected-restored'); assets.set('blob:rejected-restored', 'multitrack-asset:rejected'); rejected.delete('multitrack-asset:rejected')
current = await persistence.loadMultitrackSession([source.panels[0].take], source.projectId)
assert.equal(current.recoveryNotice, undefined)
for (const index of [1, 3]) { assert.equal(current.panels[index].missingTakeId, undefined); assert.equal(current.panels[index].missingSharedTake, undefined); assert.ok(current.panels[index].take) }
await persistence.saveMultitrackSession(current)
assert.equal((await persistence.loadMultitrackSession([source.panels[0].take], source.projectId)).panels[1].take.id, 'collab-missing')
// Native descriptor remains durable when stat fails, then resolves on the next open.
const native = { ...source, projectId: 'native-recovery', panels: [{ ...source.panels[0], take: { ...makeTake('collab-native', ''), filePath: 'takes/native.mp4' } }] }
await persistence.saveMultitrackSession(native)
let reopened = await persistence.loadMultitrackSession([], native.projectId)
assert.equal(reopened.panels[0].missingSharedTake.filePath, 'takes/native.mp4')
await persistence.saveMultitrackSession(reopened); nativePaths.add('takes/native.mp4')
reopened = await persistence.loadMultitrackSession([], native.projectId); assert.equal(reopened.panels[0].take.filePath, 'takes/native.mp4')

const hooks = await load('src/multitrack/state/useMultitrackSession.ts', [{ name: 'hook-double', setup(b) {
  b.onResolve({ filter: /^react$|plusAccess$/ }, a => ({ path: a.path, namespace: 'hook' }))
  b.onLoad({ filter: /.*/, namespace: 'hook' }, ({ path }) => ({ contents: path === 'react' ? 'export const useRef=v=>({current:v});export const useCallback=f=>f;export const useEffect=()=>{};export const useMemo=f=>f();export const useState=v=>[typeof v==="function"?v():v,n=>globalThis.sharedStates.push(n)];' : 'export const requirePlus=()=>true' }))
} }])
globalThis.sharedStates = []
const hook = hooks.useMultitrackSession()
hook.updateProject({ panels: [{ ...current.panels[1], take: null, missingTakeId: 'collab-missing', missingSharedTake: source.panels[1].take }] })
hook.assignTakeToPanel('b', current.panels[1].take)
const panel = [...sharedStates].reverse().find(s => s?.panels).panels[0]
assert.equal(panel.missingSharedTake, undefined); assert.equal(panel.missingTakeId, undefined); assert.equal(panel.trimStartSec, 2)

// Real collaboration serializer preserves panel-only mirror state after Vault reopen.
const files = await load('src/multitrack/state/multitrackFile.ts')
const mirrored = { ...source, projectId: 'mirror', panels: [source.panels[0]], layoutId: 'one' }
mirrored.panels[0].take.videoUrl = URL.createObjectURL(new Blob(['video'], { type: 'video/mp4' }))
await persistence.saveMultitrackSession(mirrored)
const fromVault = await persistence.loadMultitrackSession([mirrored.panels[0].take], 'mirror')
const imported = await files.readMultitrackFile(await files.buildMultitrackFile(fromVault))
assert.equal(imported.session.panels[0].mirrored, true); assert.equal(imported.session.panels[0].take.mirrorPlayback, false)
imported.dispose(); URL.revokeObjectURL(mirrored.panels[0].take.videoUrl)
console.log('PASS: missing/rejected received sources and disposable thumbnail failures preserve healthy project, descriptors and edits across three saves; native restoration, original-id reconnect and panel-only mirrored exchange recover.')

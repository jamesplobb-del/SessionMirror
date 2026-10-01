import assert from 'node:assert/strict'
import { build } from 'esbuild'

// Only the asset store boundary is doubled: exercise real session persistence,
// cue ordering, reconnect mapping and editable-project export preflight.
const result = await build({ stdin: { contents: `export * from './src/multitrack/state/multitrackPersistence';
  export * from './src/multitrack/state/multitrackAssetRecovery';
  export * from './src/multitrack/sheetMusic/sheetMusicTimeline';
  export * from './src/multitrack/state/multitrackFile';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'asset-store', setup(b) {
    b.onResolve({ filter: /multitrackAssets$/ }, () => ({ path: 'assets', namespace: 'double' }))
    b.onLoad({ filter: /.*/, namespace: 'double' }, () => ({ loader: 'js', contents: `
      export async function persistAsset(src) {
        if (src.startsWith('multitrack-asset:')) return src;
        if (!globalThis.recoveryStore.has(src)) throw Error('Unavailable media must not be refetched');
        return globalThis.recoveryStore.get(src);
      }
      export async function restoreAsset(src) {
        if (globalThis.recoveryThrow.has(src)) throw Error('Transient asset read failed');
        return globalThis.recoveryStore.get(src) ?? null;
      }` }))
  } }] })
const m = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const storage = new Map()
globalThis.localStorage = { getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
globalThis.window = { localStorage }
globalThis.recoveryStore = new Map()
globalThis.recoveryThrow = new Set()
const pdf = { src: 'multitrack-asset:pdf', fileName: 'Part.pdf', mimeType: 'application/pdf',
  x: .23, y: .75, scale: 1.8, contentMode: 'fit', framePosition: 'left', frameScale: .7, pageIndex: 2, pageCount: 8 }
const healthy = { src: 'multitrack-asset:image', fileName: 'Photo.png', mimeType: 'image/png', x: .5, y: .5, scale: 1 }
recoveryStore.set(healthy.src, 'blob:healthy'); recoveryStore.set('blob:healthy', healthy.src)
const source = { projectId: 'recovery-test', name: 'My song', layoutId: 'two',
  panels: [{ kind: 'performance', id: 'a', take: null }, { kind: 'performance', id: 'b', take: null }],
  sheetMusic: { kind: 'sheet-music', id: 'music', asset: pdf, cues: [
    { id: 'page-turn', startSec: 12.5, asset: { ...pdf, pageIndex: 5 } },
    { id: 'healthy-cue', startSec: 24, asset: healthy },
    { id: 'missing-image', startSec: 30, asset: { ...healthy, src: 'multitrack-asset:missing-photo', fileName: 'Missing.png', scrollEndY: -.2, scrollDurationSec: 8 } },
  ] }, practice: { bpm: 120, clickEnabled: true, countInBars: 1 },
  backing: { kind: 'audio', src: 'multitrack-asset:backing', fileName: 'Backing.wav', mimeType: 'audio/wav', volume: .37 } }
await m.saveMultitrackSession(source)
let loaded = await m.loadMultitrackSession([], source.projectId)
for (let pass = 0; pass < 2; pass++) {
  assert.equal(loaded.backing.kind, 'audio')
  assert.equal(loaded.backing.missing, true)
  assert.equal(loaded.backing.volume, .37)
  assert.deepEqual(loaded.sheetMusic.asset, { ...pdf, missing: true })
  assert.equal(loaded.sheetMusic.cues.length, 3)
  assert.deepEqual(loaded.sheetMusic.cues.map(c => [c.id, c.startSec, c.asset.pageIndex]), source.sheetMusic.cues.map(c => [c.id, c.startSec, c.asset.pageIndex]))
  assert.equal(loaded.sheetMusic.cues[1].asset.missing, undefined)
  assert.equal(loaded.sheetMusic.cues[2].asset.scrollEndY, -.2)
  assert.match(loaded.recoveryNotice, /Reconnect or remove/)
  assert.deepEqual(m.missingImportedAssetNames(loaded), ['Backing.wav', 'Part.pdf', 'Missing.png'])
  assert.deepEqual(m.sheetCueWindows(loaded.sheetMusic).map(c => [c.id, c.startSec]), [['base', 0], ['page-turn', 12.5], ['healthy-cue', 24], ['missing-image', 30]])
  await assert.rejects(m.buildMultitrackFile(loaded), /Reconnect or remove missing files/)
  await m.saveMultitrackSession(loaded)
  loaded = await m.loadMultitrackSession([], source.projectId)
}
console.log('PASS: missing backing/base/cues survive two autosave/reopen cycles; healthy cues and timeline retained; sharing blocked before source reads.')

// Reappearance and transient store errors do not mutate intent or delete descriptors.
recoveryStore.set(pdf.src, 'blob:pdf'); recoveryStore.set('blob:pdf', pdf.src)
recoveryStore.set(source.backing.src, 'blob:backing'); recoveryStore.set('blob:backing', source.backing.src)
recoveryThrow.add(source.backing.src)
loaded = await m.loadMultitrackSession([], source.projectId)
assert.equal(loaded.backing.missing, true)
assert.equal(loaded.sheetMusic.asset.missing, undefined)
assert.equal(loaded.sheetMusic.cues[0].asset.missing, undefined)
await m.saveMultitrackSession(loaded)
recoveryThrow.clear()
loaded = await m.loadMultitrackSession([], source.projectId)
assert.equal(loaded.backing.missing, undefined)
assert.equal(loaded.backing.volume, .37)
assert.equal(loaded.sheetMusic.asset.pageIndex, 2)
console.log('PASS: files becoming available clear missing state; a rejected read retains the backing and retries on reopen.')

// Reconnect all missing views of one PDF; never rebase cue times or page/view choices.
recoveryStore.delete(pdf.src)
loaded = await m.loadMultitrackSession([], source.projectId)
const replacement = { ...pdf, src: 'blob:replacement', fileName: 'Reconnected.pdf', x: .5, y: .5, scale: 1, pageIndex: 0, pageCount: 9 }
const reconnected = m.reconnectSheetSource(loaded.sheetMusic, pdf.src, replacement)
for (const [previous, next] of [[loaded.sheetMusic.asset, reconnected.asset], [loaded.sheetMusic.cues[0].asset, reconnected.cues[0].asset]]) {
  assert.equal(next.missing, undefined); assert.equal(next.src, replacement.src)
  for (const key of ['pageIndex', 'x', 'y', 'scale', 'framePosition', 'frameScale', 'contentMode']) assert.equal(next[key], previous[key])
}
assert.equal(reconnected.cues[0].id, 'page-turn'); assert.equal(reconnected.cues[0].startSec, 12.5)
assert.equal(reconnected.cues[1].asset, loaded.sheetMusic.cues[1].asset)
assert.equal(reconnected.cues[2].asset.missing, true)
assert.throws(() => m.reconnectSheetSource(loaded.sheetMusic, pdf.src, { ...replacement, pageCount: 3 }), /saved page 6/)
assert.equal(loaded.sheetMusic.asset.missing, true, 'failed reconnect cannot partially change the base')
assert.throws(() => m.reconnectSheetSource(loaded.sheetMusic, pdf.src, healthy), /Choose a PDF/)
const reconnectPhoto = m.reconnectSheetSource(reconnected, 'multitrack-asset:missing-photo', { ...healthy, src: 'blob:new-photo' })
assert.equal(reconnectPhoto.cues[2].asset.scrollEndY, -.2)
assert.equal(reconnectPhoto.cues[2].asset.scrollDurationSec, 8)
recoveryStore.set(replacement.src, 'multitrack-asset:new-pdf'); recoveryStore.set('multitrack-asset:new-pdf', replacement.src)
recoveryStore.set('blob:new-photo', 'multitrack-asset:new-photo'); recoveryStore.set('multitrack-asset:new-photo', 'blob:new-photo')
await m.saveMultitrackSession({ ...loaded, sheetMusic: reconnectPhoto })
const reopened = await m.loadMultitrackSession([], source.projectId)
assert.deepEqual(m.missingImportedAssetNames(reopened), [])
assert.equal(reopened.recoveryNotice, undefined)
assert.equal(reopened.sheetMusic.cues[0].asset.pageIndex, 5)
assert.equal(reopened.sheetMusic.cues[0].startSec, 12.5)
await m.saveMultitrackSession({ ...reopened, backing: { kind: 'none', volume: .37 },
  sheetMusic: { ...reopened.sheetMusic, asset: null, cues: reopened.sheetMusic.cues.filter(c => c.id !== 'page-turn') } })
const removed = await m.loadMultitrackSession([], source.projectId)
assert.equal(removed.backing.kind, 'none'); assert.equal(removed.sheetMusic.asset, null)
assert.deepEqual(removed.sheetMusic.cues.map(c => c.id), ['healthy-cue', 'missing-image'])
console.log('PASS: reconnect retains source views/pages/cue identity/time/roll, rejects mismatched or short PDFs atomically, persists healthy state; explicit removal remains removed.')

// Actual hook actions: verified entitlement and React storage are the only doubles.
const hookBuild = await build({ stdin: { contents: "export * from './src/multitrack/state/useMultitrackSession'", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'hook-boundaries', setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'hook-double' }))
    b.onResolve({ filter: /plusAccess$/ }, () => ({ path: 'plus', namespace: 'hook-double' }))
    b.onLoad({ filter: /.*/, namespace: 'hook-double' }, ({ path }) => ({ loader: 'js', contents: path === 'plus'
      ? 'export const requirePlus=()=>true'
      : 'export const useRef=v=>({current:v});export const useCallback=f=>f;export const useEffect=()=>{};export const useMemo=f=>f();export const useState=v=>[typeof v==="function"?v():v,n=>globalThis.recoveryHookStates.push(n)];' }))
  } }] })
const { useMultitrackSession } = await import(`data:text/javascript;base64,${Buffer.from(hookBuild.outputFiles[0].text).toString('base64')}`)
globalThis.recoveryHookStates = []
const hook = useMultitrackSession()
hook.updateProject({ panels: [{ kind: 'performance', id: 'a', take: null, missingTakeId: 'original',
  trimStartSec: 2.3, trimEndSec: 20, timelineOffsetMs: -10000, sectionStartSec: 10, sectionEndSec: 27.7,
  volume: .4, muted: true, mirrored: true, label: 'Cello' }] })
hook.assignTakeToPanel('a', { id: 'original', duration: 30 })
const latestPanel = () => [...recoveryHookStates].reverse().find(s => s?.panels)?.panels[0]
assert.equal(latestPanel().missingTakeId, undefined)
for (const [key, value] of Object.entries({ trimStartSec: 2.3, trimEndSec: 20, timelineOffsetMs: -10000,
  sectionStartSec: 10, sectionEndSec: 27.7, volume: .4, muted: true, mirrored: true, label: 'Cello' })) assert.equal(latestPanel()[key], value)
hook.assignTakeToPanel('a', { id: 'new-part', duration: 5 })
assert.equal(latestPanel().trimStartSec, undefined); assert.equal(latestPanel().timelineOffsetMs, undefined)
assert.equal(latestPanel().muted, undefined)
console.log('PASS: reconnecting the original Vault take preserves timing/trim/mix/section/mirror; choosing a different take clears old timing.')

import { build } from 'esbuild'
import assert from 'node:assert/strict'
let mode = 'success', renderStarted, finishRender, cancelled = 0, shares = 0
const warning = console.warn
console.warn = () => {}
try {
  globalThis.cleanupBridge = {
    addListener: async () => ({ remove: async () => { throw Error('listener cleanup rejected') } }),
    cancelMultitrackExport: async () => { cancelled++; finishRender?.() },
    renderMultitrackVideo: async payload => {
      if (mode === 'failure') throw Error('renderer failed')
      if (mode === 'cancel') { renderStarted(); await new Promise(resolve => { finishRender = resolve }); throw Error('native cancelled') }
      return { path: 'file:///completed.mp4', durationSeconds: payload.durationSeconds }
    },
    shareMediaFile: async () => { shares++ },
  }
  const bundle = await build({ entryPoints: ['src/multitrack/export/multitrackExport.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'export-native-boundaries', setup(b) {
    b.onResolve({ filter: /audioSessionRoute$|shareTakeVideo$|nativeAssetCache$|^@capacitor\/core$/ }, a => ({ path: a.path, namespace: 'native' }))
    b.onLoad({ filter: /.*/, namespace: 'native' }, ({ path }) => ({ contents: path.endsWith('audioSessionRoute') ? 'export default globalThis.cleanupBridge' : path.endsWith('shareTakeVideo') ? 'export const resolveNativeFileUri=async()=>"file:///take.mp4"' : path.endsWith('nativeAssetCache') ? 'export const extensionForBlob=()=>"png";export const writeBlobToNativeCache=async()=>"file:///cache.png"' : 'export const Capacitor={isNativePlatform:()=>true,getPlatform:()=>"ios"}' }))
  } }] })
  const { exportMultitrackSession } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
  const session = { layoutId: 'one', panels: [{ kind: 'performance', id: 'a', take: { id: 'a', duration: 10 }, mirrored: true }], practice: { bpm: 120 }, backing: { kind: 'none', volume: 1 }, sheetMusic: { kind: 'sheet-music', id: 'music', asset: null } }
  const layout = { id: 'one', panelCount: 1, areas: ['a'], columns: '1fr', rows: '1fr' }
  assert.deepEqual(await exportMultitrackSession(session, layout, 10, { share: true }), { ok: true, renderedPath: 'file:///completed.mp4', durationSeconds: 12 })
  assert.equal(shares, 1)
  mode = 'failure'
  assert.deepEqual(await exportMultitrackSession(session, layout, 10), { ok: false, reason: 'render_failed' })
  mode = 'cancel'
  const abort = new AbortController(), started = new Promise(resolve => { renderStarted = resolve })
  const pending = exportMultitrackSession(session, layout, 10, { signal: abort.signal })
  await started; abort.abort()
  assert.deepEqual(await pending, { ok: false, reason: 'cancelled' }); assert.equal(cancelled, 1)
  console.log('PASS: rejected native listener cleanup preserves completed path/share, original render failure and in-flight cancellation result.')
} finally { console.warn = warning; delete globalThis.cleanupBridge }

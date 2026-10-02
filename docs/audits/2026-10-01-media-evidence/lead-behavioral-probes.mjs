// Run from repository root:
// node docs/audits/2026-10-01-media-evidence/lead-behavioral-probes.mjs
// Expected: reproduced defects logged, followed by PASS evidence assertions.
// Boundaries mocked: localStorage and imported-asset availability.
// Actual product modules run: projectTiming and multitrackPersistence.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
async function bundled(contents, plugins = []) {
  const result = await build({ stdin: { contents, resolveDir: process.cwd() }, bundle: true,
    write: false, platform: 'node', format: 'esm', plugins })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const timing = await bundled("export * from './src/multitrack/synchronization/projectTiming.ts'")
for (const trim of [0, 0.3, 1, 2, 2.3]) {
  const panel = { kind: 'performance', id: 'extra', overlay: {}, take: { duration: 12 },
    trimStartSec: trim, timelineOffsetMs: -10000 }
  const lead = timing.withOverlayLeadIn(panel, 120, trim, -10000)
  const nativeDownbeat = 10 + lead.trimStart + lead.offsetMs / 1000
  const visualDownbeat = 10 + trim - 10
  console.log('TIMING', JSON.stringify({ trim, lead, nativeDownbeat, visualDownbeat,
    errorSec: nativeDownbeat - visualDownbeat,
    declaredEnd: timing.panelEndSec(panel, 120), nativeEnd: 12 - lead.trimStart - lead.offsetMs / 1000 }))
  assert.ok(Math.abs((nativeDownbeat - visualDownbeat) - Math.max(0, 2 - trim)) < 1e-9,
    'Current implementation reproduces mapping error when insufficient source pre-roll exists')
}
console.log('PASS: independently reproduced overlay source mapping defect')

const persistence = await bundled("export * from './src/multitrack/state/multitrackPersistence'", [{
  name: 'missing-asset-boundary', setup(b) {
    b.onResolve({ filter: /multitrackAssets$/ }, () => ({ path: 'assets', namespace: 'probe' }))
    b.onLoad({ filter: /.*/, namespace: 'probe' }, () => ({ loader: 'js', contents:
      'export async function persistAsset(src){return src};export async function restoreAsset(src){return globalThis.assetAvailable ? "blob:restored" : null}' }))
  },
}])
const storage = new Map()
globalThis.localStorage = { getItem: k => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }
globalThis.window = { localStorage: globalThis.localStorage }
const asset = { src: 'multitrack-asset:score-1', fileName: 'Part.pdf',
  mimeType: 'application/pdf', x: .5, y: .5, scale: 1 }
const session = { projectId: 'recovery', layoutId: 'two',
  panels: [{ kind: 'performance', id: 'a', take: null }, { kind: 'performance', id: 'b', take: null }],
  practice: { bpm: 120, countInBars: 1 },
  sheetMusic: { kind: 'sheet-music', id: 'music', asset,
    cues: [{ id: 'cue1', asset: { ...asset, src: 'multitrack-asset:score-2' }, startSec: 10 }] },
  backing: { kind: 'audio', src: 'multitrack-asset:backing-1', fileName: 'Backing.wav',
    mimeType: 'audio/wav', volume: 1 } }
await persistence.saveMultitrackSession(session)
globalThis.assetAvailable = false
const missing = await persistence.loadMultitrackSession([], 'recovery')
const describe = value => ({ backing: value.backing, asset: value.sheetMusic.asset,
  cues: value.sheetMusic.cues, notice: value.recoveryNotice ?? null })
console.log('FIRST_LOAD', JSON.stringify(describe(missing)))
assert.ok(missing.recoveryNotice)
await persistence.saveMultitrackSession(missing)
globalThis.assetAvailable = true
const reopened = await persistence.loadMultitrackSession([], 'recovery')
console.log('SECOND_LOAD_ASSETS_AVAILABLE', JSON.stringify(describe(reopened)))
assert.equal(reopened.backing.kind, 'none')
assert.equal(reopened.sheetMusic.asset, null)
assert.deepEqual(reopened.sheetMusic.cues, [])
assert.equal(reopened.recoveryNotice, undefined)
console.log('PASS: independently reproduced loss of unresolved imported asset references after save/reopen')

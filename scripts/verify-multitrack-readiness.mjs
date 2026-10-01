import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function loadExports(contents) {
  const result = await build({
    stdin: { contents, resolveDir: process.cwd() },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const timing = await loadExports("export { withOverlayLeadIn, sourceWindow } from './src/multitrack/synchronization/projectTiming.ts'")
for (const bpm of [40, 120, 300]) {
  const countOff = 4 * 60 / bpm
  for (const trimStart of [0, 0.3, 1, countOff, countOff + 0.3, 2.3]) {
    const offsetMs = -10_000
    const panel = { kind: 'performance', id: 'extra', overlay: {}, take: { duration: 12 } }
    const lead = timing.withOverlayLeadIn(panel, bpm, trimStart, offsetMs)
    const sourceTimeAt = (projectSeconds, trim, offset) => projectSeconds + trim + offset / 1000

    assert.equal(lead.leadIn, Math.min(countOff, trimStart), 'only available source pre-roll is exposed')
    assert.ok(Math.abs(
      sourceTimeAt(10, trimStart, offsetMs) -
      sourceTimeAt(10, lead.trimStart, lead.offsetMs)
    ) < 1e-9, `source position stays fixed at ${bpm} BPM and trim ${trimStart}`)

    const originalEnd = 12 - trimStart - offsetMs / 1000
    const adjustedEnd = 12 - lead.trimStart - lead.offsetMs / 1000
    assert.ok(Math.abs(originalEnd - adjustedEnd) < 1e-9, 'clip end stays fixed')

    const originalWindow = timing.sourceWindow(trimStart, 12, offsetMs, 10, 20)
    const adjustedWindow = timing.sourceWindow(lead.trimStart, 12, lead.offsetMs, 10, 20)
    assert.ok(originalWindow && adjustedWindow, 'fixture interval intersects the source')
    for (const key of ['sourceInSec', 'sourceOutSec', 'timelineDelaySec']) {
      assert.ok(Math.abs(adjustedWindow[key] - originalWindow[key]) < 1e-9,
        `same project interval preserves ${key}`)
    }
  }
}

const { missingMultitrackFiles } = await loadExports("export { missingMultitrackFiles } from './src/multitrack/state/multitrackReadiness.ts'")
const session = {
  panels: [
    { kind: 'performance', id: 'ok', take: { id: 'take-1' } },
    { kind: 'performance', id: 'lead', missingTakeId: 'deleted', label: 'Lead' },
    { kind: 'performance', id: 'hidden', missingTakeId: 'deleted', hidden: true, label: 'Hidden' },
    { kind: 'performance', id: 'target', missingTakeId: 'deleted', label: 'Replacement' },
    { kind: 'performance', id: 'muted', missingTakeId: 'deleted', muted: true, label: 'Muted reference' },
  ],
  backing: { kind: 'audio', src: 'missing:backing', missing: true, fileName: 'Backing.wav', volume: 1 },
  sheetMusic: {
    kind: 'sheet-music', id: 'music',
    asset: { src: 'missing:score', missing: true, fileName: 'Score.pdf' },
    cues: [{ id: 'cue', startSec: 4, asset: { src: 'missing:image', missing: true, fileName: 'Page.png' } }],
  },
}

assert.deepEqual(missingMultitrackFiles(session), [
  'Lead', 'Replacement', 'Muted reference', 'Backing.wav', 'Score.pdf', 'Page.png',
], 'Play All and export require every visible missing source to be resolved or excluded')
assert.deepEqual(missingMultitrackFiles(session, { targetPanelId: 'target' }), [
  'Lead', 'Backing.wav', 'Score.pdf', 'Page.png',
], 'recording into a missing box can replace that target while other references remain required')
assert.deepEqual(missingMultitrackFiles(session, {
  targetPanelId: 'target', monitorMutes: new Set(['backing']),
}), ['Lead', 'Score.pdf', 'Page.png'], 'a muted missing reference does not block overdubbing')
assert.deepEqual(missingMultitrackFiles(session, {
  targetPanelId: 'target', monitorMutes: new Set(['lead']),
}), ['Backing.wav', 'Score.pdf', 'Page.png'], 'monitor mute exempts only the muted recording reference')

console.log('PASS: 18 timing cases preserve source mapping and clip end; 4 readiness cases cover missing references and replacement')

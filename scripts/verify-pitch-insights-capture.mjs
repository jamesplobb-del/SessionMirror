import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const directory = await mkdtemp(join(tmpdir(), 'pitch-insights-capture-'))
try {
  await build({
    entryPoints: [
      'src/utils/pitchInsightsCapture.ts',
      'src/db/pitchInsightsRepository.ts',
    ],
    outdir: directory,
    outbase: 'src',
    bundle: true,
    platform: 'node',
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    plugins: [{
      name: 'isolated-pitch-db',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^\.\/connection$/ }, () => ({ path: 'connection', namespace: 'test-db' }))
        pluginBuild.onLoad({ filter: /.*/, namespace: 'test-db' }, () => ({
          contents: 'export const initVaultDatabase = async () => globalThis.__pitchTestDb; export const persistVaultWebStore = async () => {}',
        }))
      },
    }],
  })

  const { PitchActivityDetector, loadPitchInsightsCaptureEnabled, savePitchInsightsCaptureEnabled } =
    await import(pathToFileURL(join(directory, 'utils', 'pitchInsightsCapture.mjs')))
  const { deletePitchObservationsForSessionRange } =
    await import(pathToFileURL(join(directory, 'db', 'pitchInsightsRepository.mjs')))

  const memory = new Map()
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => { memory.set(key, value) },
  }
  assert.equal(loadPitchInsightsCaptureEnabled(), true)
  memory.set('besttake:pitch-insights-ensemble-mode', 'true')
  assert.equal(loadPitchInsightsCaptureEnabled(), false, 'old ensemble preference should migrate to paused Insights')
  savePitchInsightsCaptureEnabled(true)
  assert.equal(loadPitchInsightsCaptureEnabled(), true)
  savePitchInsightsCaptureEnabled(false)
  assert.equal(loadPitchInsightsCaptureEnabled(), false)

  const detector = new PitchActivityDetector()
  for (let index = 0; index < 50; index += 1) {
    assert.equal(detector.observe(69, index * 100), null, 'a steady note must not prompt')
  }
  detector.reset()
  for (let index = 0; index < 10; index += 1) {
    assert.equal(detector.observe(60 + index, 10_000 + index * 250), null, 'stepwise playing must not prompt')
  }
  detector.reset()
  let warning = null
  for (let index = 0; index < 12; index += 1) {
    warning = detector.observe(index % 2 ? 76 : 69, 20_000 + index * 150) ?? warning
  }
  assert.ok(warning, 'rapid wide pitch reversals should offer the prompt')
  assert.ok(warning.startAt < warning.endAt)
  const dropoutDetector = new PitchActivityDetector()
  let dropoutWarning = null
  for (let index = 0; index < 12; index += 1) {
    const at = 25_000 + index * 150
    dropoutDetector.observe(null, at - 45)
    dropoutWarning = dropoutDetector.observe(index % 2 ? 76 : 69, at) ?? dropoutWarning
  }
  assert.ok(dropoutWarning, 'brief pitch dropouts should not hide a noisy passage')
  const gapDetector = new PitchActivityDetector()
  for (let index = 0; index < 4; index += 1) {
    assert.equal(gapDetector.observe(index % 2 ? 76 : 69, 40_000 + index * 150), null)
  }
  gapDetector.observe(null, 41_000)
  for (let index = 0; index < 4; index += 1) {
    assert.equal(gapDetector.observe(index % 2 ? 76 : 69, 41_050 + index * 150), null,
      'a long gap should begin a new passage')
  }
  for (let index = 0; index < 12; index += 1) {
    assert.equal(detector.observe(index % 2 ? 76 : 69, 30_000 + index * 150), null,
      'the warning must be snoozed after one offer')
  }

  const writes = []
  globalThis.__pitchTestDb = { run: async (sql, values) => { writes.push({ sql, values }) } }
  await deletePitchObservationsForSessionRange('session-a', 1000, 2000)
  assert.match(writes[0].sql, /session_id = \? AND observed_at >= \? AND observed_at < \?/)
  assert.deepEqual(writes[0].values, ['session-a', 1000, 2000])
  await assert.rejects(() => deletePitchObservationsForSessionRange('', 1000, 2000))
  assert.equal(writes.length, 1, 'an invalid cleanup must never run a delete')

  console.log('PASS: Insights preference migration, conservative activity prompt, cooldown, and session-scoped cleanup')
} finally {
  await rm(directory, { recursive: true, force: true })
}

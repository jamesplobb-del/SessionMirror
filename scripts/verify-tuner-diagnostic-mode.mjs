import assert from 'node:assert/strict'
import { build } from 'esbuild'

const values = new Map([['besttake.tuner-diagnostic-mode.v1', 'no-graph']])
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
async function load(enabled) {
  const result = await build({ entryPoints: ['src/utils/tunerDiagnosticMode.ts'], bundle: true, write: false, format: 'esm', platform: 'node', define: { 'import.meta.env': JSON.stringify({ VITE_TUNER_DIAGNOSTICS: enabled ? '1' : '' }) } })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const normal = await load(false)
assert.equal(normal.getTunerDiagnosticMode(), 'normal')
normal.setTunerDiagnosticMode('no-insights')
assert.equal(normal.getTunerDiagnosticMode(), 'normal')
assert.equal(values.get('besttake.tuner-diagnostic-mode.v1'), 'no-graph')
const diagnostic = await load(true)
assert.equal(diagnostic.getTunerDiagnosticMode(), 'no-graph')
for (const mode of diagnostic.TUNER_DIAGNOSTIC_MODES) {
  diagnostic.setTunerDiagnosticMode(mode)
  assert.equal(diagnostic.getTunerDiagnosticMode(), mode)
  assert.equal(values.get('besttake.tuner-diagnostic-mode.v1'), mode)
}
console.log('PASS: normal builds ignore diagnostics; investigation modes persist and switch independently')

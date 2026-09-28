import assert from 'node:assert/strict'
import { build } from 'esbuild'

const fixtures = {
  instrumentProfiles: 'export const getInstrumentProfile = id => id === "trumpet" ? { soundVolumeThreshold: 37 } : null',
  practiceRoutines: 'export const loadPreferredInstrumentId = () => "trumpet"',
  haptics: 'export const setHapticsEnabled = () => {}',
}
const bundle = await build({
  entryPoints: ['src/utils/appSettings.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [{ name: 'reset-fixtures', setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      const key = args.path.split('/').at(-1)
      if (fixtures[key]) return { path: key, namespace: 'fixture' }
    })
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: fixtures[args.path], loader: 'js' }))
  } }],
})
const settings = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const current = {
  ...settings.DEFAULT_APP_SETTINGS,
  tunerInstrument: 'winds',
  tunerTransposition: 'bb',
  darkMode: true,
  autoSoundRecording: true,
  soundVolumeThreshold: 89,
}
const reset = settings.createResetAppSettings(current)
assert.equal(reset.tunerInstrument, 'winds')
assert.equal(reset.tunerTransposition, 'bb')
assert.equal(reset.soundVolumeThreshold, 37, 'Reset restores the selected instrument’s baseline gate')
assert.equal(reset.darkMode, false)
assert.equal(reset.autoSoundRecording, false)
assert.notEqual(reset.audioEnhancerSettings, settings.DEFAULT_APP_SETTINGS.audioEnhancerSettings)
assert.equal(current.soundVolumeThreshold, 89, 'Reset does not mutate the previous settings')
console.log('Settings reset preserves instrument and written pitch, restores defaults, and uses a fresh enhancer preset.')

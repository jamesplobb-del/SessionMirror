import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const bundle = await build({
  stdin: { contents: "export { nativeTakePlaybackEnhancerParams, setTakePlaybackEnhancerState, subscribeTakePlaybackEnhancer, isTakePlaybackEnhancerEnabled } from './src/utils/takePlaybackSpeaker'; export { DEFAULT_AUDIO_ENHANCER_SETTINGS, buildNativeEnhancerParams, parseAudioEnhancerSettings } from './src/utils/audioEnhancer'", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'no-hardware-playback', setup(b) {
    b.onResolve({ filter: /playbackAudioContext$/ }, () => ({ path: 'context', namespace: 'test' }))
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const resumePlaybackAudioContext=async()=>{}; export const primePlaybackAudioContextSync=()=>null; export const getSharedPlaybackAudioContext=()=>null' }))
  } }],
})
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
api.setTakePlaybackEnhancerState(false, api.DEFAULT_AUDIO_ENHANCER_SETTINGS)
let notifications = 0
const unsubscribe = api.subscribeTakePlaybackEnhancer(() => { notifications++ })
api.setTakePlaybackEnhancerState(false, api.DEFAULT_AUDIO_ENHANCER_SETTINGS)
assert.equal(api.nativeTakePlaybackEnhancerParams(), undefined)
api.setTakePlaybackEnhancerState(true, api.DEFAULT_AUDIO_ENHANCER_SETTINGS)
assert.deepEqual(api.nativeTakePlaybackEnhancerParams(), api.buildNativeEnhancerParams(api.DEFAULT_AUDIO_ENHANCER_SETTINGS))
assert.equal(api.nativeTakePlaybackEnhancerParams(true), undefined, 'Already baked takes must not receive a second effect pass')
const custom = { ...api.DEFAULT_AUDIO_ENHANCER_SETTINGS, amount: 30 }
api.setTakePlaybackEnhancerState(true, custom)
assert.deepEqual(api.nativeTakePlaybackEnhancerParams(), api.buildNativeEnhancerParams(custom), 'Next native preparation uses current controls')
assert.equal(notifications, 2, 'Memoized Camera cards react to toggles and amount changes')
assert.equal(api.isTakePlaybackEnhancerEnabled(), true)
api.setTakePlaybackEnhancerState(false, custom)
assert.equal(notifications, 3, 'Turning enhancement off restores the native playback choice')
unsubscribe()
api.setTakePlaybackEnhancerState(true, custom)
assert.equal(notifications, 3, 'Unmounted cards release their subscription')
assert.equal(api.parseAudioEnhancerSettings({ preset: 'Voice', compression: 100, reverb: 80 }).preset, 'Natural')
assert.equal(api.parseAudioEnhancerSettings({ version: 2, amount: NaN }).amount, 60)
assert.deepEqual(api.buildNativeEnhancerParams(custom), { version: 2, amount: 0.3, matchOriginalLevel: 0 })
api.setTakePlaybackEnhancerState(true, { ...custom, amount: 0 })
assert.equal(api.nativeTakePlaybackEnhancerParams(), undefined)
console.log('PASS: migration, strength boundaries and zero-amount bypass')
console.log('PASS: Camera playback subscriptions follow enhancer toggles')
console.log('PASS: native enhancement follows enable, bypass, baked-take and slider settings')
if (process.platform === 'darwin') {
  const dir = await mkdtemp(join(tmpdir(), 'multitrack-enhancement-'))
  try {
    for (const [cmd, args] of [
      ['xcrun', ['swiftc', '-O', '-g', '-module-cache-path', join(dir, 'modules'), 'ios/App/App/AudioEnhancerRenderer.swift', 'scripts/fixtures/multitrack-enhancement/main.swift', '-o', join(dir, 'verify')]],
      [join(dir, 'verify'), [dir]],
    ]) {
      const result = spawnSync(cmd, args, { encoding: 'utf8' })
      if (result.status !== 0) throw new Error((result.stdout ?? '') + (result.stderr ?? '') || `Failed: ${cmd}`)
      if (result.stdout) process.stdout.write(result.stdout)
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
}

// Run with: node scripts/verify-youtube-practice-passage.mjs
// Invokes the production hook through a tiny deterministic hook dispatcher because
// this checkout has no DOM or React hook-renderer test dependency installed.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
}
const source = await readFile('src/utils/practicePassages.ts', 'utf8')
assert.match(source, /passageExceedsDuration/)

const built = await build({
  entryPoints: ['src/hooks/useYoutubePracticePassage.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [{
    name: 'hook-test-ports',
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'hook-test' }))
      build.onLoad({ filter: /.*/, namespace: 'hook-test' }, args => {
        if (args.path === 'bridge') return { contents: `
        globalThis.__bridgeCalls = [];
        export const seekYoutubeProxy = (...args) => globalThis.__bridgeCalls.push(['seek', ...args]);
        export const startYoutubeProxyPlayback = (...args) => globalThis.__bridgeCalls.push(['play', ...args]);
      `, loader: 'js' }
        return { contents: `
        let slots = []; let cursor = 0; let effects = []; let pending = [];
        export function beginRender() { cursor = 0; pending = []; }
        export function flushEffects() { for (const run of pending) run(); pending = []; }
        export function useState(initial) {
          const index = cursor++;
          if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
          const slot = slots[index];
          return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value }];
        }
        export function useRef(initial) {
          const index = cursor++;
          if (!slots[index]) slots[index] = { current: initial };
          return slots[index];
        }
        export function useEffect(effect, dependencies) {
          const index = cursor++;
          const slot = slots[index];
          if (!slot || dependencies.some((value, i) => !Object.is(value, slot.dependencies[i]))) {
            pending.push(() => {
              slot?.cleanup?.();
              const cleanup = effect();
              slots[index] = { dependencies, cleanup };
            });
          }
        }
        export function disposeEffects() { for (const slot of slots) slot?.cleanup?.(); slots = []; cursor = 0; }
        globalThis.__hookTest = { beginRender, flushEffects, disposeEffects };
      `, loader: 'js' }
      })
      build.onResolve({ filter: /youtubeBridge$/ }, () => ({ path: 'bridge', namespace: 'hook-test' }))
    },
  }],
})
const reactPort = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)

const listeners = new Map()
globalThis.window = {
  addEventListener: (name, listener) => listeners.set(name, listener),
  removeEventListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name) },
}
const { savePracticePassage } = await import('../src/utils/practicePassages.ts')
const { YOUTUBE_PROXY_ORIGIN } = await import('../src/utils/youtubeEmbed.ts')
savePracticePassage('project-a', 'youtube:abcdefghijk', {
  startSeconds: 10, endSeconds: 40, positionSeconds: 10, loop: true,
})
const iframe = { contentWindow: { postMessage() {} } }
const iframeRef = { current: iframe }
let controls
function render() {
  globalThis.__hookTest.beginRender()
  controls = reactPort.useYoutubePracticePassage({
    projectId: 'project-a', videoId: 'abcdefghijk', iframeRef, recording: false, beforePlay() {},
  })
  globalThis.__hookTest.flushEffects()
}
render()
render() // Re-render after initial saved state loads through the effect.
const onMessage = listeners.get('message')
assert.equal(typeof onMessage, 'function', 'the mounted hook subscribes to proxy status')
onMessage({
  origin: YOUTUBE_PROXY_ORIGIN,
  source: iframe.contentWindow,
  data: { event: 'youtube-status', videoId: 'abcdefghijk', iframeReady: true, currentTime: 0, duration: 25, playerState: 2 },
})
render() // Apply the delayed iframe duration state as React would after its state update.
assert.equal(controls.ready, true)
assert.equal(controls.rangeInvalid, true, 'the saved 40 second end is outside the loaded 25 second source')
const callCountBeforeInvalidPlay = globalThis.__bridgeCalls.length
controls.play()
assert.equal(globalThis.__bridgeCalls.length, callCountBeforeInvalidPlay, 'an invalid saved passage does not issue playback or seek commands')
controls.update({ endSeconds: 20 })
render()
assert.equal(controls.rangeInvalid, false, 'saving an end within the loaded duration repairs the range')
const callCountBeforeValidPlay = globalThis.__bridgeCalls.length
controls.play()
assert.equal(globalThis.__bridgeCalls.length, callCountBeforeValidPlay + 2, 'a repaired passage seeks to its start and begins playback')
globalThis.__hookTest.disposeEffects()
assert.equal(listeners.has('message'), false, 'unmount cleanup removes the proxy status listener')

const controlsSource = await readFile('src/components/ReferencePassageControls.tsx', 'utf8')
assert.match(controlsSource, /disabled=\{!ready \|\| rangeInvalid\}/, 'Listen is disabled while the saved range is invalid')
assert.match(controlsSource, /bounds extend past this recording/, 'the control exposes a correction message')
console.log('PASS: delayed YouTube duration invalidates the saved range, playback is blocked, and the controls expose correction UX.')

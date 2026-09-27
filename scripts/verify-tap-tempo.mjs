import assert from 'node:assert/strict'
import { build } from 'esbuild'

const { outputFiles } = await build({
  stdin: { contents: "export { useTapTempo } from './src/hooks/useTapTempo'", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'react-hook-stub', setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'stub' }))
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const useRef = value => ({current:value}); export const useCallback = fn => fn;' }))
  } }],
})
const { useTapTempo } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const realPerformance = globalThis.performance
let now = 0
globalThis.performance = { now: () => now }
try {
  const observed = []
  const { registerTap } = useTapTempo(value => observed.push(value))
  for (const time of [0, 1000, 2000]) { now = time; registerTap() }
  assert.equal(observed.at(-1), 60)
  for (const time of [2400, 2800, 3200]) { now = time; registerTap() }
  assert.equal(observed.at(-1), 150, 'a new tempo must not average old taps')
  now = 6000; registerTap()
  assert.equal(observed.at(-1), 150, 'a long gap starts a fresh count')
  now = 6500; registerTap()
  assert.equal(observed.at(-1), 120)
  console.log('PASS: stable, changed, and reset tap tempos')
} finally {
  globalThis.performance = realPerformance
}

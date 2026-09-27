import assert from 'node:assert/strict'
import { build } from 'esbuild'

let resolveInitialProfile
let onRouteChange
const initialProfile = new Promise((resolve) => { resolveInitialProfile = resolve })
globalThis.__headphoneRouteMock = {
  getPlaybackOutputProfile: () => initialProfile,
  addListener: async (_event, listener) => {
    onRouteChange = listener
    return { remove: async () => {} }
  },
}

const plugin = {
  name: 'headphone-route-mocks',
  setup(builder) {
    builder.onResolve({ filter: /^@capacitor\/core$|\.\/audioSessionRoute$/ }, (args) => ({ path: args.path, namespace: 'mock' }))
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
      contents: args.path === '@capacitor/core'
        ? 'export const Capacitor = { isNativePlatform: () => true }'
        : 'export default globalThis.__headphoneRouteMock',
    }))
  },
}

const bundled = await build({
  entryPoints: ['src/utils/headphoneOutput.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [plugin],
})
const route = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
const changes = []
route.subscribeHeadphoneOutput((connected) => changes.push(connected))
route.initHeadphoneOutputDetection()
await new Promise((resolve) => setImmediate(resolve))
assert.equal(typeof onRouteChange, 'function', 'Route listener should be installed before the initial probe')

onRouteChange({ outputPort: 'BluetoothA2DPOutput', usesHeadphones: true })
resolveInitialProfile({ outputPort: 'Speaker', usesHeadphones: false })
await new Promise((resolve) => setImmediate(resolve))
assert.equal(route.isHeadphoneOutputActive(), true, 'An older initial probe must not replace a live route event')

onRouteChange({ outputPort: 'BluetoothHFP', usesHeadphones: true })
onRouteChange({ outputPort: 'Speaker', usesHeadphones: false })
assert.deepEqual(changes, [true, false], 'Only actual headphone-output changes should reach subscribers')
console.log('Headphone output checks passed: listener-first probe, stale snapshot rejection, and duplicate route suppression.')

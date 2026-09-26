// Run: node scripts/verify-control-center-audio.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const domListeners = new Map()
const nativeListeners = new Map()
const events = []
const timers = new Map()
let nextTimer = 1

const addDomListener = (name, listener) => {
  const group = domListeners.get(name) ?? []
  group.push(listener)
  domListeners.set(name, group)
}
globalThis.window = {
  addEventListener: addDomListener,
  dispatchEvent(event) {
    events.push(event.type)
    for (const listener of domListeners.get(event.type) ?? []) listener(event)
  },
  setTimeout(listener) {
    const id = nextTimer++
    timers.set(id, listener)
    return id
  },
  clearTimeout(id) { timers.delete(id) },
}
globalThis.document = { visibilityState: 'visible', addEventListener: addDomListener }
globalThis.CustomEvent = class {
  constructor(type, options) { this.type = type; this.detail = options?.detail }
}
globalThis.__nativeAppListeners = nativeListeners

const bundle = await build({
  entryPoints: ['src/utils/appForeground.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm', plugins: [{ name: 'native-app', setup(plugin) {
    plugin.onResolve({ filter: /^@capacitor\/(core|app)$/ }, args => ({ path: args.path, namespace: 'native-app' }))
    plugin.onLoad({ filter: /.*/, namespace: 'native-app' }, args => ({
      contents: args.path.endsWith('/core')
        ? 'export const Capacitor = { isNativePlatform: () => true }'
        : 'export const App = { addListener: async (name, listener) => { globalThis.__nativeAppListeners.set(name, listener); return { remove() {} } } }',
    }))
  } }],
})
const app = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
app.registerAppForegroundLifecycle()
await new Promise(resolve => setImmediate(resolve))
const notifyDom = name => { for (const listener of domListeners.get(name) ?? []) listener() }

// Control Center can last longer than the old inactivity grace and can hide
// WebKit while UIKit has not entered the background. Neither event is a pause.
nativeListeners.get('appStateChange')({ isActive: false })
document.visibilityState = 'hidden'
notifyDom('visibilitychange')
for (const listener of [...timers.values()]) listener()
assert.equal(app.isAppInForeground(), true)
assert.ok(!events.includes(app.APP_BACKGROUND_SUSPEND_EVENT), 'Control Center must retain the audio route')
document.visibilityState = 'visible'
notifyDom('visibilitychange')
nativeListeners.get('appStateChange')({ isActive: true })
assert.ok(!events.includes(app.APP_FOREGROUND_RECOVERY_EVENT), 'Closing Control Center must not rebuild audio')

nativeListeners.get('pause')()
assert.equal(app.isAppInForeground(), false)
assert.equal(events.filter(name => name === app.APP_BACKGROUND_SUSPEND_EVENT).length, 1)
nativeListeners.get('appStateChange')({ isActive: true })
assert.equal(app.isAppInForeground(), true)
assert.equal(events.filter(name => name === app.APP_FOREGROUND_RECOVERY_EVENT).length, 1)
console.log('PASS: Control Center keeps the route; actual background suspends and recovers once.')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const swift = readFileSync('ios/App/App/BestTakeAudioPlugin.swift', 'utf8')
const objc = readFileSync('ios/App/App/BestTakeAudioPlugin.m', 'utf8')
assert.match(swift, /class BestTakeAudioPlugin: CAPPlugin, CAPBridgedPlugin/)
assert.doesNotMatch(objc, /CAP_PLUGIN\(BestTakeAudioPlugin/, 'An Objective-C category overrides the Swift method list at runtime')
const methods = [...swift.matchAll(/CAPPluginMethod\(name: "(\w+)"/g)].map(match => match[1])
assert.equal(new Set(methods).size, methods.length, 'Native registration has no duplicate methods')
for (const name of methods) assert.match(swift, new RegExp(`@objc func ${name}\\(`), `${name} has a native implementation`)
for (const name of ['startNativeTunerMonitor', 'stopNativeTunerMonitor', 'setNativeTunerPitchEnabled', 'setNativeAudioTapEnabled']) {
  assert.ok(methods.includes(name), `${name} must be visible to Capacitor`)
}

// Exercise the actual Capacitor proxy with the native registration table, not
// a replacement plugin object that makes unregistered methods appear to work.
globalThis.CapacitorCustomPlatform = { name: 'ios' }
const calls = []
globalThis.Capacitor = {
  PluginHeaders: [{ name: 'BestTakeAudioPlugin', methods: methods.map(name => ({ name, rtype: 'promise' })) }],
  nativePromise: async (_plugin, method, options) => { calls.push({ method, options }); return { active: true } },
}
const { registerPlugin } = await import('@capacitor/core')
const plugin = registerPlugin('BestTakeAudioPlugin')
await plugin.startNativeTunerMonitor({ micInputPreference: 'auto' })
await plugin.setNativeTunerPitchEnabled({ enabled: true })
await plugin.setNativeTunerPitchEnabled({ enabled: false })
assert.deepEqual(calls.map(call => call.method), ['startNativeTunerMonitor', 'setNativeTunerPitchEnabled', 'setNativeTunerPitchEnabled'])
await assert.rejects(plugin.methodThatDoesNotExist(), { code: 'UNIMPLEMENTED' })
console.log(`PASS: ${methods.length} native methods registered once; actual Capacitor proxy can start/stop native tuner detection`)

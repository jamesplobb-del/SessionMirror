const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

async function main() {
  let receiver
  let listenerCount = 0
  const acknowledgements = []
  const plugin = {
    addListener: async (_name, callback) => {
      receiver = callback
      listenerCount++
      return { remove: async () => { listenerCount-- } }
    },
    ackNativeAudioPitchFrame: async ({ frameId }) => acknowledgements.push(frameId),
  }
  const source = fs.readFileSync('src/utils/nativeAudioPitchTap.ts', 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const api = {}
  vm.runInNewContext(compiled, {
    exports: api, console, atob, Float32Array, Uint8Array,
    require: (name) => name === './audioSessionRoute'
      ? { default: plugin }
      : name === './nativeCameraTest'
        ? { isNativeCameraTestAvailable: () => true }
        : {},
  })
  const pcm = Buffer.from(new Float32Array([0.1, -0.2]).buffer).toString('base64')
  let deliveries = 0
  for (let i = 0; i < 1000; i++) {
    const handle = await api.subscribeNativeAudioPitchFrames(() => { deliveries++ })
    receiver({ frameId: i * 3, pcmBase64: pcm, sampleRate: 48000 })
    await handle.remove()
    // Late and malformed frames must release slots without waking old graphs.
    receiver({ frameId: i * 3 + 1, pcmBase64: pcm, sampleRate: 48000 })
    receiver({ frameId: i * 3 + 2 })
  }
  assert.equal(listenerCount, 1)
  assert.equal(deliveries, 1000)
  assert.equal(acknowledgements.length, 3000)
  let healthyDeliveries = 0
  const failing = await api.subscribeNativeAudioPitchFrames(() => { throw new Error('consumer failure') })
  const healthy = await api.subscribeNativeAudioPitchFrames(() => { healthyDeliveries++ })
  receiver({ frameId: 3000, pcmBase64: pcm, sampleRate: 48000 })
  assert.equal(healthyDeliveries, 1)
  assert.equal(acknowledgements.at(-1), 3000)
  await failing.remove()
  await healthy.remove()
  console.log('PASS: 1,000 tool switches; one receiver, no stale callbacks, all delivery slots acknowledged.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })

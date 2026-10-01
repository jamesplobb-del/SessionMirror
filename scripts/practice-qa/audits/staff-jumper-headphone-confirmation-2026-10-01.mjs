import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const tempDir = await mkdtemp('/tmp/staff-jumper-headphone-qa-')
const outfile = join(tempDir, 'headphone-output.mjs')
const qa = {
  snapshot: { outputPort: 'Headphones', outputUID: 'wired-1' },
  listener: null,
  getPlaybackCalls: 0,
}
globalThis.__staffJumperHeadphoneQA = qa

const plugin = {
  name: 'mock-headphone-route-bridge',
  setup(buildApi) {
    const virtual = new Map([
      ['@capacitor/core', 'export const Capacitor={isNativePlatform:()=>true}'],
      ['./audioSessionRoute', `
        const q=globalThis.__staffJumperHeadphoneQA;
        const bridge={
          async addListener(name,listener){ q.listener=listener; return { remove(){} } },
          async getPlaybackOutputProfile(){ q.getPlaybackCalls++; return q.snapshot }
        };
        export default bridge;
      `],
    ])
    buildApi.onResolve({ filter: /.*/ }, (args) => virtual.has(args.path) ? { path: args.path, namespace: 'headphone-qa' } : null)
    buildApi.onLoad({ filter: /.*/, namespace: 'headphone-qa' }, (args) => ({ contents: virtual.get(args.path), loader: 'js' }))
  },
}

try {
  await build({
    entryPoints: ['src/utils/headphoneOutput.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    plugins: [plugin],
  })
  const store = await import(pathToFileURL(outfile).href)
  store.initHeadphoneOutputDetection()
  for (let i = 0; i < 200 && !qa.listener; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(typeof qa.listener, 'function', 'actual store subscribes to native audio route changes')
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(qa.getPlaybackCalls, 1, 'actual store reads the initial native route')
  assert.equal(store.isConfirmedHeadphoneOutputActive(), true, 'wired headphones are accepted without confirmation')
  assert.equal(store.needsBluetoothHeadphoneConfirmation(), false)

  const route = (snapshot) => {
    qa.snapshot = snapshot
    qa.listener(snapshot)
  }
  const speakerLikeBluetooth = {
    outputPort: 'BluetoothA2DPOutput', outputUID: 'external-speaker-1', usesBluetoothOutput: true,
  }
  route(speakerLikeBluetooth)
  assert.equal(store.isConfirmedHeadphoneOutputActive(), false, 'Bluetooth is blocked until the player confirms headphones')
  assert.equal(store.needsBluetoothHeadphoneConfirmation(), true, 'known Bluetooth output offers explicit confirmation')
  assert.equal(store.hasConfirmedHeadphoneOutput(speakerLikeBluetooth), false)
  store.confirmBluetoothHeadphones()
  assert.equal(store.isConfirmedHeadphoneOutputActive(), true, 'explicit confirmation enables this Bluetooth output')
  assert.equal(store.hasConfirmedHeadphoneOutput(speakerLikeBluetooth, true), true)

  route({ ...speakerLikeBluetooth })
  assert.equal(store.isConfirmedHeadphoneOutputActive(), true, 'same output UID retains the user acknowledgement')
  route({ ...speakerLikeBluetooth, outputUID: 'external-speaker-2' })
  assert.equal(store.isConfirmedHeadphoneOutputActive(), false, 'a different Bluetooth UID revokes the acknowledgement')
  assert.equal(store.needsBluetoothHeadphoneConfirmation(), true)
  store.confirmBluetoothHeadphones()
  assert.equal(store.isConfirmedHeadphoneOutputActive(), true)

  route({ outputPort: 'AirPlay', outputUID: 'airplay-1', usesHeadphones: true })
  assert.equal(store.isConfirmedHeadphoneOutputActive(), false, 'AirPlay stays disallowed even after Bluetooth confirmation')
  assert.equal(store.needsBluetoothHeadphoneConfirmation(), false)
  store.confirmBluetoothHeadphones()
  assert.equal(store.isConfirmedHeadphoneOutputActive(), false, 'confirmation cannot make AirPlay a private headphone route')

  route({ outputPort: 'BuiltInSpeaker', outputUID: 'speaker-1', usesHeadphones: true, usesBluetoothOutput: true })
  assert.equal(store.isConfirmedHeadphoneOutputActive(), false, 'broad route flags do not override a built-in speaker port')
  assert.equal(store.needsBluetoothHeadphoneConfirmation(), false)

  route({ outputPort: 'BluetoothLE', usesBluetoothOutput: true })
  assert.equal(store.isConfirmedHeadphoneOutputActive(), false, 'Bluetooth output without a stable UID fails closed')
  assert.equal(store.needsBluetoothHeadphoneConfirmation(), true)
  store.confirmBluetoothHeadphones()
  assert.equal(store.isConfirmedHeadphoneOutputActive(), true, 'current Bluetooth can be explicitly confirmed for this route event')
  route({ outputPort: 'BluetoothLE', usesBluetoothOutput: true })
  assert.equal(store.isConfirmedHeadphoneOutputActive(), false, 'a new UID-less route event clears Bluetooth confirmation')

  route({ outputPort: 'Headphones', outputUID: 'wired-2' })
  assert.equal(store.isConfirmedHeadphoneOutputActive(), true, 'wired headphones remain automatically allowed')
  assert.equal(store.needsBluetoothHeadphoneConfirmation(), false)

  console.log('PASS: actual headphone route store blocks unconfirmed Bluetooth, binds acknowledgement to output UID, revokes on route changes, and always rejects AirPlay/speaker routes')
} finally {
  delete globalThis.__staffJumperHeadphoneQA
  await rm(tempDir, { recursive: true, force: true })
}

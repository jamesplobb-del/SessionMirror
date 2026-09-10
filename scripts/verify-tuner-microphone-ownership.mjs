import assert from 'node:assert/strict'
import { build } from 'esbuild'

const output = await build({ entryPoints: ['src/utils/tunerMicrophoneOwnership.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const ownership = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`)
let liveStream
let stopped = 0
let restored = 0
const createStream = () => ({ getTracks: () => [{ stop: () => { stopped++ } }] })
const unsubscribe = ownership.subscribeTunerMicrophoneOwnership((owned, restore) => {
  if (owned && liveStream) { liveStream.getTracks().forEach(t => t.stop()); liveStream = null }
  if (!owned && restore) restored++
})
liveStream = await ownership.requestWebAudioStream(async () => createStream())
await ownership.claimNativeTunerMicrophone()
assert.equal(stopped, 1, 'Existing WebRTC capture is stopped before native startup')
assert.equal(await ownership.requestWebAudioStream(() => { throw Error('Must not open competing mic') }), null)
ownership.releaseNativeTunerMicrophone()
assert.equal(restored, 1)

let resolvePermission
const lateRequest = ownership.requestWebAudioStream(() => new Promise(resolve => { resolvePermission = resolve }))
let nativeStarted = false
const handoff = ownership.claimNativeTunerMicrophone().then(() => { nativeStarted = true })
await Promise.resolve()
assert.equal(nativeStarted, false, 'Native waits for a pending permission request')
resolvePermission(createStream())
assert.equal(await lateRequest, null, 'Late WebRTC result is never published')
await handoff
assert.equal(stopped, 2)
assert.equal(nativeStarted, true)
ownership.releaseNativeTunerMicrophone(false)
assert.equal(restored, 1, 'Failed native startup leaves fallback to its caller')
assert.ok(await ownership.requestWebAudioStream(async () => createStream()), 'Web fallback works after failed native startup')

for (let i = 0; i < 100; i++) {
  await ownership.claimNativeTunerMicrophone()
  await ownership.claimNativeTunerMicrophone()
  ownership.releaseNativeTunerMicrophone()
  ownership.releaseNativeTunerMicrophone()
}
assert.equal(restored, 101, 'Ownership and restoration are idempotent')

let rejectPermission
const deniedRequest = ownership.requestWebAudioStream(() => new Promise((_, reject) => { rejectPermission = reject }))
const deniedAssertion = assert.rejects(deniedRequest, /permission denied/)
const deniedHandoff = ownership.claimNativeTunerMicrophone()
rejectPermission(new Error('permission denied'))
await deniedAssertion
await deniedHandoff
ownership.releaseNativeTunerMicrophone(false)

let resolveOldRequest
const oldRequest = ownership.requestWebAudioStream(() => new Promise(resolve => { resolveOldRequest = resolve }))
const oldHandoff = ownership.claimNativeTunerMicrophone()
ownership.releaseNativeTunerMicrophone(false)
resolveOldRequest(createStream())
assert.equal(await oldRequest, null, 'A previous request stays invalid after ownership is released')
await oldHandoff
unsubscribe()
console.log('PASS: existing mic release, blocked competing requests, pending/denied/stale permission races, fallback, and 100 handoff cycles')

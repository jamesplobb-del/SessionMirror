import assert from 'node:assert/strict'
import { build } from 'esbuild'
async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const { createHandsFreeSilence } = await load('src/utils/handsFreeSilence.ts')
// One late packet every 200ms used to keep erasing the silence timeout.
// Confirmed quiet frames must eventually finish even with that bridge jitter.
const jittered = createHandsFreeSilence()
let ended = false
for (let now = 0; now <= 2200; now += 200) {
  ended = jittered.sample(now, false, 2000, 43).stop
  if (ended) break
}
assert.equal(ended, true, 'Quiet audio must reach replay despite repeated delivery gaps')
const gate = createHandsFreeSilence()
assert.equal(gate.sample(0, false, 2000, 43).stop, false)
assert.equal(gate.sample(60000, false, 2000, 43).stop, false, 'A minute without audio is not a minute of confirmed silence')
gate.reset()
for (let t = 0; t < 1500; t += 48) assert.equal(gate.sample(t, false, 2000, 48).stop, false)
assert.equal(gate.sample(1500, true, 2000, 48).remainingSeconds, null, 'Playing cancels the countdown')
assert.equal(gate.sample(1600, false, 2000, 48).stop, false)
gate.reset()
let result
for (let t = 0; t <= 2200; t += 48) result = gate.sample(t, false, 2000, 48)
assert.equal(result.stop, true)
gate.reset()
assert.equal(gate.sample(2300, false, 2000, 48).stop, false, 'A new take gets a new silence clock')
assert.equal(gate.sample(2350, false, 0, 48).stop, true, 'Immediate-stop setting remains supported')

const { resolveHandsFreePhase } = await load('src/utils/handsFreePhase.ts')
const state = { autoSoundRecording: true, isRecording: false, handsFreePlaybackPending: false, handsFreeListeningReady: false, dragDeleteActive: false, finishingTake: false, playbackPlaying: false }
const phase = changes => resolveHandsFreePhase({ ...state, ...changes })
assert.equal(phase({}), 'preparing')
assert.equal(phase({ handsFreeListeningReady: true }), 'listening')
assert.equal(phase({ isRecording: true }), 'recording')
assert.equal(phase({ isRecording: true, replayCountdown: 2 }), 'countdown')
assert.equal(phase({ finishingTake: true, isRecording: true }), 'saving')
assert.equal(phase({ handsFreePlaybackPending: true }), 'saving', 'Pending playback must not pretend the player is running')
assert.equal(phase({ handsFreePlaybackPending: true, playbackPlaying: true }), 'playback')
assert.equal(phase({ handsFreeListeningReady: true }), 'listening')
assert.equal(phase({ autoSoundRecording: false }), null)
console.log('Hands-free checks passed: delayed silence, missing audio, resumed playing, repeated takes, and visible cycle states.')

const masked = createHandsFreeSilence()
masked.sample(0, false, 500, 48)
masked.pause()
assert.equal(masked.sample(800, false, 500, 48).stop, false, 'Masked metronome audio must not count as silence')
const { createHandsFreeHealth } = await load('src/utils/handsFreeHealth.ts')
const health = createHandsFreeHealth()
assert.equal(health.observeArming(0, true), false)
assert.equal(health.observeArming(6100, true), true)
health.observeArming(6200, false)
assert.equal(health.observeArming(9000, true), false)
assert.equal(health.finished(10000, 500), false)
assert.equal(health.finished(20000, 800), false)
assert.equal(health.finished(30000, 1200), true)
assert.equal(health.finished(40000, 8000), false, 'A substantial take clears short-take suspicion')
health.reset()
assert.equal(health.finished(50000, 500), false)
console.log('PASS: masked clicks and bounded symptom-based threshold advice')

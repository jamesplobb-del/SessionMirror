import assert from 'node:assert/strict'
import { build } from 'esbuild'
const bundle = await build({stdin:{contents:`export {getTunerProfile} from './src/utils/pitchConfig'; export {readRecordingOrientation,syncPhysicalOrientationClass} from './src/utils/physicalOrientation'; export {readViewportSize} from './src/utils/viewportSync'`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env':'{}'}})
const classes = new Set()
globalThis.window = {screen:{width:390,height:844},innerWidth:390,innerHeight:844,visualViewport:{width:390,height:844}}
globalThis.document = {documentElement:{classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)}}}
const m = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const phone = Object.fromEntries(['voice','strings','winds'].map(id=>[id,m.getTunerProfile(id)]))
m.syncPhysicalOrientationClass('landscape-left')
assert.equal(m.readRecordingOrientation(),'landscape','Portrait-locked phone retains sensor recording orientation')
window.screen = {width:834,height:1194}
window.innerWidth = 1194; window.innerHeight = 834
assert.equal(m.readRecordingOrientation(),'landscape','iPad follows the rotated interface without motion permission')
window.innerWidth = 834; window.innerHeight = 1194
assert.equal(m.readRecordingOrientation(),'portrait','iPad portrait ignores stale phone sensor orientation')
for (const id of ['voice','strings','winds']) {
  const pad = m.getTunerProfile(id)
  assert.equal(pad.rmsGateDbMic,phone[id].rmsGateDbMic-8)
  assert.equal(pad.clarityMinMic,phone[id].clarityMinMic,'Clarity stays equally strict')
  assert.equal(pad.rmsGateDbMedia,phone[id].rmsGateDbMedia,'Playback gate is unchanged')
  window.innerWidth = 400
  assert.equal(m.getTunerProfile(id),pad,'Split view preserves the hardware profile and its identity')
}
window.innerWidth = 834
classes.add('app-music-page')
window.visualViewport = {width:834,height:700}
assert.deepEqual(m.readViewportSize(),{width:834,height:1194},'Keyboard does not shrink the score or widget boundary')
classes.delete('app-music-page')
assert.deepEqual(m.readViewportSize(),{width:834,height:700},'Ordinary text-entry screens retain keyboard-aware sizing')
console.log('PASS: iPad/phone orientation, stable split-view pitch profiles, clarity parity, and keyboard-stable music bounds')

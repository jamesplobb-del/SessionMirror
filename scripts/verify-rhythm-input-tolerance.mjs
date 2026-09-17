import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result = await build({stdin:{contents:"export * from './src/labs/staffJumper/staffJumperRhythm'; export * from './src/labs/staffJumper/staffJumperRhythmReading'",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'})
const m = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
let checked = 0
for (const meter of Object.values(m.METERS)) for (const bpm of [60,80,120,160,200]) for (const units of [1,2,3,4,6,8,12,16]) {
 const slot = {durationUnits:units,isRest:false}
 const easy=m.onsetWindowFor(slot,null,meter,bpm,'easy'), medium=m.onsetWindowFor(slot,null,meter,bpm,'medium'), hard=m.onsetWindowFor(slot,null,meter,bpm,'hard')
 assert.ok(easy.onMs>=medium.onMs && medium.onMs>=hard.onMs)
 assert.ok(easy.lateMs>=hard.lateMs)
 assert.ok(easy.onMs<=easy.lateMs,'on-beat band must never promise acceptance outside the late window')
 for(const window of [easy,medium,hard]) {
  // An attack at the allowed late edge arrives after frame analysis, publication
  // and stability checks. It must still belong to the original note.
  const deliveredAt = window.lateMs + m.PITCH_DETECTION_LATENCY_MS + 34
  const judgedAt=m.rhythmDecisionGridMs(deliveredAt)
  assert.equal(m.attackWindowClosed(judgedAt,0,window),false,'late-edge input survives detector latency')
  assert.ok(judgedAt<m.slotDurationMs(slot,meter,bpm),'short note stays available while pitch settles')
  assert.equal(m.attackWindowClosed(m.rhythmDecisionGridMs(window.closeMs+200),0,window),true,'silence still resolves as a miss')
  assert.equal(m.judgeOnset(0,window),'on')
  checked++
 }
}
console.log(`PASS: ${checked} rhythm timing cases across simple/compound meters, tempo, duration and difficulty; delayed input retained and silent notes expire.`)

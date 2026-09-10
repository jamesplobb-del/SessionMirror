import {build} from 'esbuild'
import assert from 'node:assert/strict'
const changes=[]
globalThis.window = new EventTarget()
globalThis.__nativeTunerMock = {setNativeTunerPitchEnabled: async ({enabled})=>changes.push(enabled)}
const output=await build({entryPoints:['src/utils/nativeTunerPitch.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'native',setup(b){b.onResolve({filter:/audioSessionRoute$/},()=>({path:'native',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export default globalThis.__nativeTunerMock'}))}}]})
const {subscribeNativeTunerPitch}=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`)
let frames=0
const handle=await subscribeNativeTunerPitch(p=>{assert.equal(p.frequency,440);frames++})
for(let i=0;i<10000;i++)window.dispatchEvent(new CustomEvent('besttake:native-tuner-pitch',{detail:{frequency:440,confidence:.99,rmsDb:-20}}))
assert.equal(frames,10000)
window.dispatchEvent(new CustomEvent('besttake:native-tuner-pitch',{detail:{frequency:NaN,confidence:1,rmsDb:-10}}))
assert.equal(frames,10000)
await handle.remove();await handle.remove()
window.dispatchEvent(new CustomEvent('besttake:native-tuner-pitch',{detail:{frequency:440,confidence:1,rmsDb:-10}}))
assert.equal(frames,10000);assert.deepEqual(changes,[true,false])
for(let i=0;i<50;i++){const h=await subscribeNativeTunerPitch(()=>{});await h.remove()}
assert.equal(changes.length,102)
console.log('PASS: 10000 compact results, invalid-frame rejection, cleanup and 50 reopen cycles')

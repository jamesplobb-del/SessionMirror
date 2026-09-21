import assert from 'node:assert/strict'
import { build } from 'esbuild'
const bundle=await build({entryPoints:['src/utils/takeGuidance.ts'],bundle:true,write:false,platform:'node',format:'esm'})
const {advanceTakeGuidance:advance,completedTakeBoxTone:completed}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
assert.equal(advance('current','current',true),'best')
assert.equal(advance('current','current',false),'done')
assert.equal(advance('best','best',true),'done')
assert.equal(advance('current','best',true),'done')
assert.equal(advance('done','current',true),'done','replaying does not restart guidance')
assert.equal(completed({ownerId:'pip-challenger',completed:true}),'current')
assert.equal(completed({ownerId:'best-take-box',completed:true}),'best')
for(const completedFlag of [undefined,false])assert.equal(completed({ownerId:'pip-challenger',completed:completedFlag}),null,'pause, preemption, and old native builds must not advance guidance')
assert.equal(completed({ownerId:'multitrack',completed:true}),null,'unrelated playback does not advance guidance')
console.log('Take guidance transitions and native completion filtering passed.')

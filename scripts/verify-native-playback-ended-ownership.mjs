// Execute the actual registered native completion effect, with route cleanup deferred.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { build } from 'esbuild'
const source=await readFile('src/context/AudioModePlaybackContext.tsx','utf8')
const tree=ts.createSourceFile('AudioModePlaybackContext.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let effect
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(tree)==='useEffect'&&node.arguments[0]?.getText(tree).includes('setAudioModeNativePlaybackEndedHandler(() =>'))effect=node.arguments[0].getText(tree);ts.forEachChild(node,visit)}
visit(tree);assert.ok(effect,'Find the actual native completion registration effect')
const built=await build({stdin:{contents:`const f=globalThis.__nativeEndedFixture;
const nativePlaybackActiveRef=f.active,nativePlaybackStartingRef=f.starting,externalNativePlaybackEndedRef=f.ended,externalNativePlaybackFailedRef=f.failed,playbackRequestIdRef=f.request,currentSourceKeyRef=f.source;
const setAudioModeNativePlaybackEndedHandler=h=>f.handler=h,releaseAudioModeNativePlaybackRoute=()=>f.release(),finishNativePlayback=()=>{f.finished++;f.playing=false},stopAudioModeNativePlayback=async()=>{f.stops++},teardownAudioModeNativePlaybackListener=()=>{},logPlayback=(...args)=>f.logs.push(args);
export const install=${effect};`,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'})
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
let cases=0
async function fixture(){const gate=deferred(),f={gate,active:{current:true},starting:{current:false},ended:{current:()=>f.oldEnded++},failed:{current:null},request:{current:1},source:{current:'A'},finished:0,oldEnded:0,newEnded:0,stops:0,playing:true,logs:[],releaseCalls:0,release:()=>{f.releaseCalls++;return gate.promise}};globalThis.__nativeEndedFixture=f;const api=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text+`\n// fixture ${++cases}`).toString('base64')}`);f.cleanup=api.install();return f}
const unhandled=[];const capture=e=>unhandled.push(e);process.on('unhandledRejection',capture)
for(const replacement of ['new-source','same-source']){
 const f=await fixture();f.handler();await flush();f.request.current++;if(replacement==='new-source')f.source.current='B';f.active.current=true;f.playing=true;f.ended.current=()=>f.newEnded++;
 f.gate.resolve();await flush();assert.equal(f.finished,0,`${replacement}: old completion cannot finish the replacement`);assert.equal(f.active.current,true);assert.equal(f.playing,true);assert.equal(f.oldEnded,0);assert.equal(f.newEnded,0);f.cleanup()
}
{
 const f=await fixture();f.handler();f.handler();f.gate.resolve();await flush();assert.equal(f.releaseCalls,1);assert.equal(f.finished,1);assert.equal(f.oldEnded,1);f.cleanup()
}
{
 const f=await fixture();f.handler();f.cleanup();f.gate.resolve();await flush();assert.equal(f.finished,0);assert.equal(f.oldEnded,0);assert.equal(f.handler,null)
}
{
 const f=await fixture();f.handler();f.gate.reject(Error('injected route cleanup failure'));await flush();assert.equal(f.finished,1);assert.equal(f.oldEnded,1);assert.equal(f.logs.length,1);f.cleanup()
}
await new Promise(r=>setImmediate(r));process.off('unhandledRejection',capture);assert.deepEqual(unhandled,[],'Rejected route cleanup must not escape the native callback')
console.log(`PASS native-ended ownership: ${cases} actual-effect cases, replacement/same-source generation, normal/duplicate end, teardown and cleanup rejection`)

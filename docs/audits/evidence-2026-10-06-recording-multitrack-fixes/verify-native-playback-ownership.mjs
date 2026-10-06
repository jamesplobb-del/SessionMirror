// Execute the real ownership modules with explicit native/file/preview ports.
// These checks verify lifecycle ordering, not device acoustics or AVAudioSession.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory=mkdtempSync(join(tmpdir(),'native-playback-ownership-'))
process.on('exit',()=>rmSync(directory,{recursive:true,force:true}))

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b}); return {promise,resolve,reject} }
const flush = async () => { for (let i=0;i<60;i++) await Promise.resolve() }
let bundleId=0
async function load(entry, ports) {
  const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'ownership-ports',setup(b){
    for(const [filter,contents] of ports){ const namespace=`port-${filter.source}`; b.onResolve({filter},a=>({path:a.path,namespace})); b.onLoad({filter:/.*/,namespace},()=>({contents})) }
  }}]})
  const file=join(directory,`module-${++bundleId}.mjs`)
  writeFileSync(file,result.outputFiles[0].text)
  return import(pathToFileURL(file).href)
}
const capacitor=[/^@capacitor\/core$/,"export const Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios'}"]
async function stereoFixture() {
  const f={applies:0,restores:0,headphones:false,restored:0,snapshot:{previewActive:false,recordingActive:false,recordingMode:'audio'},apply:async()=>({routeApplied:true}),camera:async()=>f.snapshot,restore:async()=>{}}
  globalThis.__stereoOwnership={enableStereoPlayback:()=>{f.applies++;return f.apply()},enableRecordingRoute:async()=>{f.restores++;await f.restore()},getCameraSessionState:()=>f.camera(),headphones:()=>f.headphones}
  f.api=await load('src/utils/stereoPlaybackRoute.ts',[capacitor,[/audioSessionRoute$/,'export default globalThis.__stereoOwnership'],[/headphoneOutput$/,'export const isHeadphoneOutputActive=()=>globalThis.__stereoOwnership.headphones()']])
  f.api.registerRecordingRouteRestoredHandler(()=>f.restored++)
  return f
}
let cases=0
async function check(name,run) {await run();cases++;console.log(`PASS ${name}`)}
await check('test reset rejects pending transitions and clears settled fixtures',async()=>{
  const f=await stereoFixture(),apply=deferred();f.apply=()=>apply.promise
  const engage=f.api.engageStereoPlaybackAsync();assert.throws(()=>f.api.resetStereoPlaybackRouteForTests(),/Await native stereo/)
  apply.resolve({routeApplied:true});await engage;const restore=deferred();f.restore=()=>restore.promise
  const release=f.api.releaseStereoPlayback();await flush();assert.throws(()=>f.api.resetStereoPlaybackRouteForTests(),/Await native stereo/)
  restore.resolve();await release;f.api.resetStereoPlaybackRouteForTests();assert.equal(f.api.isStereoPlaybackEngaged(),false);assert.equal(f.api.isNativeStereoRouteEngaged(),false)
})
await check('final cancel awaits pending native apply and duplicate cleanup shares restore',async()=>{
  const f=await stereoFixture(),gate=deferred();f.apply=()=>gate.promise
  const engage=f.api.engageStereoPlaybackAsync();await flush()
  let released=false;const release=f.api.releaseStereoPlayback().then(()=>released=true),duplicate=f.api.releaseStereoPlayback()
  await flush();assert.equal(released,false);gate.resolve({routeApplied:true});await Promise.all([engage,release,duplicate])
  assert.equal(f.api.isStereoPlaybackEngaged(),false);assert.equal(f.api.isNativeStereoRouteEngaged(),false);assert.equal(f.restores,1)
})
await check('surviving concurrent playback lease is not restored early',async()=>{
  const f=await stereoFixture(),gate=deferred();f.apply=()=>gate.promise
  const a=f.api.engageStereoPlaybackAsync(),b=f.api.engageStereoPlaybackAsync();await f.api.releaseStereoPlayback();gate.resolve({routeApplied:true});await Promise.all([a,b])
  assert.equal(f.applies,1);assert.equal(f.restores,0);assert.equal(f.api.isNativeStereoRouteEngaged(),true)
  await f.api.releaseStereoPlayback();assert.equal(f.restores,1)
})
await check('new owner during camera snapshot preserves the engaged route',async()=>{
  const f=await stereoFixture();await f.api.engageStereoPlaybackAsync();const camera=deferred();f.camera=()=>camera.promise
  const release=f.api.releaseStereoPlayback();await flush();const next=f.api.engageStereoPlaybackAsync();camera.resolve(f.snapshot);await Promise.all([release,next])
  assert.equal(f.restores,0);assert.equal(f.applies,1);assert.equal(f.api.isStereoPlaybackEngaged(),true)
  f.camera=async()=>f.snapshot;await f.api.releaseStereoPlayback();assert.equal(f.restores,1)
})
await check('new player waits for an already-started capture restore then reapplies',async()=>{
  const f=await stereoFixture();await f.api.engageStereoPlaybackAsync();const gate=deferred();f.restore=()=>gate.promise
  const release=f.api.releaseStereoPlayback();await flush();assert.equal(f.restores,1)
  let ready=false;const next=f.api.engageStereoPlaybackAsync().then(()=>ready=true);await flush();assert.equal(ready,false);gate.resolve();await Promise.all([release,next])
  assert.equal(f.applies,2);f.restore=async()=>{};await f.api.releaseStereoPlayback();assert.equal(f.restores,2)
})
for(const snapshot of [{previewActive:true,recordingActive:false,recordingMode:'audio'},{previewActive:false,recordingActive:true,recordingMode:'audio'},{previewActive:false,recordingActive:false,recordingMode:'video'}]) await check(`capture owner preserved ${JSON.stringify(snapshot)}`,async()=>{
  const f=await stereoFixture();f.snapshot=snapshot;await f.api.engageStereoPlaybackAsync();await f.api.releaseStereoPlayback();assert.equal(f.restores,0);assert.equal(f.restored,1);assert.equal(f.api.isNativeStereoRouteEngaged(),false)
})
await check('headphone owner arriving during snapshot preserves its session',async()=>{
  const f=await stereoFixture();await f.api.engageStereoPlaybackAsync();const gate=deferred();f.camera=()=>gate.promise;const release=f.api.releaseStereoPlayback();await flush();f.headphones=true;gate.resolve(f.snapshot);await release;assert.equal(f.restores,0);assert.equal(f.restored,1)
})
for(const outcome of ['reject','not-applied']) await check(`native apply ${outcome} releases without fake restore and permits retry`,async()=>{
  const f=await stereoFixture();f.apply=async()=>{if(outcome==='reject')throw Error('injected apply failure');return {routeApplied:false}}
  await f.api.engageStereoPlaybackAsync();await f.api.releaseStereoPlayback();assert.equal(f.restores,0);assert.equal(f.api.isNativeStereoRouteEngaged(),false)
  f.apply=async()=>({routeApplied:true});await f.api.engageStereoPlaybackAsync();await f.api.releaseStereoPlayback();assert.equal(f.restores,1)
})

async function audioFixture(externalHolds=0) {
  const f={held:externalHolds,acquired:0,released:0,active:null,events:[],uri:async p=>p,prepare:async()=>{},preview:async p=>p,start:async()=>{}}
  globalThis.__audioOwnership={
    resolve:p=>f.uri(p),preview:p=>f.preview(p),prepare:async()=>{f.held++;f.acquired++;await f.prepare()},release:async()=>{assert.ok(f.held>externalHolds,'cleanup cannot consume an independent consumer');f.held--;f.released++},
    plugin:{addListener:async()=>({remove:async()=>{}}),startInlineTakeBoxPlayback:async o=>{f.events.push(`starting:${o.url}`);await f.start(o);f.active=o.url;f.events.push(`started:${o.url}`);return {duration:10}},stopInlineTakeBoxPlayback:async()=>{f.events.push(`stopped:${f.active}`);f.active=null}},
  }
  f.api=await load('src/utils/audioModeNativePlayback.ts',[capacitor,[/audioSessionRoute$/,'export default globalThis.__audioOwnership.plugin'],[/takeStorage$/,'export const resolveNativeFileUri=p=>globalThis.__audioOwnership.resolve(p)'],[/naturalTakePreview$/,'export const readyNaturalTakePreview=p=>globalThis.__audioOwnership.preview(p)'],[/playbackRouteCoordinator$/,'export const prepareInlineTakeBoxPlaybackRoute=()=>globalThis.__audioOwnership.prepare();export const releaseInlineTakeBoxPlaybackRoute=()=>globalThis.__audioOwnership.release()'],[/takeGuidance$/,'export const completedTakeBoxTone=()=>null']])
  return f
}
for(const boundary of ['uri','prepare','preview','native']) await check(`Stop during ${boundary} awaits cleanup and prevents late playback`,async()=>{
  const f=await audioFixture(),gate=deferred()
  if(boundary==='uri')f.uri=()=>gate.promise
  if(boundary==='prepare')f.prepare=()=>gate.promise
  if(boundary==='preview')f.preview=()=>gate.promise
  if(boundary==='native')f.start=()=>gate.promise
  const start=f.api.startAudioModeNativePlayback({filePath:'A.m4a'});await flush();const stop=f.api.stopAudioModeNativePlayback();await flush();gate.resolve('A.m4a');await stop;assert.equal(await start,null)
  assert.equal(f.active,null);assert.equal(f.held,0);assert.equal(f.released,f.acquired)
  if(boundary!=='native')assert.deepEqual(f.events,[]);else assert.deepEqual(f.events,['starting:A.m4a','started:A.m4a','stopped:A.m4a'])
})
await check('slow A/fast B/Stop releases both owned leases and preserves an independent consumer',async()=>{
  const f=await audioFixture(1),gate=deferred();f.preview=p=>p==='A.m4a'?gate.promise:Promise.resolve(p)
  const a=f.api.startAudioModeNativePlayback({filePath:'A.m4a'});await flush();const b=f.api.startAudioModeNativePlayback({filePath:'B.m4a'});assert.ok(await b);gate.resolve('A.m4a');assert.equal(await a,null)
  assert.equal(f.active,'B.m4a');assert.equal(f.held,2);await f.api.stopAudioModeNativePlayback();assert.equal(f.held,1);assert.equal(f.active,null);assert.equal(f.released,2)
})
await check('replacement waits for stale native start cleanup before starting B',async()=>{
  const f=await audioFixture(),gate=deferred();f.start=o=>o.url==='A.m4a'?gate.promise:Promise.resolve()
  const a=f.api.startAudioModeNativePlayback({filePath:'A.m4a'});await flush();const b=f.api.startAudioModeNativePlayback({filePath:'B.m4a'});await flush();assert.deepEqual(f.events,['starting:A.m4a'])
  gate.resolve();assert.equal(await a,null);assert.ok(await b);assert.deepEqual(f.events,['starting:A.m4a','started:A.m4a','stopped:A.m4a','starting:B.m4a','started:B.m4a'])
  await f.api.stopAudioModeNativePlayback();assert.equal(f.held,0)
})
await check('late canceled preparation cannot stop a newer active preview',async()=>{
  const f=await audioFixture(),gate=deferred();let prepares=0;f.prepare=()=>++prepares===1?gate.promise:Promise.resolve()
  const a=f.api.startAudioModeNativePlayback({filePath:'A.m4a'});await flush();const stopA=f.api.stopAudioModeNativePlayback();await flush();const b=f.api.startAudioModeNativePlayback({filePath:'B.m4a'});assert.ok(await b)
  gate.resolve();await stopA;assert.equal(await a,null);assert.equal(f.active,'B.m4a');assert.equal(f.held,1);await f.api.stopAudioModeNativePlayback();assert.equal(f.held,0)
})
for(const boundary of ['uri','prepare','preview','native']) await check(`${boundary} failure releases only acquired ownership and allows retry`,async()=>{
  const f=await audioFixture();const fail=async()=>{throw Error(`injected ${boundary} failure`)}
  if(boundary==='uri')f.uri=fail;if(boundary==='prepare')f.prepare=fail;if(boundary==='preview')f.preview=fail;if(boundary==='native')f.start=fail
  assert.equal(await f.api.startAudioModeNativePlayback({filePath:'A.m4a'}),null);assert.equal(f.held,0)
  f.uri=async p=>p;f.prepare=async()=>{};f.preview=async p=>p;f.start=async()=>{};assert.ok(await f.api.startAudioModeNativePlayback({filePath:'B.m4a'}));await f.api.stopAudioModeNativePlayback();assert.equal(f.held,0)
})
await check('natural end and repeated cleanup release exactly one owned lease',async()=>{
  const f=await audioFixture(1);assert.ok(await f.api.startAudioModeNativePlayback({filePath:'A.m4a'}));f.active=null
  await f.api.releaseAudioModeNativePlaybackRoute();await f.api.releaseAudioModeNativePlaybackRoute();await f.api.stopAudioModeNativePlayback();assert.equal(f.held,1);assert.equal(f.released,1)
})
console.log(`Native playback ownership: ${cases} cases passed with explicit ports; native acoustics unverified.`)

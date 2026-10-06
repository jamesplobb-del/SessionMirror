import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFile, readFile } from 'node:fs/promises'
const require = createRequire(process.cwd() + '/package.json')
const { build } = require('esbuild')
const evidence = '/private/tmp/besttake-recording-multitrack-2026-10-06/ultra'
const defer = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve } }
const drain = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
let index = 0
async function load(entry, ports) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'explicit-native-ports', setup(b) {
    for (const [filter, code] of ports) { b.onResolve({ filter }, a => ({ path: a.path, namespace: filter.source })); b.onLoad({ filter: /.*/, namespace: filter.source }, () => ({ contents: code, loader: 'js' })) }
  }}] })
  const file = evidence + '/actual-module-' + (++index) + '.mjs'
  await writeFile(file, result.outputFiles[0].text)
  return import(file)
}
const capacitor = [/^@capacitor\/core$/, "export const Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios'}"]
const results = []
let routeApply = defer(), restores = 0
const nativePort = { enableStereoPlayback: () => routeApply.promise, enableRecordingRoute: async () => { restores++ }, getCameraSessionState: async () => ({ previewActive:false,recordingActive:false,recordingMode:'audio' }) }
globalThis.__routePort = nativePort
const route = await load('src/utils/stereoPlaybackRoute.ts', [capacitor, [/audioSessionRoute$/, 'export default globalThis.__routePort'], [/headphoneOutput$/, 'export const isHeadphoneOutputActive=()=>false']])
const pendingEngage = route.engageStereoPlaybackAsync()
await drain()
await route.releaseStereoPlayback()
routeApply.resolve({routeApplied:true,playbackRouteStyle:'full'})
await pendingEngage
assert.equal(route.isStereoPlaybackEngaged(), false)
assert.equal(route.isNativeStereoRouteEngaged(), true)
assert.equal(restores, 0)
results.push({name:'cancel-during-stereo-route-apply', status:'FAILED_PRODUCT_INVARIANT', actual:{hold:false,nativeRoute:true,restores},expected:{hold:false,nativeRoute:false,restores:1},boundary:'Native AVAudioSession apply completion is deferred; no device hardware used.'})
// Normal final release still restores: disconfirm a blanket restore failure.
route.resetStereoPlaybackRouteForTests(); routeApply = defer(); const normal = route.engageStereoPlaybackAsync(); routeApply.resolve({routeApplied:true}); await normal; await route.releaseStereoPlayback(); assert.equal(restores,1)
results.push({name:'settled-stereo-route-release-control',status:'PASSED',actual:{nativeRoute:route.isNativeStereoRouteEngaged(),restores}})
route.resetStereoPlaybackRouteForTests(); routeApply = defer()
const sharedA=route.engageStereoPlaybackAsync(), sharedB=route.engageStereoPlaybackAsync()
await route.releaseStereoPlayback(); routeApply.resolve({routeApplied:true}); await Promise.all([sharedA,sharedB])
assert.equal(route.isStereoPlaybackEngaged(),true); assert.equal(route.isNativeStereoRouteEngaged(),true); assert.equal(restores,1)
await route.releaseStereoPlayback(); assert.equal(route.isStereoPlaybackEngaged(),false); assert.equal(route.isNativeStereoRouteEngaged(),false); assert.equal(restores,2)
results.push({name:'surviving-competing-consumer-control',status:'PASSED',actual:{restores,holds:false},note:'One abandoned hold must preserve another legitimate playback consumer; final settled release restores.'})

// Use real audioModeNativePlayback with real inline singleton ownership module.
// Only native bridge, file/preview and route ports are mocked.
const starts = [], stops = []; let held = 0; const preparation = new Map(); let active = null
const playerPort = { addListener:async()=>({remove:async()=>{}}), startInlineTakeBoxPlayback:async o => { starts.push(o.url); active=o.url; return {duration:10} }, stopInlineTakeBoxPlayback:async()=>{stops.push(active);active=null} }
globalThis.__playerPort = playerPort
globalThis.__previewPort = src => preparation.get(src)?.promise ?? Promise.resolve(src)
globalThis.__holdPort = { acquire: async()=>{held++}, release:async()=>{if(held>0)held--} }
const player = await load('src/utils/audioModeNativePlayback.ts', [capacitor, [/audioSessionRoute$/, 'export default globalThis.__playerPort'], [/takeStorage$/, 'export const resolveNativeFileUri=async p=>p'], [/naturalTakePreview$/, 'export const readyNaturalTakePreview=(p)=>globalThis.__previewPort(p)'], [/playbackRouteCoordinator$/, 'export const prepareInlineTakeBoxPlaybackRoute=()=>globalThis.__holdPort.acquire();export const releaseInlineTakeBoxPlaybackRoute=()=>globalThis.__holdPort.release()'], [/takeGuidance$/, 'export const completedTakeBoxTone=()=>null']])
const previewA=defer(); preparation.set('A.m4a',previewA)
const requestA=player.startAudioModeNativePlayback({filePath:'A.m4a'}); await drain()
assert.equal(held,1)
const requestB=player.startAudioModeNativePlayback({filePath:'B.m4a'}); await drain(); assert.ok(await requestB)
previewA.resolve('A.m4a'); assert.equal(await requestA,null)
assert.deepEqual(starts,['B.m4a'])
await player.stopAudioModeNativePlayback()
assert.equal(active,null)
assert.equal(held,1)
results.push({name:'superseded-audio-preview-route-hold',status:'FAILED_PRODUCT_INVARIANT',actual:{starts,active,heldAfterStop:held},expected:{starts:['B.m4a'],active:null,heldAfterStop:0},boundary:'Real audio/native-inline modules; URI, preparation, native plugin and route hold ports are explicit mocks.'})
// A plain cancel while preview preparation is pending balances its one hold.
held=0; const previewC=defer(); preparation.set('C.m4a',previewC)
const requestC=player.startAudioModeNativePlayback({filePath:'C.m4a'}); await drain(); assert.equal(held,1)
await player.stopAudioModeNativePlayback(); assert.equal(held,0); previewC.resolve('C.m4a'); assert.equal(await requestC,null); assert.equal(held,0)
results.push({name:'single-preview-cancel-control',status:'PASSED',actual:{heldAfterStop:held},note:'Leak requires replacement while older preview is preparing; an ordinary Stop at this stage balances the hold.'})
await writeFile(evidence+'/cross-owner-results.json',JSON.stringify(results,null,2))
console.log(JSON.stringify(results,null,2))

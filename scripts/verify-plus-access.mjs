import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const memory = new Map()
globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,String(v)), removeItem: k => memory.delete(k) }
const scheduled = new Map()
const nativeSetTimeout = globalThis.setTimeout
const nativeClearTimeout = globalThis.clearTimeout
let timerId = 0
// Keep a week-long trial from keeping Node alive; expiry callbacks are exercised below.
globalThis.setTimeout = (fn, ms) => { const id = ++timerId; scheduled.set(id, { fn, ms }); return id }
globalThis.clearTimeout = id => scheduled.delete(id)
globalThis.window = { addEventListener() {} }
let buildId = 0
async function load(entry, { dev = false, native = false, stubs = {} } = {}) {
  const defaults = {
    '@capacitor/core': `export const Capacitor={getPlatform:()=>${JSON.stringify(native ? 'ios' : 'web')}};export const registerPlugin=()=>globalThis.__plusBridge;`,
    appForeground: 'export const subscribeAppForeground=()=>()=>{}',
    ...stubs,
  }
  const result = await build({ entryPoints:[entry], bundle:true, write:false, format:'esm', platform:'node', define:{'import.meta.env.DEV':String(dev)}, plugins:[{name:'plus-fixtures',setup(b){
    b.onResolve({filter:/.*/},args=>{const key=defaults[args.path] ? args.path : args.path.split('/').at(-1);if(defaults[key])return {path:key,namespace:'fixture'}})
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:defaults[args.path],loader:'js'}))
  }}] })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text+`\n// fixture ${++buildId}`).toString('base64')}`)
}
try {
  const nativeSource=readFileSync('ios/App/App/OfferCodesPlugin.swift','utf8')
  assert.doesNotMatch(nativeSource,/redeemAlpha|alphaUnlocked|canRedeemAlpha|sandbox-alpha/,'Native plugin exposes no custom code grant in any environment')
  assert.match(nativeSource,/AppStore\.presentOfferCodeRedeemSheet/,'Official redemption stays in Apple StoreKit')
  assert.match(nativeSource,/case \.verified\(let transaction\)/,'Native access still verifies Apple transactions')
  const paywall=readFileSync('src/plus/PlusPaywall.tsx','utf8')
  assert.doesNotMatch(paywall,/redeemAlpha|alphaUnlocked|Test build code|<input|<form/,'Paywall has no custom code-entry form')
  const policy = await load('src/plus/plusPolicy.ts')
  const empty = { purchased:false, alphaUnlocked:false, canRedeemAlpha:false, trialStartedAt:null, trialExpiresAt:null }
  assert.equal(policy.hasPlusAccess(empty, 100), false)
  assert.equal(policy.hasPlusAccess({...empty,alphaUnlocked:true},100),false,'Production ignores an alpha flag')
  assert.equal(policy.hasPlusAccess({...empty,alphaUnlocked:true,canRedeemAlpha:true},100),false,'Legacy sandbox code flags cannot grant access')
  assert.equal(policy.hasPlusAccess({...empty,purchased:true},1e15),true,'Lifetime access does not expire')
  const trial = {...empty,trialStartedAt:100,trialExpiresAt:200}
  assert.equal(policy.hasPlusAccess(trial,99),false)
  assert.equal(policy.hasPlusAccess(trial,100),true)
  assert.equal(policy.hasPlusAccess(trial,199),true)
  assert.equal(policy.hasPlusAccess(trial,200),false)
  const internalPreview = {...empty,internalPreviewExpiresAt:200}
  assert.equal(policy.hasPlusAccess(internalPreview,199),true,'Native internal preview grants temporary access separately from a purchase')
  assert.equal(policy.hasPlusAccess(internalPreview,200),false,'Internal access expires at its deadline')
  for (const invalid of [null,undefined,NaN,Infinity,'200']) {
    assert.equal(policy.hasPlusAccess({...empty,internalPreviewExpiresAt:invalid},100),false,'Malformed preview status cannot grant access')
  }
  assert.equal(policy.hasPlusAccess({...trial,internalPreviewExpiresAt:150},175),true,'Preview expiry does not shorten a verified trial')
  for (const setup of [
    {difficulty:'easy',key:'C',mode:'major',range:'1-octave'},
    {difficulty:'easy',key:'B',mode:'minor',range:'2-octaves',customScale:[0,2,4]},
    {difficulty:'easy',key:'C',rangeLowMidi:57,rangeHighMidi:72,instrumentId:'trumpet'},
  ]) assert.equal(policy.isFreeStaffJumperSetup(setup),true,'Every Easy setup remains free')
  for (const difficulty of ['medium','hard']) assert.equal(policy.isFreeStaffJumperSetup({difficulty}),false,`${difficulty} requires Plus`)

  memory.set('besttake:plus-development:v1', JSON.stringify({ alphaUnlocked:true, trialStartedAt:Date.now() }))
  memory.set('besttake:plus-internal-preview:v1', JSON.stringify({ internalPreviewExpiresAt:Date.now()+86400000 }))
  for (const dev of [false,true]) {
    const web = await load('src/plus/plusAccess.ts',{dev})
    await web.refreshPlusAccess()
    assert.equal(web.canUsePlus(),false,'Saved code/trial flags cannot unlock any browser build')
    assert.equal(web.redeemAlpha,undefined,'No custom redemption API exists')
    assert.equal(web.requirePlus('music'),false)
    assert.equal(web.getPlusRequest().feature,'music')
    await assert.rejects(()=>web.startPlusTrial())
    await assert.rejects(()=>web.purchasePlus())
  }

  let status={...empty,price:'$9.99',purchaseAvailable:true,trialAvailable:true}
  let outcome='cancelled', listener
  globalThis.__plusBridge={getStatus:async()=>status,purchase:async()=>({...status,outcome}),startTrial:async()=>({...status,outcome}),restore:async()=>status,addListener:async(_,fn)=>{listener=fn;return {remove:async()=>{}}}}
  const native = await load('src/plus/plusAccess.ts',{native:true})
  native.initializePlusAccess(); await native.refreshPlusAccess()
  assert.equal(native.redeemAlpha,undefined)
  status={...status,alphaUnlocked:true,canRedeemAlpha:true};listener(status)
  assert.equal(native.canUsePlus(),false,'Native sandbox/debug status cannot revive old code grants')
  const previewExpires=Date.now()+86400000
  status={...status,internalPreviewExpiresAt:previewExpires};listener(status)
  assert.equal(native.canUsePlus(),true,'Internal preview works even without purchased or trial entitlements')
  assert.equal(native.getPlusSnapshot().purchased,false)
  assert.equal(native.getPlusSnapshot().trialStartedAt,null,'Preview does not consume the StoreKit trial')
  let previewResumed=0
  native.showPlus('music',()=>previewResumed++)
  native.closePlus(true)
  assert.equal(previewResumed,1,'Temporary access resumes a requested Plus feature')
  const previewNow=Date.now
  try {
    Date.now=()=>previewExpires
    for(const {fn} of [...scheduled.values()]) fn()
    assert.equal(native.canUsePlus(),false)
    assert.equal(native.getPlusSnapshot().active,false,'Internal preview expiry updates visible access without restart')
  } finally { Date.now=previewNow }
  listener({...status,internalPreviewExpiresAt:previewExpires})
  assert.equal(native.canUsePlus(),false,'Clock rollback and a stale response cannot revive a preview expired during this session')
  listener({...status,internalPreviewExpiresAt:previewExpires+1})
  assert.equal(native.canUsePlus(),true,'A separately issued later deadline can be evaluated normally')
  delete status.internalPreviewExpiresAt
  listener(status)
  assert.equal(native.canUsePlus(),false,'A normal native status with no preview field clears earlier preview access')
  assert.equal(native.getPlusSnapshot().internalPreviewExpiresAt,null)
  const started=Date.now(), expires=started+policy.PLUS_TRIAL_MS
  status={...status,trialStartedAt:started,trialExpiresAt:expires};listener(status)
  assert.equal(native.canUsePlus(),true,'A verified StoreKit trial remains supported')
  const actualNow=Date.now
  try {
    Date.now=()=>expires
    for(const {fn} of [...scheduled.values()]) fn()
    assert.equal(native.canUsePlus(),false)
    assert.equal(native.getPlusSnapshot().active,false,'Verified trial expiry updates UI without restart')
  } finally { Date.now=actualNow }
  status={...status,trialStartedAt:null,trialExpiresAt:null};listener(status)
  assert.equal(await native.purchasePlus(),false,'Cancelled purchase grants nothing')
  outcome='pending'
  await assert.rejects(()=>native.purchasePlus(),/awaiting approval/)
  assert.equal(native.canUsePlus(),false)
  let resumed=0
  native.requirePlus('youtube',()=>resumed++)
  native.closePlus(true)
  assert.equal(resumed,0,'Dismissal cannot resume a paid action without entitlement')
  status={...status,purchased:true};listener(status)
  assert.equal(native.canUsePlus(),true,'Transaction updates grant verified approval')
  assert.equal(await native.restorePlus(),true)
  status={...status,purchased:false};listener(status)
  assert.equal(native.canUsePlus(),false,'Revocation removes access')
  globalThis.__plusBridge.getStatus=async()=>{throw Error('offline')}
  await native.refreshPlusAccess()
  assert.equal(native.canUsePlus(),false,'Bridge failure fails closed')

  memory.clear()
  let activeRoutine=null, paid=false, prompts=0
  globalThis.__routineFixture={active:()=>activeRoutine,paid:()=>paid,prompt:()=>{prompts++;return false}}
  const routines=await load('src/utils/routineLibrary.ts',{stubs:{practiceRoutines:'export const parseRoutine=x=>x,parseStep=x=>x,loadRoutine=()=>globalThis.__routineFixture.active()',plusAccess:'export const canUsePlus=()=>globalThis.__routineFixture.paid(),requirePlus=()=>globalThis.__routineFixture.prompt()'}})
  const first={id:'first',updatedAt:1},second={id:'second',updatedAt:1},shared={id:'shared',updatedAt:1}
  assert.equal(routines.canSaveRoutine(first),true)
  routines.storeLibraryRoutine(first)
  assert.equal(routines.canSaveRoutine({...first,updatedAt:2}),true)
  assert.equal(routines.canSaveRoutine(second),false)
  assert.throws(()=>routines.storeLibraryRoutine(second),/Plus/)
  routines.storeLibraryRoutine(shared,{shared:true})
  assert.equal(routines.loadRoutineLibrary().length,2,'Shared plans open beyond authored cap')
  assert.equal(routines.canSaveRoutine(shared),true)
  paid=true;routines.storeLibraryRoutine(second);paid=false
  assert.equal(routines.canSaveRoutine(second),true,'Existing routine stays editable after downgrade')
  assert.equal(routines.loadRoutineLibrary().length,3,'Downgrade does not delete data')
  memory.clear();activeRoutine=first
  assert.equal(routines.canSaveRoutine(second),false,'Today’s unshelved routine counts toward limit')
  assert.ok(prompts>0)
  console.log('PASS: Plus entitlements, internal preview expiry/isolation, Staff Jumper Easy/paid levels, verified trial expiry, rejected legacy code flags in every build, purchases, restore/revocation, and routine limits.')
} finally { globalThis.setTimeout=nativeSetTimeout; globalThis.clearTimeout=nativeClearTimeout }

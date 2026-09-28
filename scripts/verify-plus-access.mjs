import assert from 'node:assert/strict'
import { build } from 'esbuild'

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
  const policy = await load('src/plus/plusPolicy.ts')
  const empty = { purchased:false, alphaUnlocked:false, canRedeemAlpha:false, trialStartedAt:null, trialExpiresAt:null }
  assert.equal(policy.hasPlusAccess(empty, 100), false)
  assert.equal(policy.hasPlusAccess({...empty,alphaUnlocked:true},100),false,'Production ignores an alpha flag')
  assert.equal(policy.hasPlusAccess({...empty,alphaUnlocked:true,canRedeemAlpha:true},100),true)
  assert.equal(policy.hasPlusAccess({...empty,purchased:true},1e15),true,'Lifetime access does not expire')
  const trial = {...empty,trialStartedAt:100,trialExpiresAt:200}
  assert.equal(policy.hasPlusAccess(trial,99),false)
  assert.equal(policy.hasPlusAccess(trial,100),true)
  assert.equal(policy.hasPlusAccess(trial,199),true)
  assert.equal(policy.hasPlusAccess(trial,200),false)
  for (const key of ['C','G','F','D','Bb','Eb']) assert.equal(policy.isFreeStaffJumperSetup({key,mode:'major',range:'1-octave',difficulty:'medium'}),true)
  assert.equal(policy.isFreeStaffJumperSetup({key:'C',mode:'major',range:'2-octaves',difficulty:'easy',rangeLowMidi:58,rangeHighMidi:72,instrumentId:'trumpet'}),true,'The graded trumpet Easy range is free even when it spans more than 12 semitones')
  assert.equal(policy.isFreeStaffJumperSetup({key:'C',mode:'major',range:'2-octaves',difficulty:'easy',rangeLowMidi:57,rangeHighMidi:72,instrumentId:'trumpet'}),false,'A wider custom range still needs Plus')
  for (const patch of [{key:'B'},{mode:'minor'},{range:'2-octaves'},{difficulty:'hard'},{customScale:[0,2,4]}]) assert.equal(policy.isFreeStaffJumperSetup({key:'C',mode:'major',range:'1-octave',difficulty:'easy',...patch}),false)

  const dev = await load('src/plus/plusAccess.ts',{dev:true})
  await dev.refreshPlusAccess()
  assert.equal(dev.canUsePlus(),false)
  assert.equal(dev.requirePlus('music'),false)
  assert.equal(dev.getPlusRequest().feature,'music')
  await assert.rejects(()=>dev.redeemAlpha('wrong'))
  await dev.redeemAlpha('  ALPHA  ')
  assert.equal(dev.canUsePlus(),true)
  const reloaded = await load('src/plus/plusAccess.ts',{dev:true})
  await reloaded.refreshPlusAccess()
  assert.equal(reloaded.canUsePlus(),true,'Test alpha survives reload')
  const production = await load('src/plus/plusAccess.ts')
  await production.refreshPlusAccess()
  assert.equal(production.canUsePlus(),false,'Production must ignore dev storage')
  await assert.rejects(()=>production.redeemAlpha('alpha'))
  await assert.rejects(()=>production.startPlusTrial())

  memory.clear()
  const preview = await load('src/plus/plusAccess.ts',{dev:true})
  await preview.refreshPlusAccess()
  assert.equal(await preview.startPlusTrial(),true)
  const {trialStartedAt,trialExpiresAt} = preview.getPlusSnapshot()
  assert.equal(trialExpiresAt-trialStartedAt,policy.PLUS_TRIAL_MS)
  await assert.rejects(()=>preview.startPlusTrial(),/already been used/)
  const actualNow=Date.now
  try {
    Date.now=()=>trialExpiresAt
    for(const {fn} of [...scheduled.values()]) fn()
    assert.equal(preview.canUsePlus(),false)
    assert.equal(preview.getPlusSnapshot().active,false,'Expiry publishes to UI without restart')
  } finally { Date.now=actualNow }

  let status={...empty,price:'$9.99',purchaseAvailable:true,trialAvailable:true}
  let outcome='cancelled', listener
  globalThis.__plusBridge={getStatus:async()=>status,purchase:async()=>({...status,outcome}),startTrial:async()=>({...status,outcome}),restore:async()=>status,addListener:async(_,fn)=>{listener=fn;return {remove:async()=>{}}},redeemAlpha:async()=>{throw Error('Production requires Apple offer code')}}
  const native = await load('src/plus/plusAccess.ts',{native:true})
  native.initializePlusAccess(); await native.refreshPlusAccess()
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
  console.log('PASS: Plus entitlements, trial boundaries, alpha environment isolation, pending/cancelled purchases, restore/revocation, and routine limits.')
} finally { globalThis.setTimeout=nativeSetTimeout; globalThis.clearTimeout=nativeClearTimeout }

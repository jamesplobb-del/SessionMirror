import assert from 'node:assert/strict'
import { build } from 'esbuild'

const calls = []
const timers = new Map()
let timerId = 0
let native = true
const handler = { postMessage: message => calls.push(['direct', message]) }
globalThis.window = {
  webkit: { messageHandlers: { bestTakeHaptics: handler } },
  setTimeout: fn => { timers.set(++timerId, fn); return timerId },
  clearTimeout: id => timers.delete(id),
}
globalThis.__hapticPlugin = {
  prepareHaptics: async () => calls.push(['prepare']),
  hapticImpact: async options => calls.push(['plugin', options]),
  hapticNotification: async options => calls.push(['notification', options]),
}
globalThis.__capacitorFallback = { impact: async options => calls.push(['fallback', options]) }
globalThis.__native = () => native

const bundle = await build({
  entryPoints: ['src/utils/haptics.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'fake-native-transport', setup(b) {
    b.onResolve({ filter: /^@capacitor\/(core|haptics)$/ }, a => ({ path: a.path, namespace: 'mock' }))
    b.onResolve({ filter: /audioSessionRoute$/ }, () => ({ path: 'audio', namespace: 'mock' }))
    b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents:
      a.path === 'audio' ? 'export default globalThis.__hapticPlugin' :
      a.path.endsWith('/core') ? 'export const Capacitor = {isNativePlatform: globalThis.__native, getPlatform: () => "ios"}' :
      'export const Haptics=globalThis.__capacitorFallback; export const ImpactStyle={Light:"LIGHT", Medium:"MEDIUM", Heavy:"HEAVY"}; export const NotificationType={Success:"SUCCESS",Warning:"WARNING",Error:"ERROR"}'
    }))
  }}],
})
const module = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const settle = async () => { for(let i=0;i<12;i++) await Promise.resolve() }
calls.length = 0
module.triggerLightHaptic()
assert.equal(calls.length, 1)
assert.equal(calls[0][0], 'direct', 'A tap must bypass the audio/plugin queue')
assert.equal(calls[0][1].kind, 'impact')
assert.equal(typeof calls[0][1].sentAt, 'number')
await settle()
assert.equal(calls.length, 1, 'Direct feedback must not also fire a plugin pulse')
assert.equal(timers.size, 0, 'Direct taps must not schedule bridge re-prime traffic')
module.setHapticsEnabled(false)
module.triggerMediumHaptic(); module.triggerSuccessHaptic()
assert.equal(calls.length, 1, 'Global preference gates both direct feedback types')
module.setHapticsEnabled(true)
module.triggerLightHaptic(false)
assert.equal(calls.length, 1, 'Per-control preference still works')
module.triggerSuccessHaptic()
assert.equal(calls.at(-1)[1].kind, 'notification')

// An older installed host has no fast channel. It must still work.
delete window.webkit.messageHandlers.bestTakeHaptics
calls.length = 0
module.triggerModeSwitchHaptic()
await settle()
assert.equal(calls.filter(c=>c[0]==='plugin').length, 1)
assert.equal(calls[0][1].style, 'rigid')

// Host disposal may throw between lookup and post; fall back exactly once.
window.webkit.messageHandlers.bestTakeHaptics = { postMessage: () => { throw Error('disposed') } }
calls.length = 0
module.triggerLightHaptic()
await settle()
assert.equal(calls.filter(c=>c[0]==='plugin').length, 1)

globalThis.__hapticPlugin.hapticImpact = async () => { throw Error('old plugin missing') }
calls.length = 0
module.triggerLightHaptic()
await settle()
assert.equal(calls.filter(c=>c[0]==='fallback').length, 1)
console.log('PASS: direct UI channel, single pulse, global/per-control preferences, no per-tap queue traffic, old-host and disposed-host fallbacks.')

// Exercise the real drag hook's callbacks without a browser gesture driver.
// (Desktop CUA sends a single pointermove with buttons=0, so it cannot model
// a held touch.) Keep a drag from generating React state updates per frame.
let dismissed = 0
let starts = 0
const dragBundle = await build({
  entryPoints:['src/hooks/useSheetDragDismiss.ts'], bundle:true, write:false, format:'esm', platform:'node',
  plugins:[{name:'hook-runtime',setup(b){
    b.onResolve({filter:/^(react|framer-motion)$/},a=>({path:a.path,namespace:'drag-mock'}))
    b.onResolve({filter:/usePrefersReducedMotion$/},()=>({path:'reduced',namespace:'drag-mock'}))
    b.onLoad({filter:/.*/,namespace:'drag-mock'},a=>({contents:a.path==='react'
      ? 'export const useCallback=f=>f; export const useMemo=f=>f();'
      : a.path==='reduced' ? 'export const usePrefersReducedMotion=()=>false;'
      : 'export const useDragControls=()=>({start:()=>globalThis.__dragStart()});export function useMotionValue(initial){let value=initial;return{get:()=>value,set:next=>{value=next}}}' }))
  }}],
})
globalThis.__dragStart=()=>{ starts++ }
const {useSheetDragDismiss}=await import(`data:text/javascript;base64,${Buffer.from(dragBundle.outputFiles[0].text).toString('base64')}`)
const drag=useSheetDragDismiss({enabled:true,slideDistance:800,onDismiss:()=>{dismissed++}})
const info=(y,velocity=0)=>({offset:{x:0,y},velocity:{x:0,y:velocity}})
drag.dragHandleProps.onPointerDown({})
assert.equal(starts,1)
drag.sheetDragProps.onDragStart()
for(let y=0;y<150;y+=2) drag.sheetDragProps.onDrag(null,info(y))
assert.ok(drag.backdropOpacity.get()<1)
drag.sheetDragProps.onDragEnd(null,info(60))
assert.equal(dismissed,0)
assert.equal(drag.backdropOpacity.get(),1,'Short drag restores the backdrop')
drag.sheetDragProps.onDragEnd(null,info(220))
assert.equal(dismissed,1,'A long downward drag dismisses')
drag.sheetDragProps.onDragEnd(null,info(15,850))
assert.equal(dismissed,2,'A short fast flick dismisses')
drag.sheetDragProps.onDragEnd(null,info(-200,-800))
assert.equal(dismissed,2,'An upward drag cannot dismiss')
const disabled=useSheetDragDismiss({enabled:false,slideDistance:800,onDismiss:()=>{dismissed++}})
assert.equal(disabled.sheetDragProps.drag,undefined)
disabled.dragHandleProps.onPointerDown({})
assert.equal(starts,1)
console.log('PASS: repeated drag updates use motion values, short-drag recovery, distance/velocity dismissal, upward and disabled gesture guards.')

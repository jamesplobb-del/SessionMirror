// Production Drawer/helper with isolated hook and element ports. No live DOM.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { writeFileSync, unlinkSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const file = new URL(`.music-widget-drawer-ssr-${process.pid}.mjs`, import.meta.url)
const real = await build({ entryPoints: ['src/components/MusicWidgetDrawer.tsx'], bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' })
let DrawerSSR
try {
  writeFileSync(file, real.outputFiles[0].text)
  DrawerSSR = (await import(file.href)).default
} finally {
  unlinkSync(file)
}
const html = open => renderToStaticMarkup(React.createElement(DrawerSSR, { open, onOpenChange() {} }))
const dockTag = value => value.match(/<div[^>]*id="music-widget-dock"[^>]*>/)[0]
const closed = html(false), opened = html(true)
assert.match(dockTag(closed), /inert=""/)
assert.match(dockTag(closed), /aria-hidden="true"/)
assert.doesNotMatch(dockTag(opened), /inert/)
assert.match(dockTag(opened), /aria-hidden="false"/)
const handleTag = closed.match(/<button[^>]*>/)[0]
assert.match(handleTag, /aria-label="Show music tools"/)
assert.match(handleTag, /aria-expanded="false"/)
assert.doesNotMatch(handleTag, /inert|aria-hidden/)

class Hooks {
  slots = []; cursor = 0; effects = []
  useRef(value) { return this.slots[this.cursor++] ??= { current: value } }
  useLayoutEffect(fn, deps) {
    const i = this.cursor++, old = this.slots[i]
    if (old && deps.every((v, j) => Object.is(v, old.deps[j]))) return
    this.slots[i] = { deps, cleanup: old?.cleanup }
    this.effects.push(() => {
      this.slots[i].cleanup?.()
      this.slots[i].cleanup = fn()
    })
  }
  unmount() {
    for (const slot of this.slots) slot?.cleanup?.()
    this.slots = []
  }
  render(fn, props, attach) {
    this.cursor = 0; this.effects = []; globalThis.__drawerHooks = this
    const tree = fn(props); attach(tree)
    for (const effect of this.effects) effect()
    return tree
  }
}
const mocks = {
  react: 'const h=()=>globalThis.__drawerHooks;export const useRef=v=>h().useRef(v),useLayoutEffect=(...a)=>h().useLayoutEffect(...a);',
  'react/jsx-runtime': 'export const jsx=(type,props)=>({type,props}),jsxs=jsx;',
  'lucide-react': 'export const ChevronLeft="svg",ChevronRight="svg";',
}
const compiled = await build({ stdin: { contents: "export {default as Drawer} from './src/components/MusicWidgetDrawer';export {focusWidgetLauncher} from './src/utils/widgetFocus';export {MUSIC_DOCK_ARRIVAL_EVENT} from './src/utils/widgetDockMotion'", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', plugins: [{ name: 'hook-ports', setup(b) {
  b.onResolve({ filter: /.*/ }, a => mocks[a.path] ? { path: a.path, namespace: 'fixture' } : undefined)
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: mocks[a.path] }))
} }] })
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
class TrackedEvents extends EventTarget {
  listeners = new Map()
  addEventListener(type, listener, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(listener)
    super.addEventListener(type, listener, options)
  }
  removeEventListener(type, listener, options) {
    this.listeners.get(type)?.delete(listener)
    super.removeEventListener(type, listener, options)
  }
  count(type) { return this.listeners.get(type)?.size ?? 0 }
}
const preference = new TrackedEvents()
preference.matches = false
const windowEvents = new TrackedEvents()
windowEvents.matchMedia = query => {
  assert.equal(query, '(prefers-reduced-motion: reduce)')
  return preference
}
globalThis.window = windowEvents
let pulses = [], railVisible = true
const rail = {
  getClientRects: () => railVisible ? [1] : [],
  animate(frames, options) {
    const pulse = { frames, options, cancelled: false, cancel() { this.cancelled = true } }
    pulses.push(pulse)
    return pulse
  },
}
const arrive = id => {
  const event = new Event(api.MUSIC_DOCK_ARRIVAL_EVENT)
  event.detail = { id }
  windowEvents.dispatchEvent(event)
}
let focused = [], active = null, inert = false, changes = []
const focus = label => ({ focus(options) { assert.deepEqual(options, { preventScroll: true }); focused.push(label) } })
const handle = focus('handle'), launcher = focus('launcher')
const drawer = { querySelector: s => s === '.music-widget-drawer__handle' ? handle : null }
const dock = { ownerDocument: { get activeElement() { return active } }, contains: el => el === launcher, closest: () => drawer, querySelectorAll: selector => { assert.equal(selector, '[data-music-dock-id]'); return [{ dataset: { musicDockId: 'desk-drone' } }] } }
launcher.closest = s => { assert.equal(s, '#music-widget-dock[inert]'); return inert ? dock : null }
api.focusWidgetLauncher(launcher)
assert.deepEqual(focused, ['launcher'], 'Open/mobile launcher gets focus normally')
inert = true; api.focusWidgetLauncher(launcher)
assert.deepEqual(focused, ['launcher', 'handle'], 'Already-closed dock redirects to Show handle')
api.focusWidgetLauncher(null); api.focusWidgetLauncher(undefined)
const h = new Hooks()
const attach = tree => {
  tree.props.ref.current = rail
  tree.props.children[0].props.ref.current = handle
  tree.props.children[1].props.ref.current = dock
}
const props = open => ({ open, onOpenChange: value => changes.push(value) })
h.render(api.Drawer, props(true), attach)
active = launcher; focused = []
h.render(api.Drawer, props(false), attach)
assert.deepEqual(focused, ['handle'], 'External close restores focus from inside dock')
active = {}; focused = []
h.render(api.Drawer, props(true), attach)
let tree = h.render(api.Drawer, props(false), attach)
assert.deepEqual(focused, [], 'External close leaves outside focus alone')
const button = tree.props.children[0]
button.props.onClick({ detail: 0 }); assert.equal(changes.at(-1), true)
const target = { id: 'handle', setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} }
const event = x => ({ button: 0, pointerId: 1, clientX: x, currentTarget: target, target })
button.props.onPointerDown(event(100)); button.props.onPointerUp(event(50)); assert.equal(changes.at(-1), true)
const beforeClick = changes.length
button.props.onClick({ detail: 1 }); assert.equal(changes.length, beforeClick, 'Trailing swipe click is suppressed')
button.props.onPointerDown(event(50)); button.props.onPointerUp(event(100)); assert.equal(changes.at(-1), false)
button.props.onPointerDown(event(100)); button.props.onPointerCancel(); button.props.onPointerUp(event(50))
assert.equal(changes.at(-1), false, 'Canceled swipe does not change disclosure')
const changeCount = changes.length
assert.equal(windowEvents.count(api.MUSIC_DOCK_ARRIVAL_EVENT), 1, 'Exactly one arrival listener after disclosure changes')
assert.equal(preference.count('change'), 1)
arrive('unrelated-tool'); arrive(undefined)
assert.equal(pulses.length, 0, 'Unknown or missing dock IDs cannot pulse the rail')
arrive('desk-drone')
assert.equal(pulses.length, 1, 'Known tool arrival pulses once')
assert.equal(pulses[0].options.duration, 300)
assert.equal(pulses[0].frames[1].translate, '-3px 0', 'Closed handle gently responds')
assert.equal(tree.props.children[1].props.inert, true)
assert.equal(tree.props.children[1].props['aria-hidden'], true)
assert.equal(tree.props.children[0].props['aria-expanded'], false)
assert.match(tree.props.className, /music-widget-drawer--closed/)
assert.equal(changes.length, changeCount, 'Arrival preserves closed disclosure and its inert state')
arrive('desk-drone')
assert.equal(pulses.length, 2); assert.equal(pulses[0].cancelled, true, 'Rapid arrivals cancel the prior pulse')
const closedPulse = pulses.at(-1)
tree = h.render(api.Drawer, props(true), attach)
assert.equal(closedPulse.cancelled, true, 'Opening cancels previous closed-rail pulse')
assert.equal(windowEvents.count(api.MUSIC_DOCK_ARRIVAL_EVENT), 1, 'Opening replaces rather than duplicates arrival listener')
assert.equal(preference.count('change'), 1)
assert.equal(tree.props.children[1].props.inert, false)
arrive('desk-drone')
assert.equal(pulses.at(-1).frames[1].translate, '-4px 0', 'Open rail acknowledges arrival using its own response')
const activePulse = pulses.at(-1)
preference.matches = true; preference.dispatchEvent(new Event('change'))
assert.equal(activePulse.cancelled, true, 'Changing to reduced motion cancels an in-flight pulse')
const beforeReduced = pulses.length
arrive('desk-drone')
assert.equal(pulses.length, beforeReduced, 'Reduced motion skips the rail pulse')
preference.matches = false; preference.dispatchEvent(new Event('change'))
railVisible = false; arrive('desk-drone')
assert.equal(pulses.length, beforeReduced, 'A hidden rail does not animate')
railVisible = true; arrive('desk-drone')
const lastPulse = pulses.at(-1)
assert.equal(lastPulse.cancelled, false)
h.unmount()
assert.equal(lastPulse.cancelled, true, 'Unmount cancels the active pulse')
assert.equal(windowEvents.count(api.MUSIC_DOCK_ARRIVAL_EVENT), 0, 'Unmount unregisters arrival listener')
assert.equal(preference.count('change'), 0, 'Unmount unregisters preference listener')
const beforeUnmountArrival = pulses.length
arrive('desk-drone'); preference.matches = true; preference.dispatchEvent(new Event('change'))
assert.equal(pulses.length, beforeUnmountArrival, 'No post-unmount arrival reaches the removed effect')
console.log('PASS: actual Drawer SSR closed dock inert/aria-hidden, handle unaffected, reopened dock restored; isolated production effect/callback external close, inside/outside focus, click/swipe/cancel; actual helper normal/closed/null launcher focus. Production arrival effect: known/unknown IDs, closed disclosure, rapid-arrival cancellation, open-state replacement, reduced-motion skip/change cancellation, hidden rail, and unmount listener/animation cleanup. No live DOM/browser/VoiceOver.')

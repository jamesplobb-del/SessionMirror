// Isolated real component-function/effect fixture, not a DOM/browser renderer.
// Repository, React hook scheduler and visual wrappers are mocked; callbacks,
// effects, analytics, profile persistence and JSX branch selection are actual code.
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const memory = new Map()
let failStorage = false
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => { if (failStorage) throw Error('Storage unavailable'); memory.set(key, value) },
}
globalThis.window = new EventTarget()
const timers = new Map()
let nextTimer = 1
window.setTimeout = callback => { const id = nextTimer++; timers.set(id, callback); return id }
window.clearTimeout = id => timers.delete(id)
const requests = []
globalThis.__insightsFixture = {
  list: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
  confirm: async () => true, alert: async () => {},
}
const dependenciesEqual = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
class ComponentHarness {
  slots = []
  cursor = 0
  dirty = false
  stateWrites = 0
  effects = []
  useState(initial) {
    const index = this.cursor++
    if (!this.slots[index]) this.slots[index] = { value: typeof initial === 'function' ? initial() : initial }
    const slot = this.slots[index]
    return [slot.value, update => {
      const value = typeof update === 'function' ? update(slot.value) : update
      if (!Object.is(value, slot.value)) { slot.value = value; this.dirty = true; this.stateWrites++ }
    }]
  }
  useRef(value) { const index = this.cursor++; return this.slots[index] ??= { current: value } }
  useMemo(compute, deps) {
    const index = this.cursor++
    if (!dependenciesEqual(this.slots[index]?.deps, deps)) this.slots[index] = { value: compute(), deps }
    return this.slots[index].value
  }
  useCallback(callback, deps) { return this.useMemo(() => callback, deps) }
  useEffect(callback, deps) {
    const index = this.cursor++
    if (dependenciesEqual(this.slots[index]?.deps, deps)) return
    const previous = this.slots[index]
    this.slots[index] = { deps, cleanup: previous?.cleanup }
    this.effects.push(() => { previous?.cleanup?.(); this.slots[index].cleanup = callback() })
  }
  useSyncExternalStore(subscribe, snapshot) {
    const index = this.cursor++
    if (!this.slots[index]) this.slots[index] = { cleanup: subscribe(() => { this.dirty = true }) }
    return snapshot()
  }
  render(props = this.props) {
    this.props = props
    for (let pass = 0; pass < 30; pass++) {
      this.dirty = false; this.cursor = 0; this.effects = []
      globalThis.__insightsHooks = this
      this.tree = Screen(this.props)
      for (const effect of this.effects) effect()
      if (!this.dirty) return this.tree
    }
    throw Error('Component did not settle')
  }
  unmount() { for (const slot of this.slots) slot?.cleanup?.() }
}
const mocks = {
  react: "const h=()=>globalThis.__insightsHooks; export const useState=(...a)=>h().useState(...a),useRef=(...a)=>h().useRef(...a),useMemo=(...a)=>h().useMemo(...a),useCallback=(...a)=>h().useCallback(...a),useEffect=(...a)=>h().useEffect(...a),useSyncExternalStore=(...a)=>h().useSyncExternalStore(...a)",
  'react/jsx-runtime': 'export const jsx=(type,props)=>({type,props}),jsxs=jsx; export const Fragment="Fragment"',
  'framer-motion': 'export const AnimatePresence="AnimatePresence"',
  'lucide-react': 'export const BarChart3="BarChart3",ChevronLeft="ChevronLeft",Clock3="Clock3",Plus="Plus",RotateCcw="RotateCcw",X="X"',
  visual: 'export default "VisualWrapper"; export const PremiumMotionDiv="PremiumMotionDiv"',
  actions: 'export const useActionSheet=()=>({showAlert:globalThis.__insightsFixture.alert,showConfirm:globalThis.__insightsFixture.confirm})',
  haptics: 'export const triggerLightHaptic=()=>{}',
  repository: 'export const listPitchObservations=()=>globalThis.__insightsFixture.list();export const clearPitchObservations=()=>globalThis.__insightsFixture.clear(),deletePitchObservationsInRange=async()=>{};export const PITCH_INSIGHTS_UPDATED_EVENT="fixture:pitch-update"',
}
const result = await build({
  entryPoints: ['src/components/audioPractice/PitchInsightsScreen.tsx'], bundle: true, write: false,
  platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'isolated-component-lifecycle', setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      const path = mocks[args.path] ? args.path : args.path.includes('/ui/') ? 'visual' : args.path.includes('ActionSheetContext') ? 'actions' : args.path.endsWith('/haptics') ? 'haptics' : args.path.endsWith('/pitchInsightsRepository') ? 'repository' : null
      if (path) return { path, namespace: 'fixture' }
    })
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path] }))
  } }],
})
const { default: Screen } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...nodes(tree.props?.children)]
}
function textOf(tree) {
  if (Array.isArray(tree)) return tree.map(textOf).join(' ')
  if (!tree || typeof tree === 'boolean') return ''
  if (typeof tree !== 'object') return String(tree)
  return textOf(tree.props?.children)
}
const find = (harness, predicate) => { const node = nodes(harness.tree).find(predicate); assert.ok(node, 'Expected rendered control'); return node }
const settle = async harness => { await Promise.resolve(); await Promise.resolve(); harness.render() }
const props = { isOpen: false, onClose() {}, transpositionId: 'concert', onCaptureEnabledChange() {} }
const harness = new ComponentHarness()
harness.render(props)
assert.equal(requests.length, 0, 'Closed mount executes effects safely without loading history')
harness.render({ ...props, isOpen: true })
assert.equal(requests.length, 1)
assert.match(textOf(harness.tree), /Analyzing pitch history/)
harness.render(props)
const writesAfterClose = harness.stateWrites
requests.shift().resolve([])
await settle(harness)
assert.equal(harness.stateWrites, writesAfterClose, 'An async response after close cannot write state')
harness.render({ ...props, isOpen: true })
requests.shift().resolve([])
await settle(harness)
assert.doesNotMatch(textOf(harness.tree), /Analyzing pitch history/)
assert.match(textOf(harness.tree), /Practice with the live tuner/)

find(harness, node => node.type === 'button' && node.props['aria-label'] === 'Add an instrument').props.onClick()
harness.render()
find(harness, node => node.type === 'input').props.onChange({ target: { value: 'C trumpet' } })
harness.render()
find(harness, node => node.type === 'form').props.onSubmit({ preventDefault() {} })
harness.render()
assert.match(textOf(harness.tree), /C trumpet · C/)
const saved = JSON.parse(memory.get('besttake:pitch-instrument-profiles:v1'))
assert.equal(saved.profiles[0].name, 'C trumpet')
assert.equal(saved.activeId, saved.profiles[0].id)
find(harness, node => node.type === 'button' && node.props['aria-label'] === 'Add an instrument').props.onClick()
harness.render()
find(harness, node => node.type === 'input').props.onChange({ target: { value: 'Flute' } })
harness.render()
failStorage = true
find(harness, node => node.type === 'form').props.onSubmit({ preventDefault() {} })
harness.render()
assert.match(textOf(harness.tree), /Storage unavailable/)
assert.equal(find(harness, node => node.type === 'input').props.value, 'Flute', 'Failed save preserves the instrument-name draft')
failStorage = false
find(harness, node => node.type === 'form').props.onSubmit({ preventDefault() {} })
harness.render()
assert.equal(JSON.parse(memory.get('besttake:pitch-instrument-profiles:v1')).profiles.length, 2, 'Retry creates exactly one second profile')

harness.render(props)
harness.render({ ...props, isOpen: true })
const originalWarn = console.warn
console.warn = () => {}
requests.shift().reject(Error('Database temporarily unavailable'))
await settle(harness)
console.warn = originalWarn
assert.match(textOf(harness.tree), /temporarily unavailable/)
find(harness, node => node.type === 'button' && textOf(node) === 'Try again').props.onClick()
const profiles = JSON.parse(memory.get('besttake:pitch-instrument-profiles:v1')).profiles
const rows = profiles.map(profile => ({ id: profile.id, midiNote: 60, noteName: 'C4', octave: 4, centsOffset: 1, observedAt: Date.now(), durationMs: 1800, sampleCount: 36, variabilityCents: 1, tunerInstrument: 'winds', transpositionId: 'concert', sessionId: 'shared', instrumentProfileId: profile.id, instrumentProfileName: profile.name }))
requests.shift().resolve(rows)
await settle(harness)
assert.doesNotMatch(textOf(harness.tree), /temporarily unavailable/)
assert.doesNotMatch(textOf(harness.tree), /Practice with the live tuner/)
const event = new Event('fixture:pitch-update')
event.detail = { kind: 'session-range-deleted', sessionId: 'shared', startAt: 0, endAt: Date.now() + 1000, transpositionId: 'concert', instrumentProfileId: profiles[0].id }
window.dispatchEvent(event)
harness.render()
assert.doesNotMatch(textOf(harness.tree), /Practice with the live tuner/, 'An origin-profile noisy deletion leaves the selected same-key profile’s visible history intact')
assert.deepEqual(harness.slots[0].value.map(row => row.instrumentProfileId), [profiles[1].id], 'Actual Insights event callback removes only the scoped origin profile')
harness.render(props)
harness.render({ ...props, isOpen: true })
harness.unmount()
const writesAfterUnmount = harness.stateWrites
requests.shift().resolve([])
await Promise.resolve(); await Promise.resolve()
assert.equal(harness.stateWrites, writesAfterUnmount, 'Unmounted load cannot write state')
assert.equal(timers.size, 0)
console.log('PASS: actual Insights component function/effects: closed mount, open load, stale close/unmount response, reopen, failed load/retry, named-profile save failure/draft/retry (isolated hooks; no DOM)')

// New race: start actual Reset All callback, close/reopen before deletion resolves.
let completeClear
__insightsFixture.clear = () => new Promise(resolve => { completeClear = () => {
  const event = new Event('fixture:pitch-update'); event.detail = {kind:'cleared'};
  window.dispatchEvent(event); resolve();
} })
const race = new ComponentHarness()
race.render({...props,isOpen:true})
requests.shift().resolve(rows)
await settle(race)
find(race,node=>node.type==='button' && textOf(node).startsWith('Days ·')).props.onClick()
race.render()
const daysView=find(race,node=>typeof node.type==='function' && node.props.onResetAll)
daysView.props.onResetAll()
await Promise.resolve(); await Promise.resolve()
assert.equal(typeof completeClear,'function','Actual Reset All starts deferred deletion after confirmation')
race.render(props)
race.render({...props,isOpen:true})
assert.match(textOf(race.tree),/Analyzing pitch history/)
completeClear()
await settle(race)
requests.shift().resolve([])
await settle(race)
assert.match(textOf(race.tree),/Analyzing pitch history/,'BUG: a clear event invalidates the reopened load without releasing loading or replacing that read')
assert.equal(requests.length,0,'No replacement read is queued')
console.log('CONFIRMED P2: actual Reset All callback + close/reopen + deferred clear completion leaves Pitch Insights analyzing indefinitely; isolated actual component/effects, repository I/O mocked.')
race.unmount()

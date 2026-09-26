import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Run the real camera replay effect, replacing React/device boundaries only.
const source = ts.createSourceFile('LiveCameraBackground.tsx', readFileSync('src/components/LiveCameraBackground.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let effect
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes('const wantsPlayback =')) effect = node.arguments[0].getText(source)
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(effect)
const appText = readFileSync('src/App.tsx', 'utf8')
assert.match(appText, /handsFreePlaybackPerformanceStartSeconds=\{handsFreeBackgroundTake\?\.performanceStartSeconds\}/,
  'Camera replay receives the saved performance onset')
const js = ts.transpileModule(`const effect = ${effect}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
function harness() {
  let now = 0, sequence = 0, completed = 0, starts = 0, restored = 0, ready = false
  const timers = new Map(), intervals = new Map(), events = new Map(), order = []
  const media = { duration: 10, currentTime: 4, pause() { order.push('pause') }, load() { order.push('load') }, removeAttribute() {},
    addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) }
  const env = {
    recordingMode: 'video', handsFreeTakePlaybackRequested: true,
    handsFreePlaybackSessionRef: { current: false }, handsFreePlaybackVideoRef: { current: media },
    handsFreeStallRecoveryRef: { current: null },
    handsFreePlaybackSrc: 'file:///first.mp4', handsFreePlaybackTakeId: 'first',
    handsFreePlaybackPerformanceStartSeconds: 8,
    handsFreePlaybackTailSkipSeconds: 2,
    window: { setTimeout(fn) { const id = ++sequence; timers.set(id, fn); return id }, clearTimeout: id => timers.delete(id),
      setInterval(fn) { const id = ++sequence; intervals.set(id, fn); return id }, clearInterval: id => intervals.delete(id) },
    performance: { now: () => now },
    setHandsFreePlaybackReady: value => { ready = value },
    onHandsFreePlaybackComplete: () => { completed++ }, onHandsFreePlaybackPlayingChange: value => { if (value) starts++ },
    preparePlaybackRoute: async () => { order.push('route') }, completePlaybackRouteRestore: async () => { restored++ },
    resetVideoPlayback: m => m.pause(), assignMediaPlaybackSrc() { order.push('source') }, withWebKitThumbnailHint: x => x,
    waitForMediaReadyWithRetry: async () => true,
    applyAutoPlaybackLeadIn: async (target, _leadIn, onset) => { target.currentTime = Math.max(0, onset - 1) },
    attachAutoPlaybackTailSkip: () => () => {}, attachVideoDecoderStallRecovery: () => () => {},
    playTakeMediaAudible: async () => { order.push('play'); return true },
  }
  const bindings = Object.fromEntries(Object.entries(env).map(([k,v]) => [k, typeof v === 'function' ? (...args) => env[k](...args) : v]))
  const run = new Function(...Object.keys(bindings), `${js}; return effect`)(...Object.values(bindings))
  return { env, run, media, timers, intervals, events, order, advance: ms => { now += ms }, get stats() { return { completed, starts, restored, ready } } }
}

let h = harness(), route = deferred()
h.env.preparePlaybackRoute = () => route.promise
let cleanup = h.run()
await flush()
assert.ok(!h.order.includes('source'), 'First replay waits for capture teardown before loading a decoder')
route.resolve(); await flush()
assert.equal(h.stats.starts, 1)
assert.equal(h.stats.ready, true)
assert.equal(h.media.currentTime, 7, 'Camera replay starts just before the detected performance')
assert.equal(h.timers.size, 0)
h.events.get('ended')()
assert.equal(h.stats.completed, 1)
assert.equal(h.intervals.size, 0)
cleanup()
assert.equal(h.stats.restored, 1)

h = harness(); const play = deferred()
h.env.playTakeMediaAudible = () => play.promise
cleanup = h.run(); await flush()
assert.equal(h.stats.ready, false, 'Pending play does not cover camera with a frozen frame')
for (const fn of [...h.timers.values()]) fn()
assert.equal(h.stats.completed, 1, 'A hung first play exits the hands-free lock')
play.resolve(true); await flush()
assert.equal(h.stats.starts, 0, 'Late start after timeout is ignored')
cleanup()

h = harness(); cleanup = h.run(); await flush()
h.advance(9000)
for (const fn of [...h.intervals.values()]) fn()
assert.equal(h.stats.completed, 1, 'Frozen playback clock exits instead of waiting forever for ended')
cleanup()

h = harness(); const ready = deferred()
h.env.waitForMediaReadyWithRetry = () => ready.promise
cleanup = h.run(); await flush(); cleanup(); ready.resolve(true); await flush()
assert.ok(!h.order.includes('play'), 'Cancelled readiness cannot launch replay')
assert.equal(h.timers.size, 0)
assert.equal(h.events.size, 0)

h = harness(); cleanup = h.run(); await flush()
h.events.get('error')(); h.events.get('ended')()
assert.equal(h.stats.completed, 1, 'Decode error completes exactly once')
cleanup()

console.log('PASS: camera replay near the performance, startup ordering, pending-play timeout, frozen-clock recovery, cancellation, and decode errors')

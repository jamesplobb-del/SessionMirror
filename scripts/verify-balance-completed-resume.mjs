// Executes the production hook/reducer with controlled hooks, timers and audio.
// No microphone, DOM, native bridge or real persistence is exercised.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = await mkdtemp(join(tmpdir(), 'balance-completed-resume-'))
const hooks = `
const slots=[];let cursor=0,queued=[];
export function begin(){cursor=0}
export function effects(){const q=queued;queued=[];for(const f of q)f()}
export function resetHooks(){for(const s of slots)s?.cleanup?.();slots.length=0;cursor=0;queued=[]}
export function useRef(initial){const i=cursor++;return slots[i]??={current:initial}}
export function useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]}
export function useReducer(reducer,initial,init){const i=cursor++;if(!(i in slots))slots[i]=init?init(initial):initial;return [slots[i],a=>slots[i]=reducer(slots[i],a)]}
function memo(f,deps){const i=cursor++;const old=slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))slots[i]={value:f(),deps};return slots[i].value}
export function useMemo(f,d){return memo(f,d)}
export function useCallback(f,d){return memo(()=>f,d)}
export function useEffect(f,deps){const i=cursor++;const old=slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))queued.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:f()}})}
`
const timers = new Map(), listeners = new Map(), storage = new Map()
let timerId = 0
const listen = (name, fn) => {
  if (!listeners.has(name)) listeners.set(name, new Set())
  listeners.get(name).add(fn)
}
const unlisten = (name, fn) => listeners.get(name)?.delete(fn)
globalThis.window = {
  localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
  setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId },
  clearTimeout: id => timers.delete(id), setInterval: () => ++timerId, clearInterval() {},
  addEventListener: listen, removeEventListener: unlisten,
}
globalThis.document = { visibilityState: 'visible', addEventListener: listen, removeEventListener: unlisten }
globalThis.balancePlannedCalls = []
try {
  await build({
    stdin: { contents: `export * from './src/labs/balance/useBalanceGame';export * from './src/labs/balance/balanceEngine';export { APP_BACKGROUND_SUSPEND_EVENT } from './src/utils/appForeground';export { begin,effects,resetHooks } from 'react';`, resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'bundle.mjs'), loader: { '.svg': 'dataurl' },
    plugins: [{ name: 'controlled-host', setup(b) {
      b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'controlled' }))
      b.onLoad({ filter: /.*/, namespace: 'controlled' }, () => ({ contents: hooks, loader: 'js' }))
      b.onLoad({ filter: /balanceAudio.ts$/ }, () => ({ contents: 'export async function startBalanceTone(){return {stop(){}}} export async function startBalanceCountIn(){return {done:Promise.resolve(),stop(){}}}', loader: 'ts' }))
      b.onLoad({ filter: /haptics.ts$/ }, () => ({ contents: 'export function triggerSuccessHaptic(){}', loader: 'ts' }))
      b.onLoad({ filter: /dailyChallengePlan.ts$/ }, () => ({ contents: 'export function recordPlannedGame(v){globalThis.balancePlannedCalls.push(v)}', loader: 'ts' }))
      b.onLoad({ filter: /gameTestInput.ts$/ }, () => ({ contents: 'export function isGameTestInputOn(){return false}', loader: 'ts' }))
    } }],
  })
  const m = await import(pathToFileURL(join(dir, 'bundle.mjs')))
  let game, now = Date.now()
  const render = () => { m.begin(); game = m.useBalanceGame({ initialInstrumentId: 'trumpet', hapticFeedback: false }); m.effects() }
  const frame = dt => {
    now += dt
    game.handleAcceptedPitchFrame({ timestamp: now, confidence: 1, readout: { midi: game.currentTarget.concertMidi, cents: 0, frequencyHz: 261.625565 } })
    render()
  }
  const finish = () => { frame(1); frame(260); for (let i = 0; i < 30; i++) frame(100); assert.equal(game.state.phase, 'goalReached') }
  const getTimer = ms => {
    const entry = [...timers].find(([, timer]) => timer.ms === ms)
    assert.ok(entry, `scheduled ${ms}ms timer exists`)
    return entry
  }
  const fireTimer = ms => { const [id, timer] = getTimer(ms); timers.delete(id); timer.fn(); render() }
  let cases = 0
  for (const targets of [[60], [60, 62]]) {
    for (const interruptedPhase of ['goalReached', 'noteResults']) {
      for (const interruption of ['button', 'background', 'visibility']) {
        m.resetHooks(); timers.clear(); storage.clear(); globalThis.balancePlannedCalls.length = 0
        render()
        game.updateSettings({ goalSeconds: 3, soundRest: { ...game.state.settings.soundRest, referencePitch: false, countIn: false, restDuration: 'manual' } }); render()
        game.start({ kind: 'daily', id: '2026-10-06', title: 'Resume test', subtitle: '', writtenMidi: targets, goalSeconds: 3, toleranceCents: 10 }); render()
        for (let index = 0; index < targets.length; index++) {
          finish()
          if (interruptedPhase === 'noteResults') fireTimer(700)
          const staleTimer = getTimer(interruptedPhase === 'goalReached' ? 700 : 950)[1].fn
          if (interruption === 'button') game.pause()
          else if (interruption === 'background') for (const fn of listeners.get(m.APP_BACKGROUND_SUSPEND_EVENT) ?? []) fn()
          else { document.visibilityState = 'hidden'; for (const fn of listeners.get('visibilitychange') ?? []) fn(); document.visibilityState = 'visible' }
          // Invoke a queued callback before React would clean up the old effect.
          staleTimer(); render()
          assert.equal(game.state.phase, 'paused', 'stale callback cannot advance a paused note')
          assert.equal(game.state.noteResults.length, index + 1)
          game.resume(); render()
          assert.equal(game.state.phase, interruptedPhase, 'completed note resumes its presentation')
          // Extra accepted input after resume cannot score the completed target.
          frame(100)
          assert.equal(game.state.noteResults.length, index + 1)
          const original = game.state
          assert.equal(m.balanceReducer(original, { type: 'COMPLETE_NOTE', result: original.currentResult }), original, 'duplicate commit is ignored')
          if (interruptedPhase === 'goalReached') fireTimer(700)
          fireTimer(950)
          if (index < targets.length - 1) { assert.equal(game.state.phase, 'resting'); game.skipRest(); render() }
        }
        assert.equal(game.state.phase, 'routineResults')
        render() // Observe state updates made by the persistence effect.
        assert.equal(game.routineResult.completed, true)
        assert.equal(game.routineResult.notesCompleted, targets.length)
        assert.equal(new Set(game.routineResult.noteResults.map(r => r.target.id)).size, targets.length)
        assert.equal(game.data.daily.totalCompleted, 1, 'actual daily storage awards completion once')
        assert.equal(game.data.routineSummaries.length, 1, 'routine is persisted once')
        assert.equal(globalThis.balancePlannedCalls.length, 1)
        assert.equal(globalThis.balancePlannedCalls[0].completed, true, 'planned-game caller receives completed result')
        render(); assert.equal(game.data.daily.totalCompleted, 1)
        cases++
      }
    }
  }
  // Failed attempts still permit retry and replacing their result.
  let state = game.state
  state = m.balanceReducer(state, { type: 'START', targets: state.targets, settings: state.settings, bestBalancedMs: 0 })
  const target = state.targets[0]
  const result = { ...game.routineResult.noteResults[0], target, goalReached: false }
  state = m.balanceReducer(state, { type: 'COMPLETE_NOTE', result })
  state = m.balanceReducer(state, { type: 'RETRY_NOTE' })
  assert.equal(state.noteResults.length, 0)
  state = m.balanceReducer(state, { type: 'COMPLETE_NOTE', result: { ...result, goalReached: true } })
  assert.equal(state.noteResults.length, 1)
  // Unfinished holds retain the prior resume/reacquire policy.
  state = m.balanceReducer({ ...state, phase: 'active', currentResult: null }, { type: 'PAUSE' })
  state = m.balanceReducer(state, { type: 'RESUME' })
  assert.equal(state.phase, 'countIn')
  console.log(`PASS: ${cases} actual-hook resume cases, queued callback guards, one/multi-target exact completion, actual daily persistence/planned-game caller, duplicate commit and retry; unfinished resume policy preserved.`)
  m.resetHooks()
} finally {
  await rm(dir, { recursive: true, force: true })
}

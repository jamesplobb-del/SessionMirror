// Run the production context callbacks with deliberately out-of-order native work.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync('src/context/AudioModePlaybackContext.tsx', 'utf8')
const tree = ts.createSourceFile('context.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = ['play', 'pause', 'seek', 'schedulePlaybackRecovery', 'onPlay']
const declarations = new Map()
function visit(node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(tree))) {
    declarations.set(node.name.getText(tree), node.getText(tree))
  }
  ts.forEachChild(node, visit)
}
visit(tree)
assert.equal(declarations.size, names.length)
const callbacks = ts.transpileModule(names.map(name => `const ${declarations.get(name)};`).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const ref = current => ({ current })
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
const item = id => ({ id, name: id, filePath: `${id}.m4a`, mediaUrl: '', mimeType: 'audio/mp4' })
const a = item('A'), b = item('B')
let cases = 0

function fixture({ native = true, playing = true } = {}) {
  cases++
  const f = { starts: [], stops: [], events: [], timers: [], fallbacks: 0, completed: 0 }
  const state = { currentItem: native ? a : { ...a, nativePlayback: false }, isPlaying: playing, currentTime: 2, duration: 60 }
  const player = { paused: true, ended: false, currentTime: 2, duration: 60, readyState: 2, networkState: 1,
    pause() { this.paused = true }, play: async () => { player.paused = false } }
  const env = {
    useCallback: fn => fn, state, player, playerRef: ref(player),
    playbackRequestIdRef: ref(1), currentSourceKeyRef: ref('file:A.m4a'),
    nativePlaybackActiveRef: ref(native && playing), nativePlaybackStartingRef: ref(false),
    desiredPlayingRef: ref(playing), nativePlaybackOffsetRef: ref(2), nativeDurationRef: ref(60),
    nativePlaybackStartMsRef: ref(1000), externalNativePlaybackEndedRef: ref(() => { f.completed++ }),
    externalNativePlaybackFailedRef: ref(null), sessionPreparedRef: ref(true), pendingStartTimeRef: ref(null),
    resumeTimerRef: ref(null), resumeInFlightRef: ref(false), pipelineDetachRef: ref(null),
    endedListenerSourceKeyRef: ref(''), onBeforePlayRef: ref(async () => {}),
    onPlaybackActiveChangeRef: ref(active => f.events.push(['active', active])),
    audioModePlaybackControlsRef: { play: null },
    usesNativeAudioPlayback: value => value.nativePlayback !== false,
    sourceKeyFor: value => `file:${value.filePath}`,
    setState: update => Object.assign(state, typeof update === 'function' ? update(state) : update),
    updateSessionPrepared: prepared => { env.sessionPreparedRef.current = prepared; f.events.push(['prepared', prepared]) },
    clearResumeTimer: () => { env.resumeTimerRef.current = null },
    startProgressLoop: () => f.events.push(['progress', true]), stopProgressLoop: () => f.events.push(['progress', false]),
    logPlayback() {}, performance: { now: () => 2000 },
    startAudioModeNativePlayback: options => { const gate = deferred(); f.starts.push({ options, ...gate }); return gate.promise },
    stopAudioModeNativePlayback: () => { const gate = deferred(); f.stops.push(gate); return gate.promise },
    ensurePlayerSource: () => player, prepareSessionOnce: async () => {},
    prepareInlineMediaElement() {}, createPlaybackDiagSession: () => 'test', setActivePlaybackDiagSession() {},
    attachPlaybackPipelineInstrumentation: () => () => {}, logAudioSessionSnapshot: async () => {},
    resolveItemSrcForPlayback: async () => 'test.m4a', waitForAudioModePlaybackReady: async () => 60,
    playTakeMediaAudible: async () => { f.fallbacks++; return true },
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
    window: { setTimeout: fn => { f.timers.push(fn); return f.timers.length } },
  }
  const api = new Function(...Object.keys(env), `${callbacks}\nreturn { ${names.join(', ')} };`)(...Object.values(env))
  env.audioModePlaybackControlsRef.play = api.play
  return Object.assign(f, { env, api, state, player })
}

// Latest scrub wins even if the earlier stop completes last.
{
  const f = fixture()
  f.api.seek(10); f.api.seek(20)
  assert.equal(f.stops.length, 2)
  f.stops[1].resolve(); await flush()
  f.stops[0].resolve(); await flush()
  assert.deepEqual(f.starts.map(start => start.options.startTime), [20])
  f.starts[0].resolve({ duration: 60 }); await flush()
  assert.equal(f.state.currentTime, 20)
  assert.equal(f.state.isPlaying, true)
  f.env.externalNativePlaybackEndedRef.current()
  assert.equal(f.completed, 1, 'Scrubbing preserves the caller completion callback')
}

// Pause while seek cleanup waits must not replay the old take.
{
  const f = fixture()
  f.api.seek(10)
  const paused = f.api.pause()
  f.stops.forEach(stop => stop.resolve()); await paused; await flush()
  assert.equal(f.starts.length, 0)
  assert.equal(f.env.desiredPlayingRef.current, false)
  assert.equal(f.state.isPlaying, false)
  assert.equal(f.state.currentTime, 10)
}

// A different clip owns playback as soon as Play is requested.
{
  const f = fixture()
  f.api.seek(10); f.api.play(b, { startTime: 5 })
  f.stops[1].resolve(); await flush()
  f.stops[0].resolve(); await flush()
  assert.deepEqual(f.starts.map(start => [start.options.filePath, start.options.startTime]), [['B.m4a', 5]])
  f.starts[0].resolve({ duration: 60 }); await flush()
  assert.equal(f.state.currentItem.id, 'B')
}

// Old pause cleanup cannot turn off a newer successfully started player.
{
  const f = fixture()
  const paused = f.api.pause()
  f.api.play(b, { startTime: 5 }); await flush()
  f.starts[0].resolve({ duration: 60 }); await flush()
  f.stops[0].resolve(); await paused
  assert.equal(f.env.nativePlaybackActiveRef.current, true)
  assert.equal(f.state.isPlaying, true)
  assert.equal(f.state.currentTime, 5)
  assert.equal(f.env.sessionPreparedRef.current, true)
}

// A late result (or rejection) cannot stop a newer native start or trigger WebKit.
for (const rejected of [false, true]) {
  const f = fixture()
  f.api.seek(10); f.stops[0].resolve(); await flush()
  f.api.seek(20); f.stops[1].resolve(); await flush()
  f.starts[1].resolve({ duration: 60 }); await flush()
  if (rejected) f.starts[0].reject(new Error('Old native start failed'))
  else f.starts[0].resolve({ duration: 60 })
  await flush()
  assert.equal(f.stops.length, 2, 'A stale result must not issue a global native stop')
  assert.equal(f.state.currentTime, 20)
  assert.equal(f.env.nativePlaybackActiveRef.current, true)
  assert.equal(f.fallbacks, 0)
}

// Paused scrubbing changes only the remembered offset; malformed positions do nothing.
{
  const f = fixture({ playing: false })
  f.api.seek(12); f.api.seek(NaN); f.api.seek(Infinity)
  assert.equal(f.state.currentTime, 12)
  assert.equal(f.env.nativePlaybackOffsetRef.current, 12)
  assert.equal(f.stops.length, 0)
  assert.equal(f.starts.length, 0)
  f.api.play(a); await flush()
  assert.equal(f.starts[0].options.startTime, 12)
  f.starts[0].resolve({ duration: 60 }); await flush()
}

// Recovery that was queued for another request must not run at all.
{
  const f = fixture({ native: false })
  let plays = 0
  f.player.play = async () => { plays++ }
  f.api.schedulePlaybackRecovery('waiting')
  f.env.playbackRequestIdRef.current++
  f.timers[0](); await flush()
  assert.equal(plays, 0)
}

// Stop/replacement while recovery awaits play must not escalate or clobber state.
for (const replacement of ['pause', 'native', 'source']) {
  const f = fixture({ native: false })
  const recover = deferred()
  f.player.play = () => recover.promise
  f.api.schedulePlaybackRecovery('waiting'); f.timers[0](); await flush()
  if (replacement === 'pause') await f.api.pause()
  else {
    f.env.playbackRequestIdRef.current++
    if (replacement === 'native') f.env.nativePlaybackStartingRef.current = true
    else f.env.currentSourceKeyRef.current = 'file:B.m4a'
  }
  const eventCount = f.events.length
  recover.reject(new Error('Old play interrupted')); await flush()
  assert.equal(f.fallbacks, 0)
  assert.equal(f.events.length, eventCount)
  assert.equal(f.env.resumeInFlightRef.current, false)
}

// A delayed web-media play event respects Stop and the native player's ownership.
for (const owner of ['paused', 'native-active', 'native-starting', 'web-current']) {
  const f = fixture({ native: false, playing: owner !== 'paused' })
  f.env.nativePlaybackActiveRef.current = owner === 'native-active'
  f.env.nativePlaybackStartingRef.current = owner === 'native-starting'
  f.player.paused = false
  f.api.onPlay()
  assert.equal(f.player.paused, owner !== 'web-current')
  if (owner === 'paused') assert.equal(f.env.desiredPlayingRef.current, false)
  if (owner === 'web-current') assert.equal(f.state.isPlaying, true)
}

console.log(`PASS audio scrub/recovery: ${cases} actual-callback cases; newest seek, Pause, new clip, late start, preserved completion, paused offset, stale recovery and late WebKit play events.`)

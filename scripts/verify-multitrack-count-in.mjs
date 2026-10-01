// Exercise the real recording hook and Overlay -> native transport handoff.
// Native output is a controlled port; this does not measure acoustic playback.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const directory = await mkdtemp(join(tmpdir(),'multitrack-count-in-'))
process.on('exit',()=>rmSync(directory,{recursive:true,force:true}))
let bundleIndex = 0
async function bundle(contents, plugins = []) {
  const result = await build({ stdin: { contents, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' }, plugins })
  const path=join(directory,`check-${++bundleIndex}.mjs`)
  await writeFile(path,result.outputFiles[0].text)
  return import(pathToFileURL(path))
}
const ports = { name: 'count-in-boundaries', setup(b) {
  b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'count-in-port' }))
  b.onResolve({ filter: /sharedMetronomeEngine$/ }, () => ({ path: 'click', namespace: 'count-in-port' }))
  b.onLoad({ filter: /.*/, namespace: 'count-in-port' }, ({ path }) => ({ loader: 'js', contents: path === 'react'
    ? `export const version='19.0.0'; export const useRef=v=>({current:v}); export const useCallback=f=>f; export const useEffect=()=>{};
       export const useState=v=>{const s=globalThis.__countStates,i=s.length;s.push(v);return [v,n=>s[i]=n]}`
    : 'export const sharedMetronomeEngine={stop(){}}' }))
} }
const api = await bundle(`export * from './src/multitrack/recording/useMultitrackRecording';
  export * from './src/multitrack/recording/multitrackCountIn';
  export * from './src/multitrack/state/multitrackPersistence';
  export * from './src/multitrack/state/multitrackFile';`, [ports])

for (const [input, expected] of [[0,1],[-2,1],[undefined,1],[NaN,1],[Infinity,1],[2,2],[8,8],[99,8]]) {
  assert.equal(api.recordingCountInBars(input), expected)
}
const stored = new Map()
globalThis.window = globalThis
globalThis.localStorage = { getItem: k => stored.get(k) ?? null, setItem: (k,v) => stored.set(k,v), removeItem: k=>stored.delete(k) }
const project = { projectId: 'count-in-regression', layoutId: 'two', panels: [
    { kind: 'performance', id: 'a', take: null }, { kind: 'performance', id: 'b', take: null }],
  sheetMusic: { kind: 'sheet-music', id: 'music', asset: null },
  backing: { kind: 'none', volume: 1 }, practice: { bpm: 120, meter: '4/4', countInBars: 0, clickEnabled: false } }
await api.saveMultitrackSession(project)
assert.equal((await api.loadMultitrackSession([],project.projectId)).practice.countInBars,1,'autosave/reopen repairs a zero-bar lead-in')
const key = 'sm.multitrack.session.v1.' + project.projectId
const legacy = JSON.parse(stored.get(key)); legacy.practice.countInBars = 0; stored.set(key,JSON.stringify(legacy))
assert.equal((await api.loadMultitrackSession([],project.projectId)).practice.countInBars,1,'older saved projects regain a lead-in')
const manifest = Buffer.from(JSON.stringify({ format:'besttake-multitrack', version:1, session:project, assets:[] }))
const header = Buffer.alloc(12);header.write('BTMULTI1');header.writeUInt32LE(manifest.length,8)
const imported = await api.readMultitrackFile(new Blob([header,manifest]))
assert.equal(imported.session.practice.countInBars,1,'an older zero-bar shared project regains a lead-in on import')
imported.dispose()

// Extract the actual callback so the test covers meter parsing and native request options.
const overlay = await readFile('src/multitrack/components/MultitrackOverlay.tsx','utf8')
const start = overlay.indexOf('    onStartTransport: async (')
const end = overlay.indexOf('    onTransportScheduled:',start)
assert.ok(start >= 0 && end > start)
const handler = overlay.slice(start,end).trim().replace(/^onStartTransport:\s*/, '').replace(/,\s*$/, '')
const handoff = await bundle(`const nativeTransportActiveRef={current:true};
  const session={get practice(){return globalThis.__countPractice}};
  const sharedMetronomeEngine={getSnapshot:()=>({soundId:'classic'})};
  const startNativeMultitrackTransport=options=>globalThis.__nativeCountStart(options);
  export const start=${handler};`)

let now = 100_000, nextId = 0
const timers = new Map()
const originalNow = Date.now
Date.now = () => now
globalThis.window = {
  setTimeout(fn, delay) { const id=++nextId;timers.set(id,{fn,at:now+delay,interval:0});return id },
  clearTimeout(id) { timers.delete(id) },
  setInterval(fn, delay) { const id=++nextId;timers.set(id,{fn,at:now+delay,interval:delay});return id },
  clearInterval(id) { timers.delete(id) },
}
const drain = async () => { for(let i=0;i<30;i++) await Promise.resolve() }
async function advance(ms) {
  const end=now+ms
  while(true) {
    const entry=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0]
    if(!entry) break
    const [id,t]=entry;now=t.at
    if(t.interval) t.at+=t.interval; else timers.delete(id)
    t.fn();await drain()
  }
  now=end;await drain()
}
try {
  for (const meter of ['4/4','6/8']) for (const bars of [0,2]) {
    globalThis.__countStates=[]
    globalThis.__countPractice={meter,clickSound:'classic'}
    const calls=[],events=[]
    let transport
    globalThis.__nativeCountStart=async options=>{
      calls.push(options)
      const beats=options.beatsPerBar*options.countInBars
      transport={firstClickEpochMs:now+300,performanceEpochMs:now+300+beats*500,countInBeats:beats,beatDurationSec:.5}
      return transport
    }
    const hook=api.useMultitrackRecording({onArmPlayback:async()=>true,
      onStartMicRecording:async()=>{now+=900;return true},onStartTransport:handoff.start,
      onPerformanceStart:async()=>events.push('performance'),onCountInComplete:()=>events.push('complete'),
      onAbortMicRecording:()=>events.push('abort'),onStopTransport:()=>events.push('stop')})
    hook.beginCountIn('part',{bpm:120,countInBars:bars,clickEnabled:false});await drain()
    assert.equal(calls[0].countInBars,Math.max(1,bars),'recording always asks native for a lead-in')
    assert.equal(calls[0].clickEnabled,false,'the continuing click remains off')
    assert.equal(globalThis.__countStates[0],'count-in')
    assert.equal(globalThis.__countStates[2],transport.countInBeats)
    const countDuration=transport.performanceEpochMs-now
    await advance(countDuration-1)
    assert.deepEqual(events,[],'capture startup and a disabled continuing click cannot skip the countdown')
    await advance(1)
    assert.deepEqual(events,['performance','complete'],'performance begins at the scheduled downbeat')
    hook.enterReview();hook.cancel()

    // Retry followed by cancellation during the lead-in must never start performance.
    events.length=0
    hook.beginCountIn('part',{bpm:120,countInBars:bars,clickEnabled:false});await drain()
    assert.equal(globalThis.__countStates[0],'count-in')
    await advance(800);hook.cancel();await advance(10_000)
    assert.ok(events.includes('abort'))
    assert.ok(!events.includes('performance'))
    assert.equal(globalThis.__countStates[0],'idle')
    assert.equal(timers.size,0)
  }
} finally { Date.now=originalNow }
console.log('PASS: legacy zero-bar save/import, full 4/4 and 6/8 lead-ins with click off and slow capture startup, downbeat, retry and cancellation.')

import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const dir = await mkdtemp(join(tmpdir(), 'multitrack-check-'))
try {
  await build({ stdin: { contents: `export * from './src/multitrack/layout/layoutPresets'; export * from './src/multitrack/layout/composition'; export * from './src/multitrack/export/sectionExport'; export * from './src/multitrack/synchronization/projectTiming'; export * from './src/multitrack/synchronization/multitrackBeatSchedule'; export * from './src/multitrack/state/multitrackPersistence';`, resolveDir: process.cwd(), loader: 'ts' }, outfile: join(dir, 'model.mjs'), bundle: true, platform: 'node', format: 'esm', define: {'import.meta.env':'{}'} })
  const m = await import(pathToFileURL(join(dir, 'model.mjs')))
  let checks = 0
  const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++ }
  const near = (actual, expected, label) => { assert.ok(Math.abs(actual - expected) < .000001, `${label}: ${actual} vs ${expected}`); checks++ }
  for (const bpm of [40,60,120,240,300]) {
    const lead = m.playbackCountOffSec(bpm)
    near(lead, 4*60/bpm, 'count-off is four beats at project tempo')
    for (const capturedHead of [lead/2,lead,lead+.18]) {
      const window = m.sourceWindow(0,20,capturedHead*1000,-lead)
      near(window.timelineDelaySec + capturedHead - window.sourceInSec,lead,'all parts keep their downbeat after the same lead-in')
      assert.ok(window.sourceInSec < capturedHead-.04,'source includes the initial articulation before the downbeat')
    }
  }
  check(m.playbackStartPosition(20,20),0,'Play all replays a completed mix instead of hiding every finished clip')
  check(m.playbackStartPosition(19.98,20),0,'final frame rounding replays')
  check(m.playbackStartPosition(25,20),0,'shortened project replays from stale playhead')
  check(m.playbackStartPosition(8,20),8,'pause/resume preserves middle of song')
  check(m.playbackStartPosition(8,0),8,'unknown duration does not force restart')
  check(m.projectDurationSec(4,16.5),16.5,'backing extends the song beyond short parts')
  check(m.projectDurationSec(0,16.5),16.5,'backing-only project has a playable length')
  check(m.projectDurationSec(20,16.5),20,'longer parts set the song length')
  check(m.projectDurationSec(4,16.5,3),3,'explicit end overrides all media lengths')
  check(m.recordingStartAtPlayhead(8,2,true),8,'recording at the end stays at the end rather than replaying from zero')
  check(m.recordingStartAtPlayhead(8.1,2,true),10,'appending starts on the next bar, never over the previous take')
  check(m.recordingStartAtPlayhead(6.8,2,false),6,'ordinary overdub keeps nearest-bar snapping')
  const takes = Array.from({ length: 12 }, (_, i) => ({ id: `take-${i}`, duration: 32, timelineOffsetMs: 2300 + i * 13 }))
  const panels = m.createPanelsForLayout(m.getLayoutPreset('twelve')).map((p,i) => ({ ...p, take: takes[i] }))
  const session = { projectId: 'test-project', name: 'Twelve parts', aspectRatio: '9:16', layoutId: 'twelve', panels, sheetMusic: { kind: 'sheet-music', id: 'music', asset: null }, backing: { kind: 'none', volume: .85 }, practice: { bpm: 120, clickEnabled: true, countInBars: 1 } }
  for (const preset of m.MULTITRACK_LAYOUT_PRESETS) {
    const rects = m.compositionRects({ ...session, panels: panels.slice(0, preset.panelCount) }, preset, 0).panelRects
    check(Object.keys(rects).length, preset.panelCount, `${preset.id} includes every box`)
    near(Object.values(rects).reduce((s,r) => s + r.widthPercent * r.heightPercent, 0), 10000, 'grid fills canvas')
  }
  const shrunk = m.mergePanelsIntoLayout(m.getLayoutPreset('two'), panels)
  check(shrunk.length, 12, 'smaller layout preserves twelve takes')
  check(shrunk.filter(p => p.hidden).length, 10, 'extra grid parts are parked')
  check(m.mergePanelsIntoLayout(m.getLayoutPreset('twelve'), shrunk).map(p=>p.take.id), takes.map(t=>t.id), 'grow restores takes')
  const floating = { ...panels[1], overlay: { xPercent: 60, yPercent: 50, widthPercent: 35, heightPercent: 30 }, sectionStartSec: 20, sectionEndSec: 25 }
  const floatingSession = { ...session, layoutId: 'one', panels: [panels[0], floating] }
  const preset = m.getLayoutPreset('one')
  const before = m.compositionRects(floatingSession, preset, 19)
  const during = m.compositionRects(floatingSession, preset, 20)
  const after = m.compositionRects(floatingSession, preset, 25)
  check(before.panelRects.a, during.panelRects.a, 'floating box never reflows base')
  check(during.panelRects.b, floating.overlay, 'floating placement retained')
  check(m.compositionRects(floatingSession, preset, 17).panelRects.b, undefined, 'extra waits until its own count-off')
  check(before.panelRects.b, floating.overlay, 'extra is on screen for the lead-in, not a pop-in')
  check(after.panelRects.b, undefined, 'box disappears exactly at end boundary')
  const windows = m.sectionExportWindows(floatingSession, preset, 30)
  check(windows.map(w => [w.startSec,w.endSec]), [[0,18],[18,20],[20,25],[25,30]], 'export boundaries include extra count-off')
  check(windows[1].panelRects, during.panelRects, 'export matches all floating rectangles')
  for (let box = 0; box < 12; box++) {
    for (const bpm of [40, 60, 120, 300]) for (const bars of [0, 1, 2, 8]) {
      const countIn = bars * 4 * 60 / bpm + .3 + box * .013
      // Native measured source-in already includes this recording's count-in and startup.
      const offset = countIn * 1000
      const record = m.sourceWindow(0, countIn + 10, offset, 0)
      near(record.sourceInSec, countIn, `box ${box + 1}: count-in removed`)
      near(record.sourceOutSec - record.sourceInSec, 10, 'performance duration independent of count-in')
      const playback = m.sourceWindow(0, countIn + 10, offset, -.5)
      near(playback.sourceInSec - playback.timelineDelaySec + .5, countIn, 'lead-in reaches downbeat at the same source time')
      const resumed = m.sourceWindow(0, countIn + 10, offset, 3, 8)
      near(resumed.sourceInSec, countIn + 3, 'resume preserves placement')
      near(resumed.sourceOutSec, countIn + 8, 'explicit export end crops identically')
      const late = m.sourceWindow(countIn, countIn + 10, -20000, 0, 30)
      near(late.timelineDelaySec, 20, 'late recording starts at chosen song time')
      near(late.sourceInSec, countIn, 'late recording excludes count-in footage')
    }
  }
  check(m.sourceWindow(0, 1, 2000, 0), null, 'fully trimmed clip has no phantom tail frame')
  check(m.sourceWindow(0, 1, -20000, 0, 10), null, 'clip after export end is excluded')
  const clone = { ...panels[0], timelineOffsetMs: -4000 }
  check(m.panelOffsetMs(clone,120), -4000, 'project placement overrides source')
  check(takes[0].timelineOffsetMs,2300,'source recording remains unchanged')
  const storage = new Map()
  globalThis.window = globalThis
  globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k=>storage.delete(k) }
  await m.saveMultitrackSession({ ...session, panels: panels.map((p,i) => i===1 ? floating : p), endSec: 28 })
  m.selectMultitrackProject(session.projectId)
  const restored = await m.loadMultitrackSession(takes)
  check(restored.panels.length,12,'all twelve parts restore')
  check(restored.panels[1].overlay,floating.overlay,'floating rectangle restores')
  check(restored.endSec,28,'export endpoint restores')
  await m.saveMultitrackSession({ ...session, projectId: 'copy', name: 'Copy' })
  check(m.listMultitrackProjects().length,2,'duplicate is independent project')
  check((await m.loadMultitrackSession(takes,session.projectId)).name,'Twelve parts','original project preserved')
  m.selectMultitrackProject('copy')
  check((await m.loadMultitrackSession(takes)).name,'Copy','last selected project reopens on launch')
  m.selectMultitrackProject(session.projectId)
  check((await m.loadMultitrackSession(takes)).name,'Twelve parts','switching back restores the original project')
  const beforeFailedSave = m.listMultitrackProjects()
  globalThis.localStorage = {
    getItem: k => storage.get(k) ?? null,
    setItem: (k,v) => { if (k.endsWith('.failed-project')) throw Error('storage full'); storage.set(k,v) },
    removeItem: k => storage.delete(k),
  }
  await assert.rejects(m.saveMultitrackSession({ ...session, projectId: 'failed-project' }))
  check(m.listMultitrackProjects(),beforeFailedSave,'failed save does not add an incomplete project')
  check((await m.loadMultitrackSession(takes)).name,'Twelve parts','failed save does not replace the active project')
  globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k=>storage.delete(k) }
  const missing = await m.loadMultitrackSession(takes.slice(1), session.projectId)
  check(missing.panels[0].missingTakeId, takes[0].id, 'missing take retains source identity')
  check(missing.panels[0].take, null, 'missing source is not playable')
  check(!!missing.recoveryNotice, true, 'missing part has a recovery notice')
  await m.saveMultitrackSession(missing)
  const missingAgain = await m.loadMultitrackSession(takes.slice(1), session.projectId)
  check(missingAgain.panels[0].missingTakeId, takes[0].id, 'autosave preserves missing source')
  check((await m.loadMultitrackSession(takes, session.projectId)).panels[0].take.id, takes[0].id, 'restoring source repairs assignment')
  console.log(`PASS: ${checks} multitrack assertions (1–12 parts, count-ins, lead-in, seek, timing, layouts, section exports, project restore).`)
} finally { await rm(dir, { recursive: true, force: true }) }

// Exercise the real exporter against a native bridge double. Verify its payload,
// rather than merely rechecking the layout helpers in isolation.
const exportDir = await mkdtemp(join(tmpdir(), 'multitrack-export-check-'))
try {
  const stub = `export const calls=[]; export default {
    addListener: async()=>({remove:async()=>{}}), cancelMultitrackExport:async()=>{},
    renderMultitrackVideo: async p=>{calls.push(p);return {path:'file:///render.mp4',durationSeconds:p.durationSeconds}},
    shareMediaFile:async()=>{}
  }`
  await build({ entryPoints: ['src/multitrack/export/multitrackExport.ts'], outfile: join(exportDir,'export.mjs'), bundle:true, platform:'node', format:'esm', plugins:[{name:'native-double',setup(b){
    b.onResolve({filter:/audioSessionRoute$/},()=>({path:'native',namespace:'double'}))
    b.onResolve({filter:/shareTakeVideo$/},()=>({path:'files',namespace:'double'}))
    b.onResolve({filter:/nativeAssetCache$/},()=>({path:'assets',namespace:'double'}))
    b.onResolve({filter:/^@capacitor\/core$/},()=>({path:'capacitor',namespace:'double'}))
    b.onLoad({filter:/.*/,namespace:'double'},({path})=>({contents: path==='native' ? stub.replace('calls.push(p)', 'globalThis.exportCalls.push(p)') : path==='files' ? 'export async function resolveNativeFileUri(t){ return t.filePath }' : path==='assets' ? 'export const extensionForBlob=()=>"png"; export const writeBlobToNativeCache=async(d,n,b)=>"file:///"+n' : 'export const Capacitor={isNativePlatform:()=>true,getPlatform:()=>"ios"}',loader:'js'}))
  }}]})
  globalThis.exportCalls=[]
  const {exportMultitrackSession}=await import(pathToFileURL(join(exportDir,'export.mjs')))
  const asset={src:'data:image/png;base64,AA==',mimeType:'image/png',fileName:'score.png',x:.5,y:.5,scale:1,scrollEndY:-.25,scrollDurationSec:10}
  const take={id:'a',duration:30,filePath:'file:///a.mp4',timelineOffsetMs:2300,mirrorPlayback:true}
  const project={aspectRatio:'1:1',layoutId:'one',panels:[{kind:'performance',id:'a',take,volume:.4},{kind:'performance',id:'extra-1',take:{...take,id:'extra'},trimStartSec:2.3,timelineOffsetMs:-20000,overlay:{xPercent:10,yPercent:10,widthPercent:30,heightPercent:20},sectionStartSec:20,sectionEndSec:24,sectionAudio:true}],sheetMusic:{id:'music',kind:'sheet-music',asset},practice:{bpm:120},backing:{kind:'none',volume:.8}}
  const layout={id:'one',panelCount:1,areas:['a'],columns:'1fr',rows:'1fr'}
  assert.equal((await exportMultitrackSession(project,layout,26)).ok,true)
  const payload=globalThis.exportCalls[0]
  assert.equal(payload.aspectRatio,'9:16','export is portrait even for a legacy square project')
  assert.equal(payload.durationSeconds,28)
  assert.equal(payload.sources[0].id,'extra-1','floating layers render above base videos')
  assert.equal(payload.sources[0].insertAtSec,20,'extra is on screen for its count-off, not a pop-in')
  assert.ok(Math.abs(payload.sources[0].sourceInSec-0.3)<1e-9,'extra export plays the count-off already in the take')
  assert.equal(payload.sources[1].insertAtSec,0,'lead-in is the take on screen, not a black pad')
  assert.ok(Math.abs(payload.sources[1].sourceInSec-0.3)<1e-9,'export plays the count-off already in the take')
  assert.equal(payload.sources[1].layoutWindows[0].startSec,0)
  assert.equal(payload.sources[0].sectionEndSec,24)
  assert.equal(payload.sources[1].volume,.4)
  assert.equal(payload.sources[1].mirror,true)
  assert.equal(payload.sheetMusicCues[1].occlusionRects.length,1,'floating video remains visible above the score')
  assert.equal(payload.sheetMusicCues[0].scrollEndY,-.25)
  const single={...project,panels:[project.panels[0]]}
  await exportMultitrackSession(single,layout,26)
  assert.equal(globalThis.exportCalls[1].sheetMusicCues.length,1,'single timed sheet layer retains its timing')
  const floating={...project,panels:[{kind:'performance',id:'a',take},{kind:'performance',id:'extra-1',take:{...take,id:'extra'},overlay:{xPercent:10,yPercent:10,widthPercent:30,heightPercent:20}}]}
  await exportMultitrackSession(floating,layout,26)
  const overlayPayload=globalThis.exportCalls[2]
  assert.equal(overlayPayload.overlayRects.length,1,'extra boxes keep their own chrome')
  assert.equal(overlayPayload.gridRects.length,1)
  assert.ok(!overlayPayload.gridRects.some(r=>r.xPercent===10 && r.yPercent===10),'base grid lines stop at extra boxes')
  assert.equal(overlayPayload.overlayRects[0].xPercent,10)
  const aborted=new AbortController();aborted.abort()
  assert.equal((await exportMultitrackSession(project,layout,26,{signal:aborted.signal})).reason,'cancelled')
  assert.equal(globalThis.exportCalls.length,3,'cancelled job never enters native renderer')
  console.log('PASS: exporter payload, floating layer order, timed score, mix, mirror, format, ending and cancellation.')
} finally { await rm(exportDir,{recursive:true,force:true}) }

// Deterministic hook harness: exercise actual async recording code at the native
// boundaries, including cancel while a camera/transport promise is still pending.
const lifecycleDir=await mkdtemp(join(tmpdir(),'multitrack-lifecycle-'))
try {
  await build({stdin:{contents:"export * from './src/multitrack/recording/useMultitrackRecording'; export * from './src/multitrack/state/useMultitrackSession'",resolveDir:process.cwd(),loader:'ts'},outfile:join(lifecycleDir,'recording.mjs'),bundle:true,platform:'node',format:'esm',plugins:[{name:'recording-boundaries',setup(b){
    b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'harness'}))
    b.onResolve({filter:/sharedMetronomeEngine$/},()=>({path:'click',namespace:'harness'}))
    b.onLoad({filter:/.*/,namespace:'harness'},({path})=>({contents:path==='react' ? `export const useRef=v=>({current:v}); export const useCallback=f=>f; export const useEffect=()=>{}; export const useMemo=f=>f(); export const useState=v=>[typeof v==='function'?v():v,n=>globalThis.recordingStates.push(n)];` : 'export const sharedMetronomeEngine={stop(){}}',loader:'js'}))
  }}]})
  const {useMultitrackRecording,useMultitrackSession}=await import(pathToFileURL(join(lifecycleDir,'recording.mjs')))
  const flush=()=>new Promise(r=>setTimeout(r,5))
  const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
  const transport=()=>({firstClickEpochMs:Date.now(),performanceEpochMs:Date.now(),countInBeats:0,beatDurationSec:.5})
  globalThis.recordingStates=[]
  const events=[]
  const hook=useMultitrackRecording({onArmPlayback:async()=>{events.push('prepare');return true},onStartMicRecording:async()=>{events.push('capture');return true},onStartTransport:async()=>{events.push('transport');return transport()},onCountInComplete:id=>events.push(id)})
  for(let i=1;i<=12;i++){hook.beginCountIn(`box-${i}`,{bpm:120,countInBars:0});await flush();hook.enterReview();hook.cancel()}
  assert.equal(events.filter(x=>x==='capture').length,12)
  for(let i=0;i<12;i++)assert.deepEqual(events.slice(i*4,i*4+4),['prepare','capture','transport',`box-${i+1}`])
  const camera=deferred();let stops=0,started=0
  const cancelCamera=useMultitrackRecording({onArmPlayback:async()=>true,onStartMicRecording:()=>camera.promise,onAbortMicRecording:()=>stops++,onStartTransport:async()=>{started++;return transport()}})
  cancelCamera.beginCountIn('a');await flush();cancelCamera.cancel();camera.resolve(true);await flush()
  assert.equal(stops,1,'camera confirmed after cancel is discarded')
  assert.equal(started,0,'cancelled camera cannot start backing audio')
  const scheduled=deferred();let transportStops=0
  const cancelTransport=useMultitrackRecording({onStartMicRecording:async()=>true,onStartTransport:()=>scheduled.promise,onStopTransport:()=>transportStops++})
  cancelTransport.beginCountIn('a');await flush();cancelTransport.cancel();scheduled.resolve(transport());await flush()
  assert.ok(transportStops>=2,'transport completing after cancellation is stopped again')
  const failures=[]
  const badCamera=useMultitrackRecording({onStartMicRecording:async()=>{throw Error('camera rejected')},onError:e=>failures.push(e)})
  badCamera.beginCountIn('a');await flush()
  assert.deepEqual(failures,['camera rejected'],'rejected capture returns a recoverable error')
  const prepared=deferred();const arrived=[]
  let count=0
  const restart=useMultitrackRecording({onArmPlayback:()=>++count===1?prepared.promise:Promise.resolve(true),onStartMicRecording:async()=>true,onStartTransport:async()=>transport(),onCountInComplete:id=>arrived.push(id)})
  restart.beginCountIn('old');await flush();restart.cancel();restart.beginCountIn('new');prepared.resolve(true);await flush();await flush()
  assert.deepEqual(arrived,['new'],'stale async work cannot enter a later recording')
  restart.cancel()
  const project=useMultitrackSession()
  const latest=()=>[...globalThis.recordingStates].reverse().find(s=>s&&typeof s==='object'&&Array.isArray(s.panels))
  project.setLayout('twelve')
  for(let n=0;n<4;n++) {
    const extra=project.addPerformanceBox(true)
    assert.ok(extra.startsWith('extra-'))
    if (n === 0) project.updatePanel(extra,{overlay:{xPercent:7,yPercent:9,widthPercent:23,heightPercent:31}})
    if (n === 1) {
      assert.equal(latest().panels.filter(p=>p.overlay).length,2,'adding again creates a distinct empty extra')
      assert.deepEqual(latest().panels.find(p=>p.overlay).overlay,{xPercent:7,yPercent:9,widthPercent:23,heightPercent:31},'adding another extra preserves existing geometry')
    }
  }
  assert.equal(latest().panels.filter(p=>!p.overlay).length,12,'extra boxes do not consume base layout slots')
  assert.equal(latest().panels.length,16,'twelve base boxes plus four extra boxes')
  assert.equal(project.addPerformanceBox(true),null,'capacity has a clear boundary')
  project.setLayout('two')
  assert.equal(latest().panels.filter(p=>!p.overlay&&!p.hidden).length,2)
  assert.equal(latest().panels.filter(p=>p.overlay&&!p.hidden).length,4,'changing base layout does not hide extras')
  project.assignTakeToPanel('a',{id:'old',duration:30})
  project.updatePanel('a',{trimStartSec:12,trimEndSec:20,timelineOffsetMs:700,muted:true,sectionStartSec:10,sectionEndSec:15})
  project.assignTakeToPanel('a',{id:'replacement',duration:5})
  const replacement=latest().panels.find(p=>p.id==='a')
  assert.equal(replacement.trimStartSec,undefined,'replacement does not inherit old trim')
  assert.equal(replacement.timelineOffsetMs,undefined,'replacement uses its own source timing')
  assert.equal(replacement.muted,undefined,'replacement is not silently muted')
  assert.equal(replacement.sectionStartSec,undefined,'replacement starts without stale visibility window')
  project.updatePanel('a',{frame:{xPercent:10,yPercent:20,widthPercent:30,heightPercent:40}})
  assert.equal(latest().panels.find(p=>p.id==='a').frame.heightPercent,40,'independent custom geometry')
  console.log('PASS: real session actions preserve twelve base boxes plus four extras; safe replacement and custom geometry.')
  console.log('PASS: record/review/retry across twelve boxes, camera rejection, cancellation during camera/transport setup, stale start suppression.')
} finally {await rm(lifecycleDir,{recursive:true,force:true})}

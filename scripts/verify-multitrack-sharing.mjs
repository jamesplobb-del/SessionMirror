import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = await mkdtemp(join(tmpdir(), 'multitrack-share-'))
const cleanups = []
try {
  await build({ entryPoints: ['src/multitrack/state/multitrackFile.ts'], bundle: true, format: 'esm', platform: 'node', define: {'import.meta.env':'{}'}, outfile: join(dir,'share.mjs') })
  const { buildMultitrackFile, readMultitrackFile } = await import(pathToFileURL(join(dir,'share.mjs')))
  const media = Array.from({ length: 6 }, (_, part) => {
    const buffer = Buffer.alloc(44 + 8000 * 20 * 2)
    buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(8000,24);buffer.writeUInt32LE(16000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(buffer.length-44,40)
    for(let i=0;i<160000;i++) buffer.writeInt16LE(Math.round(Math.sin(i*(part+1)*.03)*100),44+i*2)
    return new Blob([buffer],{type:'audio/wav'})
  })
  const makeTake = i => ({ id: `original-${i}`, name: `Part ${i}`, filePath:'', videoUrl: URL.createObjectURL(media[i]), thumbnailUrl:'', videoMimeType:'audio/wav',mediaType:'audio', duration:20, timestamp:123, rating:0, notes:'', performanceStartOffsetBeats:4, recordingBpm:120, mirrorPlayback:true })
  const sheet = { src: URL.createObjectURL(new Blob(['sheet'],{type:'image/png'})), mimeType:'image/png',fileName:'page.png',x:.5,y:.5,scale:1 }
  const source = { projectId:'original-project',name:'Friends duet',layoutId:'six',aspectRatio:'16:9',endSec:18,
    panels:Array.from({length:6},(_,i)=>({kind:'performance',id:String.fromCharCode(97+i),take:i<5?makeTake(i):null,label:`Box ${i}`, volume:.6,muted:i===2,trimStartSec:1,trimEndSec:19,timelineOffsetMs:250,sectionStartSec:2,sectionEndSec:18,frame:{xPercent:10,yPercent:10,widthPercent:30,heightPercent:40}})),
    sheetMusic:{kind:'sheet-music',id:'music',asset:sheet,cues:[{id:'cue',startSec:9,asset:sheet}]},
    practice:{bpm:120,meter:'6/8',clickSound:'classic',showMetronome:true,showPitch:false,practiceOverlayEnabled:true,clickEnabled:true,countInBars:2},
    backing:{kind:'audio',src:URL.createObjectURL(new Blob(['backing'],{type:'audio/wav'})),mimeType:'audio/wav',fileName:'backing.wav',volume:.7} }
  if (process.env.MULTITRACK_RECEIVED_FILE) {
    const downloaded = await readMultitrackFile(new Blob([await readFile(process.env.MULTITRACK_RECEIVED_FILE)])); cleanups.push(downloaded.dispose)
    assert.equal(downloaded.session.panels.filter(p=>p.take).length,5)
    for(let i=0;i<5;i++) assert.deepEqual(new Uint8Array(await (await fetch(downloaded.session.panels[i].take.videoUrl)).arrayBuffer()),new Uint8Array(await media[i].arrayBuffer()))
    console.log('PASS: actual browser-downloaded project reimports with all five original recordings byte-for-byte')
  }
  const expiredPreview = URL.createObjectURL(new Blob(['thumbnail']))
  URL.revokeObjectURL(expiredPreview)
  source.panels[0].take.thumbnailUrl = expiredPreview
  const original = await buildMultitrackFile(source)
  if (process.env.MULTITRACK_TEST_FILE) {
    const uiSession = structuredClone(source)
    uiSession.sheetMusic = {kind:'sheet-music',id:'music',asset:null}
    uiSession.backing = {kind:'none',volume:.85}
    await writeFile(process.env.MULTITRACK_TEST_FILE,new Uint8Array(await (await buildMultitrackFile(uiSession)).arrayBuffer()))
  }
  const first = await readMultitrackFile(original); cleanups.push(first.dispose)
  assert.equal(first.session.panels[0].take.thumbnailUrl,'','expired thumbnail must not block sharing or opening')
  assert.equal(source.panels[0].take.thumbnailUrl,expiredPreview,'packaging must not mutate the active project')
  assert.notEqual(first.session.projectId,source.projectId)
  assert.equal(first.session.panels.filter(p=>p.take).length,5)
  assert.equal(first.session.panels[5].take,null)
  for(let i=0;i<5;i++) {
    const p=first.session.panels[i]
    assert.deepEqual(new Uint8Array(await (await fetch(p.take.videoUrl)).arrayBuffer()),new Uint8Array(await media[i].arrayBuffer()))
    for(const key of ['volume','muted','trimStartSec','trimEndSec','timelineOffsetMs','sectionStartSec','sectionEndSec']) assert.equal(p[key],source.panels[i][key])
    assert.deepEqual(p.frame,source.panels[i].frame)
    assert.equal(p.take.performanceStartOffsetBeats,4)
    assert.ok(p.take.id.startsWith('collab-'))
  }
  assert.equal(await (await fetch(first.session.backing.src)).text(),'backing')
  assert.equal(await (await fetch(first.session.sheetMusic.cues[0].asset.src)).text(),'sheet')
  first.session.panels[5].take=makeTake(5)
  const returned=await readMultitrackFile(await buildMultitrackFile(first.session)); cleanups.push(returned.dispose)
  assert.equal(returned.session.panels.filter(p=>p.take).length,6)
  for(let i=0;i<6;i++) assert.deepEqual(new Uint8Array(await (await fetch(returned.session.panels[i].take.videoUrl)).arrayBuffer()),new Uint8Array(await media[i].arrayBuffer()))
  assert.equal(source.panels[5].take,null)
  assert.equal(returned.session.practice.meter,'6/8')
  await assert.rejects(readMultitrackFile(original.slice(0,original.size-1)))
  await assert.rejects(readMultitrackFile(new Blob(['not a project'])))
  const header=new Uint8Array(await original.slice(0,12).arrayBuffer()), n=new DataView(header.buffer).getUint32(8,true)
  const envelope=JSON.parse(await original.slice(12,12+n).text())
  async function malformed(change) {
    const m=structuredClone(envelope);change(m)
    const json=new TextEncoder().encode(JSON.stringify(m)), h=header.slice();new DataView(h.buffer).setUint32(8,json.length,true)
    return new Blob([h,json,original.slice(12+n)])
  }
  for(const change of [m=>m.version=99,m=>m.session.panels[0].take.videoUrl='https://example.com/private',m=>m.assets[0].size=Number.MAX_SAFE_INTEGER,m=>m.session.panels[0].trimEndSec=0,m=>m.session.panels.push(...m.session.panels,...m.session.panels)]) {
    await assert.rejects(readMultitrackFile(await malformed(change)))
  }
  console.log('PASS: five parts → import → add sixth → return, exact media bytes, timing/layout/mix/backing/sheets, independent IDs, truncated/invalid/unsupported files rejected')
} finally { cleanups.forEach(fn=>fn()); await rm(dir,{recursive:true,force:true}) }

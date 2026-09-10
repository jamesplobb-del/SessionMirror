import { saveMultitrackSession, loadMultitrackSession } from '../../src/multitrack/state/multitrackPersistence'
import { createPanelsForLayout, getLayoutPreset } from '../../src/multitrack/layout/layoutPresets'
const result = document.querySelector('pre')!
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); result.textContent += 'PASS: ' + message + '\n' }
try {
  const audio = new Blob(['backing audio fixture'], { type: 'audio/wav' })
  const sheet = new Blob(['sheet fixture'], { type: 'image/png' })
  const asset = {src: URL.createObjectURL(sheet), fileName:'page.png', mimeType:'image/png',x:.5,y:.5,scale:1}
  const session = {layoutId:'two',panels:createPanelsForLayout(getLayoutPreset('two')),sheetMusic:{kind:'sheet-music' as const,id:'music',asset,cues:[{id:'cue',startSec:5,asset}]},practice:{showPitch:false,showMetronome:false,practiceOverlayEnabled:true,clickEnabled:true,countInBars:1,bpm:120},backing:{kind:'audio' as const,src:URL.createObjectURL(audio),fileName:'backing.wav',mimeType:'audio/wav',volume:.6}}
  await saveMultitrackSession(session)
  URL.revokeObjectURL(asset.src); URL.revokeObjectURL(session.backing.src)
  const restored = (await loadMultitrackSession([]))!
  assert(restored.backing.kind === 'audio' && await (await fetch(restored.backing.src)).text() === 'backing audio fixture','backing survives revoked original URL')
  assert(await (await fetch(restored.sheetMusic.asset!.src)).text() === 'sheet fixture','sheet survives revoked original URL')
  assert(restored.sheetMusic.cues?.[0].startSec === 5,'sheet cue timing survives restoration')
  await saveMultitrackSession(restored)
  const reopened = (await loadMultitrackSession([]))!
  assert(reopened.backing.kind === 'audio','restored assets survive another save/reopen')
  const data = JSON.parse(localStorage.getItem('sm.multitrack.session.v1')!)
  data.backing.src='multitrack-asset:missing'
  data.practice.bpm=-99;data.practice.countInBars=500;data.panelVolumes=[99];data.panelTrims=[[9,2]];data.panelSections=[[8,1]]
  localStorage.setItem('sm.multitrack.session.v1',JSON.stringify(data))
  const recovered=(await loadMultitrackSession([]))!
  assert(recovered.backing.kind==='none' && !!recovered.recoveryNotice && !!recovered.sheetMusic.asset,'missing backing recovers with notice and preserves sheet')
  assert(recovered.practice.bpm===30 && recovered.practice.countInBars===8,'invalid tempo/count-in clamped')
  const panel=recovered.panels[0] as any
  assert(panel.volume===1 && panel.trimStartSec===0 && panel.sectionStartSec===undefined,'invalid mixer/trim/window normalized')
  result.textContent += 'ALL PASSED'
} catch(e) { result.textContent += 'FAIL: '+e; }

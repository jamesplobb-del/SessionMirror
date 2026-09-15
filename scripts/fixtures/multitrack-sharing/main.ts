import { buildMultitrackFile, readMultitrackFile } from '../../../src/multitrack/state/multitrackFile'
import { saveMultitrackSession, loadMultitrackSession } from '../../../src/multitrack/state/multitrackPersistence'
import type { MultitrackSession } from '../../../src/multitrack/types'

const output = document.querySelector('pre')!
output.textContent = ''
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); output.textContent += `PASS: ${message}\n` }
const projectId = `sharing-test-${crypto.randomUUID()}`
const previousProjects = localStorage.getItem('sm.multitrack.projects.v2')
try {
  const session: MultitrackSession = { projectId, name: 'Sharing recovery test', layoutId:'two',panels:[{kind:'performance',id:'a',take:{id:'source',name:'Friend part',videoUrl:URL.createObjectURL(new Blob(['exact recording bytes'],{type:'audio/wav'})),filePath:'',videoMimeType:'audio/wav',thumbnailUrl:'',timestamp:1,rating:0,notes:'',mediaType:'audio',duration:2}}, {kind:'performance',id:'b',take:null}],sheetMusic:{kind:'sheet-music',id:'music',asset:null},backing:{kind:'none',volume:.85},practice:{bpm:120,countInBars:1,clickEnabled:true,showMetronome:false,showPitch:false,practiceOverlayEnabled:true} }
  const received = await readMultitrackFile(await buildMultitrackFile(session))
  received.session.projectId = projectId
  await saveMultitrackSession(received.session)
  received.dispose()
  const restored = await loadMultitrackSession([],projectId)
  assert(!!restored,'Received project reopens without sender recordings in local Vault')
  const take = restored!.panels[0].kind === 'performance' ? restored!.panels[0].take : null
  assert(!!take && await (await fetch(take.videoUrl)).text() === 'exact recording bytes','Recording survives destroyed temporary URLs and IndexedDB restore')
  assert(restored!.panels[1].kind === 'performance' && restored!.panels[1].take === null,'Empty box remains available for collaborator')
  const returned = await readMultitrackFile(await buildMultitrackFile(restored!))
  assert(returned.session.panels[0].kind === 'performance' && returned.session.panels[0].take?.name === 'Friend part','Restored project can be shared again')
  returned.dispose()
  output.textContent += 'ALL PASSED'
} catch (error) { output.textContent += `FAIL: ${error}` }
finally {
  localStorage.removeItem(`sm.multitrack.session.v1.${projectId}`)
  if (previousProjects === null) localStorage.removeItem('sm.multitrack.projects.v2'); else localStorage.setItem('sm.multitrack.projects.v2',previousProjects)
}

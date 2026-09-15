import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import MultitrackPanelGrid from '../../../src/multitrack/components/MultitrackPanelGrid'
import type { PerformancePanelState } from '../../../src/multitrack/types'
import '../../../src/index.css'
import '../../../src/styles/multitrack.css'
const buffer = new ArrayBuffer(44 + 8000 * 8 * 2)
const view = new DataView(buffer)
const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ')
view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true)
view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, buffer.byteLength - 44, true)
for (let i = 0; i < 64000; i++) view.setInt16(44 + i * 2, Math.sin(i * .35) * 5000, true)
const src = URL.createObjectURL(new Blob([buffer], {type:'audio/wav'}))
const initialPanels: PerformancePanelState[] = [{kind:'performance',id:'a',timelineOffsetMs:0,take:{id:'demo',name:'Test take',videoUrl:src,filePath:'',videoMimeType:'audio/wav',thumbnailUrl:'',timestamp:0,duration:8,rating:0,notes:'',mediaType:'audio'}}]

const noop = () => {}
const seed = (): PerformancePanelState[] => [initialPanels[0], {...initialPanels[0], id:'extra-test',label:'Test extra',overlay:{xPercent:55,yPercent:45,widthPercent:40,heightPercent:45}}]
function Controls() {
 const [panels,setPanels]=useState(seed),[last,setLast]=useState('none'),[disabled,setDisabled]=useState(false)
 return <main style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#fafaf9'}}>
 <div style={{padding:12}}><button onClick={()=>{setPanels(seed());setLast('none')}}>Reset test boxes</button> <label><input type="checkbox" checked={disabled} onChange={e=>setDisabled(e.target.checked)}/> Lock editing</label><output style={{display:'block'}}>{last}</output></div>
 <MultitrackPanelGrid layout={{id:'one',label:'One',panelCount:1,areas:['a'],columns:'1fr',rows:'1fr'}} panels={panels} sheetMusicPanel={{kind:'sheet-music',id:'score',asset:null}} recordingTargetPanelId={null} recordingPhase="idle" interactionDisabled={disabled}
 onTapPerformance={id=>setLast('options:'+id)} onRemoveTake={id=>{setLast('remove:'+id);setPanels(ps=>ps.map(p=>p.id===id?{...p,take:null}:p))}} onSheetMusicChange={noop} onRegisterMedia={noop}
 onMoveOverlay={(id,overlay)=>{setLast('move:'+id);setPanels(ps=>ps.map(p=>p.id===id?{...p,overlay}:p))}} onDeleteExtra={id=>{setLast('delete:'+id);setPanels(ps=>ps.filter(p=>p.id!==id))}}/>
 </main>
}
createRoot(document.getElementById('root')!).render(<Controls/> )

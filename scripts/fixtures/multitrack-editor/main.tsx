import { createRoot } from 'react-dom/client'
import { useState, type ComponentProps } from 'react'
import MultitrackAlignStage from '../../../src/multitrack/components/MultitrackAlignStage'
import type { PerformancePanelState, SheetMusicPanelState } from '../../../src/multitrack/types'
import '../../../src/index.css'
import '../../../src/styles/multitrack.css'
// Isolated, synthetic media only. The transport below exposes edits for browser assertions;
// native audio playback and export are covered by the separate multitrack regressions.
const buffer = new ArrayBuffer(44 + 8000 * 8 * 2)
const view = new DataView(buffer)
const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ')
view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true)
view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, buffer.byteLength - 44, true)
for (let i = 0; i < 64000; i++) view.setInt16(44 + i * 2, Math.sin(i * .35) * 5000, true)
const src = URL.createObjectURL(new Blob([buffer], {type:'audio/wav'}))
const initialPanels: PerformancePanelState[] = [{kind:'performance',id:'a',timelineOffsetMs:0,take:{id:'demo',name:'Test take',videoUrl:src,filePath:'',videoMimeType:'audio/wav',thumbnailUrl:'',timestamp:0,duration:8,rating:0,notes:'',mediaType:'audio'}}]
const initialMusic: SheetMusicPanelState = {kind:'sheet-music',id:'score',asset:null,cues:[{id:'cue',startSec:2,asset:{src:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"%3E%3Crect width="20" height="20" fill="gray"/%3E%3C/svg%3E',mimeType:'image/svg+xml',fileName:'Test score',x:0,y:0,scale:1}}]}
function Fixture() {
 const [open,setOpen]=useState(true),[fail,setFail]=useState(false),[panels,setPanels]=useState(initialPanels),[music,setMusic]=useState(initialMusic)
 const [offset,setOffset]=useState(0),[trim,setTrim]=useState<[number,number|null]>([0,null]),[time,setTime]=useState(0),[playing,setPlaying]=useState(false),[saved,setSaved]=useState('none'),[recordAt,setRecordAt]=useState<[number,boolean]|null>(null)
 const sync={state:{duration:8,currentTime:time,isPlaying:playing},getPanelMediaDuration:()=>8,setPanelOffset:(_:string,n:number)=>setOffset(n),setPanelTrim:(_:string,a:number,b:number|null)=>setTrim([a,b]),seek:setTime} as unknown as ComponentProps<typeof MultitrackAlignStage>['sync']
 return <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#fafaf9',color:'#292524'}}>
 <div style={{padding:12}}><button onClick={()=>setOpen(true)}>Open editor</button> <label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/> Fail save</label>
 <output style={{display:'block',fontSize:12}}>{JSON.stringify({offset,trim,time,playing,open,saved,recordAt,cues:music.cues?.map(c=>c.startSec)})}</output></div>
 {open && <MultitrackAlignStage isOpen panels={panels} sheetMusic={music} bpm={120} sync={sync} onClose={()=>setOpen(false)} onPreviewToggle={()=>setPlaying(p=>!p)} onEditStart={()=>setPlaying(false)} onAddBox={()=>{}} onRecordBox={()=>{}} onRecordAt={(sec,atEnd)=>setRecordAt([sec,atEnd])} onAddImage={()=>{}}
 onMoveImage={(id,startSec)=>setMusic(m=>({...m,cues:m.cues?.map(c=>c.id===id?{...c,startSec}:c)}))} onRemoveImage={id=>setMusic(m=>({...m,cues:m.cues?.filter(c=>c.id!==id)}))} onRestoreSheetMusic={setMusic}
 onSectionChange={(id,sectionStartSec,sectionEndSec)=>setPanels(ps=>ps.map(p=>p.id===id?{...p,sectionStartSec,sectionEndSec}:p))}
 onDone={async changes=>{if(fail)throw Error('test save rejection');setSaved(JSON.stringify(changes));setPanels(ps=>ps.map(p=>{const c=changes.find(c=>c.panelId===p.id);return c?{...p,timelineOffsetMs:c.offsetMs,trimStartSec:c.trimStart,trimEndSec:c.trimEnd}:p}))}} />}
 </div>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )

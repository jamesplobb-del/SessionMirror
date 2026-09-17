import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { PDFDocument, rgb } from 'pdf-lib'
import PracticeChartLayer from '../../../src/components/PracticeChartLayer'
import DraggableMetronomeWidget from '../../../src/components/DraggableMetronomeWidget'
import { MetronomeProvider } from '../../../src/context/MetronomeContext'
import { savePracticeChart, saveChartView } from '../../../src/utils/practiceChartStorage'
import { scheduleViewportSync } from '../../../src/utils/viewportSync'
import type { HudQuickSettings } from '../../../src/utils/hudQuickSettings'
import '../../../src/index.css'
import '../../../src/styles/tablet.css'
const noop = () => {}
// DOM-only instrumentation: a replacement canvas gets a new identity, and
// changing its bitmap dimensions records a redraw. Browser QA reads these.
let canvasId = 0
new MutationObserver(records => {
  for (const canvas of document.querySelectorAll('canvas')) {
    if (!canvas.dataset.fixtureId) canvas.dataset.fixtureId = String(++canvasId)
  }
  for (const record of records) {
    if (record.type === 'attributes' && record.target instanceof HTMLCanvasElement) {
      record.target.dataset.fixtureRedraws = String(Number(record.target.dataset.fixtureRedraws ?? 0) + 1)
    }
  }
}).observe(document.getElementById('root')!, {childList:true,subtree:true,attributes:true,attributeFilter:['width','height']})
const pdf = await PDFDocument.create()
for (let i = 1; i <= 6; i++) {
  const page = pdf.addPage([612,792])
  page.drawText(`PAGE ${i} - TOP`, {x:70,y:660,size:36,color:rgb(.1,.25,.4)})
  page.drawText(`PAGE ${i} - BOTTOM`, {x:70,y:130,size:30,color:rgb(.35,.1,.2)})
  for(let y=200;y<630;y+=70) for(let line=0;line<5;line++) page.drawLine({start:{x:65,y:y+line*7},end:{x:550,y:y+line*7},thickness:.5})
}
await savePracticeChart('ipad-workspace-fixture',new File([await pdf.save()],'Six pages.pdf',{type:'application/pdf'}))
saveChartView('ipad-workspace-fixture',{fit:'page',halfTurn:true,fraction:0})
function Fixture() {
  const boundary = useRef<HTMLDivElement>(null)
  const [workspace,setWorkspace] = useState<HudQuickSettings>({showMusic:true,showMetronome:true,showDrone:false,showTakeCards:false,pitchTrackerEnabled:false,audioEnhancerEnabled:false})
  const [visible,setVisible] = useState(false)
  useEffect(()=>{document.documentElement.classList.toggle('app-music-page',visible); return scheduleViewportSync(noop)},[visible])
  return <MetronomeProvider><div ref={boundary} className="app-shell app-shell--audio-mode app-shell--music-page" style={{height:'var(--app-height, 100dvh)',position:'relative'}}>
    <PracticeChartLayer projectId="ipad-workspace-fixture" active={workspace.showMusic} boundaryRef={boundary} workspace={workspace} onWorkspaceChange={(key,value)=>setWorkspace(w=>({...w,[key]:value}))} onClose={()=>setWorkspace(w=>({...w,showMusic:false}))} onPaperVisibleChange={setVisible} onChromeHiddenChange={noop} isRecording={false} isStopping={false} recordReady onToggleRecord={noop} recordElapsed={0}/>
    {workspace.showMetronome && <DraggableMetronomeWidget boundaryRef={boundary} visible/>}
  </div></MetronomeProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )

import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import HandsFreeStage from '../../../src/components/HandsFreeStage'
import '../../../src/index.css'
function Preview() {
 const [settings,setSettings]=useState(false)
 return <main style={{padding:24,minHeight:'100vh',background:'#edf3fa',color:'#13263c'}}>
  <h1>Tools · hands-free controls</h1><p>Drag Move. Drag the corner to resize.</p>
  <HandsFreeStage movable phase="listening" elapsed={0} placement="chip" notice="sensitive" onTapForSettings={()=>setSettings(true)}/>
  {settings && <p role="alert">Start-level settings opened</p>}
 </main>
}
createRoot(document.getElementById('root')!).render(<Preview/> )

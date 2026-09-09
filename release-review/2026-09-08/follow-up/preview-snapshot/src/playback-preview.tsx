// Disposable preview harness: generated video, no microphone or saved user data.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ReviewModeOverlay from './components/ReviewModeOverlay'
import { ActionSheetProvider } from './context/ActionSheetContext'
import { AudioModePlaybackProvider } from './context/AudioModePlaybackContext'
import type { Take, ReviewSlot } from './types'
import './index.css'
import './styles/practice-system.css'
import './styles/practice-hub.css'
import './styles/quick-tuner.css'
import './styles/pitch-insights.css'
import './styles/camera-mode-glass.css'
import './styles/electric-refinement.css'
const initial = new URLSearchParams(location.search).get('refinement') || 'depth-electric'
document.documentElement.dataset.refinement = initial
window.addEventListener('message', e => { if(e.origin === location.origin && e.source === parent && e.data?.type === 'besttake-refinement') document.documentElement.dataset.refinement=e.data.style })
async function sampleVideo() {
 const canvas=document.createElement('canvas'); canvas.width=480; canvas.height=900
 const ctx=canvas.getContext('2d')!; const stream=canvas.captureStream(24)
 const recorder=new MediaRecorder(stream); const chunks:BlobPart[]=[]
 return new Promise<string>((resolve,reject)=>{
  let frame=0; let timer:number
  recorder.ondataavailable=e=>chunks.push(e.data)
  recorder.onerror=()=>{clearInterval(timer);stream.getTracks().forEach(t=>t.stop());reject(new Error('Sample video unavailable'))}
  recorder.onstop=()=>{clearInterval(timer);stream.getTracks().forEach(t=>t.stop());resolve(URL.createObjectURL(new Blob(chunks,{type:recorder.mimeType})))}
  const draw=()=>{ frame++; const g=ctx.createLinearGradient(0,0,480,900);g.addColorStop(0,'#10283b');g.addColorStop(.55,'#265773');g.addColorStop(1,'#0c1828');ctx.fillStyle=g;ctx.fillRect(0,0,480,900); ctx.fillStyle='#dcbd8066';for(let n=0;n<7;n++)ctx.fillRect(25+n*73,0,4,900);ctx.fillStyle='#0e1d2b';ctx.fillRect(0,610,480,290);ctx.strokeStyle='#83d8ef';ctx.lineWidth=4;ctx.beginPath();for(let x=0;x<480;x++){const y=430+Math.sin(x/46+frame/13)*38; x?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();ctx.textAlign='center';ctx.fillStyle='#f3dbad';ctx.font='600 21px system-ui';ctx.fillText('BESTTAKE · PLAYBACK STUDY',240,270);ctx.font='16px system-ui';ctx.fillStyle='#c6dfe9';ctx.fillText('Generated sample · no camera or microphone',240,300)}
  draw();recorder.start();timer=window.setInterval(draw,1000/24);setTimeout(()=>recorder.stop(),6000)
 })
}
function Preview(){
 const [url,setUrl]=useState(''); const [slot,setSlot]=useState<ReviewSlot>('challenger');const [open,setOpen]=useState(!new URLSearchParams(location.search).has('quick'));const [quick,setQuick]=useState(new URLSearchParams(location.search).has('quick'));const [notice,setNotice]=useState('Generating sample video…')
 useEffect(()=>{let disposed=false;let created='';void sampleVideo().then(u=>{created=u;if(!disposed){setUrl(u);setNotice('Sample media · trimming and system sharing require iPhone validation')}}).catch(e=>setNotice(String(e)));return()=>{disposed=true;if(created)URL.revokeObjectURL(created)}},[])
 const makeTake=(id:string):Take=>({id,name:id==='best'?'Long tones · Best':'Long tones · Current',videoUrl:url,filePath:'',videoMimeType:'video/webm',thumbnailUrl:'',timestamp:1788900000000,rating:0,notes:'Preview sample',mediaType:'video',duration:6,pitchSeries:Array.from({length:60},(_,i)=>({time:i/10,frequencyHz:440+Math.sin(i/5)* (id==='best'?2:5)}))})
 const best=makeTake('best'), current=makeTake('current')
 return <><p style={{padding:20}}>{notice}</p>{!open&&<div className="quick-take-demo">{[best,current].map(t=><button key={t.id} onClick={()=>{setSlot(t.id==='best'?'benchmark':'challenger');setQuick(true);setOpen(true)}}><video src={url} muted playsInline/><strong>{t.name}</strong><small>Tap for a larger preview</small></button>)}</div>}{url&&<ReviewModeOverlay quickPreview={quick} onRequestFullscreen={()=>setQuick(false)} context="compare" activeSlot={slot} onSlotChange={setSlot} vaultTakes={[]} vaultIndex={0} onVaultIndexChange={()=>{}} benchmarkSrc={url} challengerSrc={url} benchmarkTake={best} challengerTake={current} benchmarkName={best.name} challengerName={current.name} benchmarkMimeType="video/webm" challengerMimeType="video/webm" isOpen={open} onClose={()=>setOpen(false)} onFavoriteTake={()=>setNotice('Preview: take pinned as Best')} />}</>
}
createRoot(document.getElementById('root')!).render(<ActionSheetProvider><AudioModePlaybackProvider><Preview/></AudioModePlaybackProvider></ActionSheetProvider>)

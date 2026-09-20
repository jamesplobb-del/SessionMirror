// Actual production UI, isolated sample data on its own origin. No camera/mic use.
import { createRoot } from 'react-dom/client'
import { useRef } from 'react'
import { ActionSheetProvider } from '../../../src/context/ActionSheetContext'
import { MetronomeProvider } from '../../../src/context/MetronomeContext'
import MultitrackOverlay from '../../../src/multitrack/components/MultitrackOverlay'
import { saveMultitrackSession, selectMultitrackProject } from '../../../src/multitrack/state/multitrackPersistence'
import type { Take } from '../../../src/types'
import '../../../src/index.css'
import '../../../src/styles/multitrack.css'
import '../../../src/styles/electric-refinement.css'
import '../../../src/styles/open-lens.css'
import '../../../src/styles/multitrack-quiet.css'

if (location.port !== '5197') throw new Error('Run this sample only on the isolated 5197 origin.')
document.documentElement.dataset.refinement = 'depth-electric'
document.documentElement.classList.toggle('app-dark-mode',new URLSearchParams(location.search).get('dark') === '1')
const loading=document.createElement('p');loading.textContent='Preparing sample parts…';loading.style.cssText='padding:25px;color:#738399;font:14px system-ui';document.body.append(loading)
// Generate a playable canvas clip, with an audio track solely for waveform checks.
async function sampleMedia() {
  const canvas=document.createElement('canvas');canvas.width=360;canvas.height=640
  const image=new Image();image.src='/scripts/fixtures/app-design/studio.svg';await image.decode()
  const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0,360,640)
  const stream=canvas.captureStream(15)
  const audio=new AudioContext();await audio.resume();const dest=audio.createMediaStreamDestination()
  const osc=audio.createOscillator();const gain=audio.createGain();osc.frequency.value=220;gain.gain.value=.06
  osc.connect(gain).connect(dest);osc.start();dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t))
  const mime=['video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))!
  const recorder=new MediaRecorder(stream,{mimeType:mime});const chunks:BlobPart[]=[]
  const blob=await new Promise<Blob>(resolve=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=()=>resolve(new Blob(chunks,{type:mime}));recorder.start();const timer=setInterval(()=>{ctx.drawImage(image,0,0,360,640);gain.gain.value=.025+Math.abs(Math.sin(performance.now()/380))*.06},65);setTimeout(()=>{clearInterval(timer);recorder.stop()},8000)})
  stream.getTracks().forEach(t=>t.stop());osc.stop();await audio.close()
  return blob
}
// Cache the sample blob in this fixture's own IndexedDB so reloads are instant.
const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('quiet-workspace-fixture',1);r.onupgradeneeded=()=>r.result.createObjectStore('media');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
let blob=await new Promise<Blob|undefined>(resolve=>{const r=db.transaction('media').objectStore('media').get('clip-v2');r.onsuccess=()=>resolve(r.result)})
if(!blob){blob=await new Promise<Blob>(resolve=>{loading.textContent='';const button=document.createElement('button');button.textContent='Prepare sample workspace';button.onclick=()=>{button.disabled=true;button.textContent='Preparing sample parts…';void sampleMedia().then(resolve)};loading.append(button)});await new Promise<void>(resolve=>{const tx=db.transaction('media','readwrite');tx.objectStore('media').put(blob,'clip-v2');tx.oncomplete=()=>resolve()})}
const url=URL.createObjectURL(blob)
const takes:Take[]=['Melody','Harmony','Low part'].map((name,i)=>({id:`quiet-sample-${i}`,name,videoUrl:url,filePath:'',thumbnailUrl:'/scripts/fixtures/app-design/studio.svg',videoMimeType:blob!.type,mediaType:'video',duration:8,rating:0,notes:'',timestamp:1+i}))
if(!localStorage.getItem('quiet-seeded')||new URLSearchParams(location.search).has('reset')){
 await saveMultitrackSession({projectId:'quiet-sample',name:'Evening session',aspectRatio:'9:16',layoutId:'four',layoutStyle:{gap:6,cornerRadius:12},panels:['a','b','c','d'].map((id,i)=>({kind:'performance',id,take:takes[i]??null,label:i<3?takes[i].name:undefined})),sheetMusic:{kind:'sheet-music',id:'music',asset:null},backing:{kind:'none',volume:.85},practice:{showMetronome:false,showPitch:false,practiceOverlayEnabled:true,clickEnabled:false,countInBars:1,bpm:96}})
 selectMultitrackProject('quiet-sample');localStorage.setItem('quiet-seeded','1')
}
const previewCanvas=document.createElement('canvas');previewCanvas.width=360;previewCanvas.height=640
const previewImage=new Image();previewImage.src='/scripts/fixtures/app-design/studio.svg';await previewImage.decode()
const drawPreview=()=>previewCanvas.getContext('2d')!.drawImage(previewImage,0,0,360,640)
drawPreview();const previewStream=previewCanvas.captureStream(10);const previewTimer=setInterval(drawPreview,100)
const silentAudio=new AudioContext();const silentDestination=silentAudio.createMediaStreamDestination()
silentDestination.stream.getAudioTracks().forEach(track=>previewStream.addTrack(track))
window.addEventListener('pagehide',()=>{clearInterval(previewTimer);previewStream.getTracks().forEach(track=>track.stop());void silentAudio.close()},{once:true})
function Preview(){const stream=useRef<MediaStream|null>(previewStream);return <ActionSheetProvider><MetronomeProvider><MultitrackOverlay isOpen takes={takes} takesLoaded streamRef={stream} streamGeneration={0} tunerInstrument="strings" hapticFeedback={false} isRecording={false} isStopping={false} elapsed={0} onClose={()=>{}} onStartRecording={async()=>false} onStopRecording={()=>{}} onRecordingComplete={()=>{}} onDeleteTakes={()=>{}} pendingRecordingTakeId={null} onClearPendingRecording={()=>{}} onSaveRenderedTakeToVault={async()=>{}} /></MetronomeProvider></ActionSheetProvider>}
loading.remove();createRoot(document.getElementById('root')!).render(<Preview/> )

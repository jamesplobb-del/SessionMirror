import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BookOpen, ChevronLeft, ChevronRight, Columns2, Layers2, Menu, MoreHorizontal, Music2, PanelRightClose, PanelRightOpen, Pencil, Search, Share, Square } from 'lucide-react'
import { MetronomeProvider } from '../../../src/context/MetronomeContext'
import DraggableMetronomeWidget from '../../../src/components/DraggableMetronomeWidget'
import DraggableDroneWidget from '../../../src/components/DraggableDroneWidget'
import LivePitchTuner from '../../../src/components/LivePitchTuner'
import '../../../src/index.css'
import '../../../src/styles/drone-keyboard.css'
import '../../../src/styles/drone-sound-wheel.css'
import '../../../src/styles/practice-system.css'
import '../../../src/styles/fresh-concept.css'
import '../../../src/styles/fresh-family.css'
import '../../../src/styles/vibrant-depth.css'
import '../../../src/styles/electric-refinement.css'
import '../../../src/styles/midnight-electric.css'
import '../../../src/styles/reactive-silk-tuner.css'
import './preview.css'

document.documentElement.dataset.refinement = 'depth-electric'
document.documentElement.classList.add('app-audio-mode')

function Score({page}: {page:number}) {
  return <svg className="score-engraving" viewBox="0 0 740 850" role="img" aria-label={`Illustrative violin score, page ${page}`}>
    <text x="370" y="53" textAnchor="middle" fontSize="30">Sonata in G minor</text>
    <text x="370" y="79" textAnchor="middle" fontSize="16" fontStyle="italic">I. Adagio</text>
    <text x="42" y="115" fontSize="14">Violin</text><text x="700" y="115" textAnchor="end" fontSize="14">J. S. Bach · BWV 1001</text>
    {Array.from({length:6}, (_, row) => <g key={row} transform={`translate(42 ${151+row*108})`}>
      {[0,1,2,3,4].map(n=><line key={n} x1="0" x2="658" y1={n*9} y2={n*9} stroke="#262720" strokeWidth=".8"/>)}
      <text x="2" y="31" fontSize="49">𝄞</text><text x="39" y="21" fontSize="26">♭</text>
      {row===0&&<><text x="59" y="13" fontSize="18">4</text><text x="59" y="34" fontSize="18">4</text><text x="88" y="-13" fontSize="14" fontStyle="italic">Adagio</text></>}
      {[0,1,2,3].map(bar=><g key={bar}>
        <line x1={211+bar*148} x2={211+bar*148} y1="0" y2="36" stroke="#262720"/>
        {[0,1,2,3].map(note=>{const x=88+bar*148+note*32;const y=9+((note*2+bar+row+page)%7)*4.5; return <g key={note}><ellipse cx={x} cy={y} rx="5.7" ry="3.7" transform={`rotate(-22 ${x} ${y})`}/><line x1={x+5} x2={x+5} y1={y} y2={y-29} stroke="#262720" strokeWidth="1.4"/>{note%2===0&&<path d={`M${x+5},${y-29} q19,3 32,9`} fill="none" stroke="#262720" strokeWidth="3"/>}</g>})}
      </g>)}
      <text x="-9" y="-13" fontSize="10" fill="#777">{1+row*4+(page-1)*24}</text>
      {row%2===0&&<path d="M88 51 Q158 72 218 51" fill="none" stroke="#262720"/>}
      {row===1&&<text x="94" y="65" fontSize="18" fontStyle="italic">p</text>}
    </g>)}
    <text x="370" y="822" textAnchor="middle" fontSize="12" fill="#777">Illustrative score · {page}</text>
  </svg>
}

function Companion() {
  const [layout,setLayout] = useState('float')
  const [hidden,setHidden] = useState(false)
  const [page,setPage] = useState(1)
  const [recording,setRecording] = useState(false)
  const [elapsed,setElapsed] = useState(0)
  const [takes,setTakes] = useState(0)
  const [signal,setSignal] = useState(false)
  const [status,setStatus] = useState('Recording controls are a demo; no microphone is accessed.')
  const boundary = useRef<HTMLDivElement>(null)
  const media = useRef<HTMLMediaElement|null>(null)
  const stream = useRef<MediaStream|null>(null)
  const audio = useRef<AudioContext|null>(null)
  useEffect(()=>{
    const fit=()=>document.documentElement.style.setProperty('--preview-scale',String(Math.min(1,(window.innerWidth-24)/1200)))
    fit();window.addEventListener('resize',fit)
    return()=>window.removeEventListener('resize',fit)
  },[])
  // This fixture docks the existing floating widgets in their expanded state.
  useEffect(()=>{
    if(hidden)return
    const host=boundary.current
    if(!host)return
    const expand=()=>host.querySelectorAll<HTMLButtonElement>('.widget-ball').forEach(button=>button.click())
    const observer=new MutationObserver(expand)
    observer.observe(host,{childList:true,subtree:true})
    expand()
    return()=>observer.disconnect()
  },[hidden])
  useEffect(()=>{if(!recording)return;const id=window.setInterval(()=>setElapsed(v=>v+1),1000);return()=>clearInterval(id)},[recording])
  useEffect(()=>()=>{void audio.current?.close()},[])
  async function toggleSignal() {
    if(signal){stream.current=null;await audio.current?.close();audio.current=null;setSignal(false);return}
    const ctx=new AudioContext();audio.current=ctx;await ctx.resume()
    const source=ctx.createOscillator();source.frequency.value=440
    const gain=ctx.createGain();gain.gain.value=.25
    const destination=ctx.createMediaStreamDestination();source.connect(gain);gain.connect(destination);source.start()
    stream.current=destination.stream;setSignal(true)
  }
  function record(){if(recording){setTakes(v=>v+1);setStatus('Demo take added. No audio was recorded.')}else{setElapsed(0);setStatus('Demo timer running. No audio is being recorded.')}setRecording(v=>!v)}
  return <div className="concept-page">
    <header className="concept-header"><div><span className="eyebrow">BESTTAKE / CONCEPT STUDY 01</span><h1>Your music. Your practice tools.</h1><p>The existing BestTake widgets, alongside your score.</p></div><div className="layout-switch" aria-label="Window layout"><button aria-pressed={layout==='float'} onClick={()=>{setLayout('float');setHidden(false)}}><Layers2 size={16}/>Floating</button><button aria-pressed={layout==='split'} onClick={()=>{setLayout('split');setHidden(false)}}><Columns2 size={16}/>Side by side</button></div></header>
    <main className={`ipad ${layout} ${hidden?'companion-hidden':''}`}>
      <div className="system-status"><span>9:41 <span>Tuesday, September 15</span></span><span>Wi-Fi&nbsp; ▰ 100%</span></div>
      <section className="reader" aria-label="Illustrative forScore reader">
        <header className="reader-toolbar"><Menu size={21}/><strong>forScore</strong><div className="reader-tools"><Search size={19}/><BookOpen size={19}/><Share size={19}/><Pencil size={19}/><MoreHorizontal size={22}/></div></header>
        <div className="paper-scroll"><div className="paper"><Score page={page}/></div></div>
        <footer className="reader-footer"><span>Sonata No. 1 · Adagio</span><div><button aria-label="Previous score page" disabled={page===1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={18}/></button><span>{page} / 6</span><button aria-label="Next score page" disabled={page===6} onClick={()=>setPage(p=>p+1)}><ChevronRight size={18}/></button></div></footer>
      </section>
      {hidden?<button className="reopen" onClick={()=>setHidden(false)}><PanelRightOpen size={19}/>BestTake</button>:<aside className="companion-window app-shell--audio-mode app-ui-overlay--audio-mode" aria-label="BestTake companion window">
        <div className="window-grab"/>
        <header className="companion-header"><div className="app-mark"><Music2 size={20}/></div><div><h2>BestTake</h2><p>Practice companion</p></div><button onClick={()=>setHidden(true)} aria-label="Hide companion"><PanelRightClose size={19}/></button></header>
        <div className="companion-content" ref={boundary}>
          <div className="tool-caption"><span>LIVE TUNER</span><button aria-pressed={signal} onClick={()=>void toggleSignal()}>{signal?'Stop sample tone':'Try sample tone'}</button></div>
          <div className="tuner-slot"><LivePitchTuner mediaRef={media} isPlaying={false} mediaKey={`companion-${signal}`} variant="widget" liveMicEnabled={signal} micStreamRef={stream} pitchSource="microphone" tunerInstrument="violin" hapticsEnabled={false}/></div>
          <div className="tool-caption"><span>METRONOME</span></div>
          <div className="widget-slot metronome-slot"><DraggableMetronomeWidget boundaryRef={boundary} positionId="companion-concept-metronome" muteDuringPlayback={false}/></div>
          <div className="tool-caption"><span>DRONE</span></div>
          <div className="widget-slot drone-slot"><DraggableDroneWidget boundaryRef={boundary} positionId="companion-concept-drone" droneWaveform="warmSynth" tunerTransposition="concert" hapticFeedback={false} muteDuringPlayback={false}/></div>
          <section className="session-card"><div><span className="session-label">{recording?'DEMO RECORDING':'QUICK TAKE'}<small>Demo</small></span><strong>{Math.floor(elapsed/60).toString().padStart(2,'0')}:{(elapsed%60).toString().padStart(2,'0')}</strong></div><button className={recording?'record-button active':'record-button'} onClick={record} aria-label={recording?'Stop demo recording':'Start demo recording'}>{recording?<Square size={21} fill="currentColor"/>:<span/>}</button></section>
          <div className="session-footer"><span>{takes} demo {takes===1?'take':'takes'}</span><span>Audio practice</span></div>
        </div>
        <div className="home-indicator"/>
      </aside>}
    </main>
    <footer className="concept-notes"><div><span className="live-dot"/>Actual BestTake components<span className="separator">/</span>Illustrative forScore backdrop</div><p role="status">{signal?'Tuner receives a generated A440 signal, not your microphone.':status}</p><p>Metronome and drone use the app’s existing browser behavior. iPad windowing is simulated.</p></footer>
  </div>
}
const root=createRoot(document.getElementById('root')!)
root.render(<MetronomeProvider muteDuringPlayback={false}><Companion/></MetronomeProvider>)
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount())

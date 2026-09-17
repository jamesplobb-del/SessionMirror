import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { ActionSheetProvider } from '../../../src/context/ActionSheetContext'
import { MetronomeProvider } from '../../../src/context/MetronomeContext'
import Stage from '../../../src/multitrack/components/MultitrackRecordingStage'
import ClickSettings from '../../../src/multitrack/components/MultitrackClickSettings'
import StaffJumperGame from '../../../src/labs/staffJumper/StaffJumperGame'
import { useStaffJumperGame } from '../../../src/labs/staffJumper/useStaffJumperGame'
import { getTargetNoteAtStep, type StaffJumperConfig } from '../../../src/labs/staffJumper/staffJumperMusicLogic'
import { SILENT_READOUT, syntheticReadout } from '../../../src/labs/gameTestInput'
import '../../../src/index.css'
import '../../../src/styles/multitrack.css'
import '../../../src/labs/staffJumper/staff-jumper.css'
const noop=()=>{}
const config: StaffJumperConfig={key:'C',scaleMode:'major',range:'1-octave',difficulty:'easy',clef:'treble',tunerInstrument:'winds',transposition:'concert',instrumentId:null,playerModel:'frog',meter:'simple',tempoBpm:80,metronome:true,drone:false,lives:false,sessionSeed:42}
function Rhythm() {
 const [readout,setReadout]=useState(SILENT_READOUT)
 const game=useStaffJumperGame(readout,true,false)
 const [auto,setAuto]=useState(false)
 useEffect(()=>{
  setReadout(SILENT_READOUT)
  if(!auto || game.state.phase!=='playing' || game.state.isCountingIn || !game.state.config)return
  const note=getTargetNoteAtStep(game.state.config,game.state.sequenceStep)
  if(note.isRest)return
  const timer=window.setTimeout(()=>setReadout(syntheticReadout(note.midi)),55)
  const release=window.setTimeout(()=>setReadout(SILENT_READOUT),235)
  return ()=>{clearTimeout(timer);clearTimeout(release)}
 },[auto,game.state.phase,game.state.isCountingIn,game.state.sequenceStep])
 const tap=()=>{ if(!game.state.config)return; const note=getTargetNoteAtStep(game.state.config,game.state.sequenceStep);setReadout(syntheticReadout(note.midi));window.setTimeout(()=>setReadout(SILENT_READOUT),180) }
 return <div style={{height:'100dvh',display:'flex',flexDirection:'column'}}>
 <div style={{padding:8,zIndex:200,background:'white',color:'black'}}><button onClick={()=>game.start(config)}>Start rhythm check</button> <label><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/> Simulate delayed pitch</label> <button onClick={tap}>Play target note</button> <button onClick={game.resume}>Resume</button><output>Score {game.state.score} · Misses {game.state.missCount} · Step {game.state.sequenceStep} · {game.state.phase}</output></div>
 {game.state.config && <StaffJumperGame state={game.state} readout={readout} onPause={game.pause} hapticFeedback={false} onFallComplete={game.completeFall} turnRemainingMs={game.noteRemainingMs} turnDurationMs={game.noteTimeoutMs} beatInBar={game.beatInBar} getTravelProgress={game.getTravelProgress}/>}
 </div>
}
function Recording() {
 const stream=useRef(null),media=useRef<HTMLMediaElement|null>(null)
 const [ready,setReady]=useState(false),[phase,setPhase]=useState<'idle'|'review'>('review'),[last,setLast]=useState('none')
 const [practice,setPractice]=useState({bpm:120,meter:'4/4',countInBars:1,clickEnabled:true,showMetronome:false,showPitch:false,practiceOverlayEnabled:true})
 const take={id:'new',name:'New take',videoUrl:'',filePath:'',videoMimeType:'video/mp4',thumbnailUrl:'',timestamp:0,duration:8,rating:0,notes:''}
 return <ActionSheetProvider><MetronomeProvider><div style={{padding:20}}>
 <button onClick={()=>setReady(r=>!r)}>Toggle saved take</button> <button onClick={()=>setPhase(p=>p==='idle'?'review':'idle')}>Toggle review</button>
 <output>{last} · Applied BPM: {practice.bpm}</output><ClickSettings practice={practice} onChange={patch=>setPractice(p=>({...p,...patch}))}/>
 <Stage panelLabel="Part 2" streamRef={stream} streamGeneration={0} tunerInstrument="winds" practice={practice} phase={phase} countInRemaining={0} isRecording={false} isStopping={!ready && phase==='review'} elapsed={0} reviewTake={ready?take:null} inGrid reviewMediaRef={media} monitorSources={[{id:'a',label:'Part 1',muted:true,unavailableReason:'Muted in mix'},{id:'click',label:'Click',muted:false}]} onToggleMonitorSource={id=>setLast(id)} onPracticeChange={patch=>setPractice(p=>({...p,...patch}))} onRecord={noop} onStop={noop} onUseExisting={noop} onConfirmTake={()=>setLast('keep')} onRetryTake={()=>setLast('retry')} onDiscardTake={()=>setLast('discard')} onClose={()=>setLast('close')}/>
 </div></MetronomeProvider></ActionSheetProvider>
}
createRoot(document.getElementById('root')!).render(location.search.includes('rhythm')?<Rhythm/>:<Recording/>)

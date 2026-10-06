import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, Pause, Play, RotateCcw, Mic, Check, ChevronLeft, ChevronRight, Music2, SlidersHorizontal, BookOpen } from 'lucide-react'
import { ActionSheetProvider } from '../../../src/context/ActionSheetContext'
import LabsMenu from '../../../src/components/labs/LabsMenu'
import StaffJumperGame from '../../../src/labs/staffJumper/StaffJumperGame'
import CloudScore from './CloudScore'
import { getTargetNoteAtStep, type StaffJumperConfig, type StaffJumperState } from '../../../src/labs/staffJumper/staffJumperMusicLogic'
import BalanceScene from '../../../src/labs/balance/BalanceScene'
import BalanceStaffNote from '../../../src/labs/balance/BalanceStaffNote'
import type { BalanceVisualSnapshot, BalanceTarget } from '../../../src/labs/balance/balanceTypes'
import NoteStaff from '../../../src/labs/learnInstrument/NoteStaff'
import FingeringChart from '../../../src/labs/learnInstrument/FingeringChart'
import { getInstrument } from '../../../src/labs/learnInstrument/instrumentData'
import { savePracticeGameInstrumentId } from '../../../src/labs/practiceGameInstrument'
import { createWorld, type WorldMode, type WorldController } from './World'
import '../../../src/index.css'
import '../../../src/styles/practice-system.css'
import '../../../src/styles/arcade-style-concepts.css'
import '../../../src/styles/pocket-arcade.css'
import '../../../src/labs/staffJumper/staff-jumper.css'
import '../../../src/labs/balance/balance.css'
import '../../../src/labs/balance/balance-arcade.css'
import '../../../src/labs/learnInstrument/learn-instrument.css'
import './preview.css'

const params = new URLSearchParams(location.search)
const concept = params.get('side') !== 'current'
const requestedMode = params.get('mode') as WorldMode
const initialMode: WorldMode = ['hub','staff','balance','learn'].includes(requestedMode) ? requestedMode : 'staff'
const titles: Record<WorldMode,string> = {hub:'Games',staff:'Staff Jumper',balance:'Balance',learn:'Learn'}
const config: StaffJumperConfig = { key:'C',scaleMode:'major',range:'1-octave',difficulty:'easy',clef:'treble',tunerInstrument:'winds',transposition:'bb',rangeLowMidi:60,rangeHighMidi:67,instrumentId:'trumpet',playerModel:'trumpeter',meter:'simple',tempoBpm:80,metronome:false,drone:false,lives:false,sessionSeed:42 }
const instrument = getInstrument('bb-trumpet')!
const lessons = instrument.courses.beginner.notes
const target: BalanceTarget = {id:'preview-c',sequenceIndex:0,instrumentId:'trumpet',writtenMidi:60,concertMidi:58,writtenLabel:'C4',concertLabel:'B♭3'}

// This preview has its own local origin; pin the source hub to the displayed trumpet.
savePracticeGameInstrumentId('trumpet')
document.documentElement.dataset.refinement='depth-electric'
document.documentElement.dataset.arcadeStyle='arcade-pop'
document.documentElement.dataset.gameConcept='pocket'
document.documentElement.classList.add('preview-document')

function Frame() {
 const [mode,setMode] = useState<WorldMode>(initialMode)
 const [step,setStep] = useState(0)
 const [paused,setPaused] = useState(false)
 const [holding,setHolding] = useState(false)
 const [progress,setProgress] = useState(.22)
 const [cents,setCents] = useState(0)
 const [correct,setCorrect] = useState(false)
 const [notation,setNotation] = useState(Math.max(38,Math.min(55,Number(params.get('notation')) || 45)))
 const [token,setToken] = useState(0)
 const worldHost = useRef<HTMLDivElement>(null)
 const world = useRef<WorldController | null>(null)
 const scoreHost = useRef<HTMLDivElement>(null)
 const correctnessTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
 const visual = useRef<BalanceVisualSnapshot>({cents:0,progress:.22,speed:0,balancedMs:2200,confidentMs:2200,pitchPresent:false})
 const embedded = window.parent !== window
 const select = (next: WorldMode) => {
  if(embedded) window.parent.postMessage({type:'cloud-select',mode:next},location.origin)
  else { setMode(next); setStep(0); setPaused(false); setHolding(false); setProgress(.22); setCorrect(false); setCents(0); world.current?.reset(); }
 }
 const commandRef = useRef<(action:string,value?:unknown)=>void>(()=>{})
 const apply = (action:string,value?:unknown) => {
  if(action==='note' && !paused) {
   setCorrect(true);setToken(t=>t+1)
   if(mode==='staff') {world.current?.hop();setStep(s=>s+1)}
   else if(mode==='learn') setStep(s=>(s+1)%lessons.length)
   if(correctnessTimer.current) clearTimeout(correctnessTimer.current)
   correctnessTimer.current=setTimeout(()=>setCorrect(false),950)
  }
  if(action==='previous') {setStep(s=>Math.max(0,s-1));setCorrect(false)}
  if(action==='next') {setStep(s=>Math.min(lessons.length-1,s+1));setCorrect(false)}
  if(action==='progress')setProgress(Math.max(0,Math.min(1,Number(value)||0)))
  if(action==='hold')setHolding(Boolean(value))
  if(action==='pause')setPaused(Boolean(value))
  if(action==='cents')setCents(Math.max(-30,Math.min(30,Number(value)||0)))
  if(action==='notation')setNotation(Math.max(38,Math.min(55,Number(value)||45)))
  if(action==='reset'){setStep(0);setPaused(false);setHolding(false);setProgress(.22);setCents(0);setCorrect(false);setToken(0);world.current?.reset();world.current?.setProgress(mode==='staff'?0:.22)}
 }
 commandRef.current=apply
 const request=(action:string,value?:unknown) => {
  if(embedded) window.parent.postMessage({type:'cloud-request',action,value},location.origin)
  else apply(action,value)
 }
 useEffect(()=>{
  const listener=(e:MessageEvent)=>{if(e.origin===location.origin && e.source===window.parent && e.data?.type==='cloud-demo')commandRef.current(e.data.action,e.data.value)}
  window.addEventListener('message',listener)
  return()=>{window.removeEventListener('message',listener);if(correctnessTimer.current)clearTimeout(correctnessTimer.current)}
 },[])
 useEffect(()=>{
  if(!concept || !worldHost.current)return
  const controller=createWorld(worldHost.current,{mode,onSelect:select})
  world.current=controller
  return()=>{controller.dispose();world.current=null}
 },[mode])
 useEffect(()=>{world.current?.setPaused(paused)},[paused,mode])
 useEffect(()=>{world.current?.setProgress(mode==='staff'?(step%6)/5:progress);world.current?.setTilt(cents);visual.current={cents,progress,speed:holding&&!paused&&Math.abs(cents)<=10?1:0,balancedMs:progress*10000,confidentMs:progress*10000,pitchPresent:holding&&!paused}},[progress,cents,holding,paused,mode,step])
 useEffect(()=>{
  if(embedded||!holding||paused||mode!=='balance')return
  const timer=setInterval(()=>{if(Math.abs(cents)<=10)setProgress(p=>Math.min(1,p+.01))},100)
  return()=>clearInterval(timer)
 },[holding,paused,mode,cents])
 const note=getTargetNoteAtStep(config,step)
 const next=getTargetNoteAtStep(config,step+1)
 const lesson=lessons[step%lessons.length]
 const staffState: StaffJumperState={phase:paused?'paused':'playing',config,sequenceStep:step,targetPitchClass:note.pitchClass,score:token*10,streak:token,bestStreak:token,hearts:3,correctCount:token,missCount:0,bestScore:120,advanceToken:token,missToken:0,feedback:correct?'perfect':null,feedbackToken:token,isFalling:false,startedAtMs:Date.now(),endedAtMs:null,pausedAtMs:null,pausedDurationMs:0,timing:null,timingErrorMs:0,onTimeCount:0,earlyCount:0,lateCount:0,playedRhythmLabel:null,holdQuality:null,isCountingIn:false,isSustaining:false}
 const detectedMidi=note.midi-2
 const readout=correct?{noteName:note.noteLabel,cents:0,frequencyHz:440*Math.pow(2,(detectedMidi-69)/12),midi:detectedMidi}:{noteName:'—',cents:0,frequencyHz:0,midi:0}
 function Header(){return <header className="cloud-header"><button aria-label="Back to Games" onClick={()=>select('hub')}><ArrowLeft/></button><strong>{titles[mode]}</strong>{mode==='hub'||mode==='learn'?<span className="instrument-label">B♭ Trumpet</span>:<button aria-label={paused?'Resume':'Pause'} onClick={()=>request('pause',!paused)}>{paused?<Play/>:<Pause/>}</button>}</header>}
 function BalanceHud(){return <section className="balance-game-hud" aria-label="Live balance status"><p className="balance-hud__time">Balanced <strong>{(progress*10).toFixed(1)}s</strong></p><div className="balance-pitch-strip"><span>FLAT</span><div className="balance-pitch-strip__track"><i className="balance-pitch-strip__zone"/><b className="is-visible" style={{left:`${50+cents*1.5}%`}}/></div><span>SHARP</span></div><p className={`balance-pitch-feedback balance-pitch-feedback--${Math.abs(cents)<=10?'centered':'off'}`}>{progress>=1?'Island reached':holding?`${cents>0?'+':''}${cents}¢ · ${Math.abs(cents)<=10?'In tune':cents<0?'A little flat':'A little sharp'}`:'Ready to hold C4'}</p><div className="balance-progress"><i style={{width:`${progress*100}%`}}/></div></section>}
 function LearnContent(){return <><div className="li-play__head"><button className="li-icon-button" aria-label="Previous note" disabled={step===0} onClick={()=>request('previous')}><ChevronLeft/></button><span className="li-dots" aria-label={`Note ${step+1} of ${lessons.length}`}>{lessons.map((n,i)=><i key={n.id} data-state={i===step?'now':i<step?'done':'todo'}/>)}</span><button className="li-icon-button" aria-label="Next note" disabled={step===lessons.length-1} onClick={()=>request('next')}><ChevronRight/></button><span className="li-count">{step+1}/{lessons.length}</span></div><div className="li-play__body" data-chart-shape="row"><section className="li-card li-card--note"><p className="li-card__title">Play this note</p><strong className="li-note-name">{lesson.writtenLabel.replace(/\d/g,'')}</strong><NoteStaff clef={instrument.clef} note={lesson.staff} sizingNotes={lessons.map(n=>n.staff)} label={`${lesson.writtenLabel} on the treble staff`}/></section><section className="li-card li-card--chart is-wide"><p className="li-card__title">Use this fingering</p><FingeringChart instrument={instrument} note={lesson}/><p className="li-recipe">{lesson.recipe}</p></section></div><footer className="li-listen"><span className="li-listen__icon">{correct?<Check/>:<Mic/>}</span><span className="li-listen__text">{correct?'That’s it!':'Ready to play'}</span><span className="li-listen__meter"><i style={{width:correct?'100%':'0%'}}/></span></footer></>}
 return <div className={`preview-frame ${concept?'concept':'current'} mode-${mode}`} style={{'--notation-share':notation} as CSSProperties}>
 {!embedded&&<div className="standalone-bar"><a href={`./?mode=${mode}`}>← Comparison</a><span>Preview input</span>{mode==='balance'?<button onClick={()=>request('hold',!holding)}>{holding?'Release':'Hold in tune'}</button>:mode!=='hub'&&<button onClick={()=>request('note')}>Play shown note</button>}<button aria-label="Reset preview" onClick={()=>request('reset')}><RotateCcw size={15}/></button></div>}
 {concept?<div className={`cloud-app ${mode==='learn'?'li-screen':''}`}>
 <Header/>
 {mode==='staff'&&<section className="score-sheet" ref={scoreHost} aria-label="Staff Jumper notation"><div className="score-meta"><span>C major · Treble · Easy</span><span>Score {token*10}</span></div><CloudScore config={config} step={step}/><div className="score-caption"><Music2 size={13}/><span>Read the lit note. Play your instrument to hop.</span></div></section>}
 <div className="cloud-world-stage"><div className="world-host" ref={worldHost}/>
 {mode==='hub'&&<><div className="world-welcome"><span>Your little music world</span><h1>Where shall we play?</h1><p>Drag to look around. Tap a game to enter.</p></div><nav className="world-destinations" aria-label="Choose a game"><button onClick={()=>select('staff')}><Music2/><strong>Staff Jumper</strong><small>Sight reading</small></button><button onClick={()=>select('balance')}><SlidersHorizontal/><strong>Balance</strong><small>Steady long tones</small></button><button onClick={()=>select('learn')}><BookOpen/><strong>Learn</strong><small>Notes & fingerings</small></button></nav></>}
 {mode==='staff'&&<div className="cloud-note-dock"><div><small>Play now</small><strong>{note.isRest?'Rest':note.noteLabel}</strong></div><div><small>Next</small><strong>{next.isRest?'Rest':next.noteLabel}</strong></div><div><small>Detected</small><strong>{correct?note.noteLabel:'—'}</strong></div><p>{correct?'Centered':'Ready to play'}</p></div>}
 {mode==='balance'&&<><div className="cloud-target"><small>Target</small><strong>C4</strong><BalanceStaffNote writtenMidi={60} clef="treble" height={72}/><span>Note 1 of 3</span></div><BalanceHud/></>}
 {mode==='learn'&&<div className="cloud-lesson"><LearnContent/></div>}
 </div>
 </div>:mode==='hub'?<div className="current-hub"><LabsMenu hapticFeedback={false} tunerInstrument="winds" tunerTransposition="bb" onBack={()=>select('hub')} onOpenStaffJumper={()=>select('staff')} onOpenBalance={()=>select('balance')} onOpenLearnInstrument={()=>select('learn')}/></div>:mode==='staff'?<StaffJumperGame state={staffState} readout={readout} onPause={()=>request('pause',!paused)} hapticFeedback={false} onFallComplete={()=>{}} turnRemainingMs={15000} turnDurationMs={15000} beatInBar={null} getTravelProgress={()=>0}/>:mode==='balance'?<div className="balance-play-screen"><header className="balance-play-header"><div className="balance-target-card"><small>Target</small><strong>C4</strong><BalanceStaffNote writtenMidi={60} clef="treble" height={62} className="balance-target-card__staff"/><span>Note 1 of 3</span></div><button className="balance-pause-button" aria-label={paused?'Resume':'Pause'} onClick={()=>request('pause',!paused)}>{paused?<Play/>:<Pause/>}</button></header><BalanceScene phase={paused?'paused':'active'} target={target} visualRef={visual} characterId="trumpeter" toleranceCents={10} goalSeconds={10}/><BalanceHud/></div>:<main className="li-screen li-play" data-status={correct?'correct':'idle'}><LearnContent/></main>}
 {paused&&mode!=='hub'&&<div className="preview-paused"><strong>Paused</strong><button onClick={()=>request('pause',false)}><Play size={16}/> Resume</button></div>}
 </div>
}
createRoot(document.getElementById('root')!).render(<ActionSheetProvider><Frame/></ActionSheetProvider>)

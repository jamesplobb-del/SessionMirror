import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion'
import PremiumScene from './PremiumScene'
import { ActionSheetProvider } from '../../../src/context/ActionSheetContext'
import { MetronomeProvider } from '../../../src/context/MetronomeContext'
import { AudioModePlaybackProvider, useAudioModePlayback } from '../../../src/context/AudioModePlaybackContext'
import AudioModeHome from '../../../src/components/audioPractice/AudioModeHome'
import AudioPracticeTopTabs from '../../../src/components/audioPractice/AudioPracticeTopTabs'
import { PremiumStatusToast } from '../../../src/components/ui/PremiumRecordingFeedback'
import GuidedTakeReview from '../../../src/components/GuidedTakeReview'
import RecordingHeader from '../../../src/components/RecordingHeader'
import ControlDeck from '../../../src/components/ControlDeck'
import PracticeHub from '../../../src/components/PracticeHub'
import FirstLaunchIntro from './FirstLaunchIntro'
import GuidedRoutineBuilder from '../../../src/components/GuidedRoutineBuilder'
import SettingsDrawer from '../../../src/components/SettingsDrawer'
import TakeVaultDrawer from '../../../src/components/TakeVaultDrawer'
import { DEFAULT_APP_SETTINGS } from '../../../src/utils/appSettings'
import { pickHudQuickSettings } from '../../../src/utils/hudQuickSettings'
import { sharedMetronomeEngine } from '../../../src/metronome/sharedMetronomeEngine'
import DraggableMetronomeWidget from '../../../src/components/DraggableMetronomeWidget'
import DraggableDroneWidget from '../../../src/components/DraggableDroneWidget'
import { sortTakes } from '../../../src/utils/takes'
import type { Take, TakeUpdate, SortMode } from '../../../src/types'
import type { Routine } from '../../../src/utils/practiceRoutines'
import type { DeskSnapshot } from '../../../src/utils/workspaceDesks'
import type { RoutineBuilderMode } from '../../../src/components/RoutineBuilder'
import FeatureScreens from './FeatureScreens'
import { sampleTake } from './sampleAudio'
import './styles'
import '../../../src/styles/feature-guidance.css'
import './premium-app.css'
import './premium-interactions.css'

if (location.port !== '5201') throw new Error('Run this concept on the isolated port 5201.')
document.documentElement.id = 'lens-design-system'
document.documentElement.classList.add('lens-system','premium-app')
document.documentElement.dataset.lensFinish = 'glass'
document.documentElement.dataset.homeDesign = 'air'
document.documentElement.dataset.refinement = 'depth-electric'
document.documentElement.dataset.arcadeStyle = 'arcade-pop'
const noop = () => {}
const sampleProject={id:'premium-preview',name:'Practice',createdAt:Date.now()}
const examples = ['Long tones', 'Even articulation', 'First phrase'].map((name,index)=>({...sampleTake(index+1,8),name,timestamp:Date.now()-(3-index)*600000,rating:index===0?5:0}))
type Screen = 'home'|'audio'|'tuner'|'metronome'|'games'|'music'|'library'|'settings'|'routines'
type Tip = {id:string; title:string; body:string; target:string}
const tips: Record<string, Tip> = {
  audio:{id:'audio',title:'Record a take',body:'Tap Record to start and stop. Your take saves automatically.',target:'[aria-label="Audio recording"]'},
  best:{id:'best',title:'Keep your best',body:'Pin a take to compare with your next recording.',target:'.audio-mode-take-card__mini-btn--best'},
  tuner:{id:'tuner',title:'Tuner',body:'Play a note to check your tuning.',target:'[data-tutorial="audio-tab-tuner"]'},
  metronome:{id:'metronome',title:'Metronome',body:'Choose a tempo, then press Play to keep time.',target:'[data-tutorial="audio-tab-metronome"]'},
  games:{id:'games',title:'Practice games',body:'Build pitch and listening skills through play.',target:'[data-tutorial="audio-tab-games"]'},
  music:{id:'music',title:'Your music',body:'Open a score and practice with your tools alongside it.',target:'[data-tutorial="audio-tab-music"]'},
  workspace:{id:'workspace',title:'Your workspace',body:'Add the tools you want beside your recording.',target:'[data-guidance="workspace-tools"]'},
  library:{id:'library',title:'Take library',body:'Find, replay, and share your saved recordings here.',target:'.native-sheet-header'},
  routines:{id:'routines',title:'Suggested routines',body:'Choose a plan for your instrument. Change it anytime.',target:'.routine-guide-heading'},
  pitch:{id:'pitch',title:'Pitch',body:'Watch your pitch as you play.',target:'[data-guidance="workspace-tools"]'},
  drone:{id:'drone',title:'Drone',body:'Play against a steady note to hear your tuning.',target:'[data-guidance="workspace-tools"]'},
  hands:{id:'hands',title:'Hands-free',body:'Play to record. Pause to stop and listen back.',target:'[data-guidance="workspace-tools"]'},
  references:{id:'references',title:'References',body:'Listen to a recording you want to learn from.',target:'[data-guidance="workspace-tools"]'},
  multitrack:{id:'multitrack',title:'Multitrack',body:'Record a new part over your earlier parts.',target:'[data-guidance="workspace-tools"]'},
  expand:{id:'expand',title:'Expand view',body:'Give your takes more room for comparison.',target:'[data-guidance="workspace-tools"]'},
  enhance:{id:'enhance',title:'Audio enhancement',body:'Clean up playback while keeping your original recording.',target:'[data-guidance="workspace-tools"]'},
}
const desk: DeskSnapshot = { mode:'audio',pitchTrackerEnabled:false,showMetronome:false,showDrone:false,showMusic:false,showTakeCards:true,autoSoundRecording:false,audioEnhancerEnabled:false,metronome:{bpm:96,meter:'4/4',subdivision:'off'},drone:{pitchClass:null,octave:4},soundSilenceSeconds:2 }

/** Existing popup markup and stylesheet, with short preview-only feature copy. */
function FeatureTip({tip,onClose,onDisable}:{tip:Tip;onClose:()=>void;onDisable:()=>void}) {
  const [box,setBox] = useState<{left:number;top:number;width:number;height:number;cardTop:number}|null>(null)
  const card = useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const position = () => {
      const target = Array.from(document.querySelectorAll<HTMLElement>(tip.target)).find(node=>{const r=node.getBoundingClientRect(); return r.width>0 && r.height>0 && r.top>=0 && r.bottom<=innerHeight})
      const r = target?.getBoundingClientRect(), h = card.current?.offsetHeight || 205
      setBox(r ? {left:r.left,top:r.top,width:r.width,height:r.height,cardTop:r.top>h+24 ? r.top-h-14 : Math.min(innerHeight-h-25,r.bottom+14)} : {left:20,top:100,width:0,height:0,cardTop:145})
    }
    const timer=window.setTimeout(position,850)
    window.addEventListener('resize',position)
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()}
    const pointer=(event:PointerEvent)=>{if(card.current && !card.current.contains(event.target as Node))onClose()}
    window.addEventListener('keydown',key);window.addEventListener('pointerdown',pointer)
    return()=>{clearTimeout(timer);window.removeEventListener('resize',position);window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',pointer)}
  },[tip,onClose])
  return <div className="feature-guidance-layer" hidden={!box}>
    {box && box.width>0 && <div className="feature-guidance-target" aria-hidden style={{left:box.left-5,top:box.top-5,width:box.width+10,height:box.height+10}}/>}
    <div ref={card} className="feature-guidance-card" role="region" aria-label={tip.title} style={{left:Math.max(16,Math.min(innerWidth-320,(box?.left||0)+(box?.width||320)/2-152)),top:box?.cardTop||145,width:Math.min(304,innerWidth-32)}}>
      <h2>{tip.title}</h2><p>{tip.body}</p>
      <div className="feature-guidance-actions"><button onClick={onClose}>Dismiss</button><button className="feature-guidance-next" onClick={onClose}>Got it</button></div>
      <button className="feature-guidance-disable" onClick={onDisable}>Don’t show tips</button>
    </div>
  </div>
}

function Concept() {
  const reducedMotion=useReducedMotion()
  const [direction,setDirection]=useState(1)
  const [intro,setIntro]=useState(false),[screen,setScreen]=useState<Screen>('home')
  const [instrument,setInstrument]=useState<string|null>('trumpet')
  const [current,setCurrent]=useState<Take|null>(examples[2]),[best,setBest]=useState<Take|null>(examples[0]),[takes,setTakes]=useState<Take[]>(examples)
  const [recordFeedback,setRecordFeedback]=useState<'saving'|'saved'|null>(null)
  const [reviewTakeId,setReviewTakeId]=useState<string|null>(null),[nextFocus,setNextFocus]=useState<string|null>(null)
  const [capturing,setCapturing]=useState(false),[elapsed,setElapsed]=useState(0)
  const [tip,setTip]=useState<Tip|null>(null),[tipsEnabled,setTipsEnabled]=useState(true)
  const seen=useRef(new Set<string>()),stream=useRef<MediaStream|null>(null)
  const [routine,setRoutine]=useState<Routine|null>(null),[builder,setBuilder]=useState<RoutineBuilderMode>('presets')
  const [settings,setSettings]=useState(DEFAULT_APP_SETTINGS),[notice,setNotice]=useState('')
  const [widgets,setWidgets]=useState({pitch:false,met:false,drone:false,hands:false,music:false,cards:true,enhance:false})
  const playback=useAudioModePlayback()
  const boundary=useRef<HTMLDivElement>(null)
  const [sortMode,setSortMode]=useState<SortMode>('newest')
  const [workspaceOpen,setWorkspaceOpen]=useState(false)
  const [workspaceRequest,setWorkspaceRequest]=useState(0)
  const updateTake=(id:string,updates:TakeUpdate)=>{
    setTakes(items=>items.map(t=>t.id===id?{...t,...updates}:t))
    setCurrent(t=>t?.id===id?{...t,...updates}:t);setBest(t=>t?.id===id?{...t,...updates}:t)
  }
  const deleteTakes=(ids:string[])=>{
    void playback.pause();setTakes(items=>items.filter(t=>!ids.includes(t.id)))
    setCurrent(t=>t&&ids.includes(t.id)?null:t);setBest(t=>t&&ids.includes(t.id)?null:t)
  }
  const tools=screen==='music'||screen==='tuner'||screen==='metronome'||screen==='games'
  const closeTip=useCallback(()=>setTip(null),[])
  const teach=(id:string)=>{if(tipsEnabled && !seen.current.has(id)){seen.current.add(id);setTip(tips[id])}}
  const stageScreen=tools?screen:'audio'
  const go=(next:Screen,pause=true)=>{
    setRecordFeedback(null);setNotice('')
    const order=['audio','music','tuner','metronome','games']
    const nextStage=order.includes(next)?next:'audio'
    if(nextStage!==stageScreen)setDirection(order.indexOf(nextStage)>order.indexOf(stageScreen)?1:-1)
    document.querySelector<HTMLButtonElement>('[data-tutorial="overlays-button"][aria-expanded="true"]')?.click()
    if(pause)void playback.pause();sharedMetronomeEngine.stop();setTip(null);setIntro(false);setScreen(next)
    if(tips[next])teach(next)
  }
  const showNotice=(message:string)=>setNotice(message)
  const reset=()=>{document.querySelector<HTMLButtonElement>('[data-tutorial="overlays-button"][aria-expanded="true"]')?.click();setWidgets({pitch:false,met:false,drone:false,hands:false,music:false,cards:true,enhance:false});void playback.pause();sharedMetronomeEngine.stop();setTip(null);setIntro(true);setScreen('home');setInstrument(null);setCurrent(null);setBest(null);setTakes([]);setCapturing(false);setRoutine(null);setTipsEnabled(true);seen.current.clear()}
  const commandRef=useRef<((command:string)=>void)|null>(null)
  commandRef.current=command=>{
    setCapturing(false);setRecordFeedback(null);setReviewTakeId(null)
    if(command==='first'||command==='reset')reset()
    else if(command==='home')go('home')
    else if(command==='listen')go('audio')
    else if(command==='tools')go('tuner')
    else if(command==='library')go('library')
    else if(command==='workspace'){go('audio');setWorkspaceRequest(n=>n+1)}
    else if(command==='examples'){setTakes(examples);setCurrent(examples[2]);setBest(examples[0]);go('home')}
  }
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='besttake-concept-command')return
      if(event.data.command==='theme')document.documentElement.classList.toggle('app-dark-mode',Boolean(event.data.dark))
      else commandRef.current?.(event.data.command)
    }
    window.addEventListener('message',receive);parent.postMessage({type:'besttake-concept-ready'},location.origin)
    return()=>window.removeEventListener('message',receive)
  },[])
  useEffect(()=>{
    if(!workspaceRequest)return
    const timer=window.setTimeout(()=>document.querySelector<HTMLButtonElement>('[data-tutorial="overlays-button"][aria-expanded="false"]')?.click(),180)
    return()=>clearTimeout(timer)
  },[workspaceRequest])
  useEffect(()=>{parent.postMessage({type:'besttake-concept-state',stage:intro?'intro':workspaceOpen?'workspace':screen==='library'?'library':tools?'tools':screen==='audio'?'listen':'home'},location.origin)},[intro,tools,screen,workspaceOpen])
  useEffect(()=>{
    // Match App.tsx: Games always uses the existing Pocket Arcade theme.
    if(screen==='games')document.documentElement.dataset.gameConcept='pocket'
    else delete document.documentElement.dataset.gameConcept
    return()=>{delete document.documentElement.dataset.gameConcept}
  },[screen])
  useEffect(()=>{
    const finishRename=(event:KeyboardEvent)=>{
      const input=event.target
      if(event.key==='Enter'&&input instanceof HTMLInputElement&&input.matches('.vault-take-row__title-input')){event.preventDefault();event.stopPropagation();input.blur()}
    }
    document.addEventListener('keydown',finishRename,true)
    return()=>document.removeEventListener('keydown',finishRename,true)
  },[])
  useEffect(()=>{if(!capturing)return;const timer=setInterval(()=>setElapsed(v=>v+1),1000);return()=>clearInterval(timer)},[capturing])
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),3200);return()=>clearTimeout(timer)},[notice])
  // Preview-only preparation time makes the real feedback states easy to try.
  // Production status follows recorder/storage events, with no artificial wait.
  useEffect(()=>{
    if(!recordFeedback)return
    const timer=window.setTimeout(()=>{
      if(recordFeedback==='saving')setRecordFeedback('saved')
      else {setRecordFeedback(null);teach('best')}
    },recordFeedback==='saving'?1400:3200)
    return()=>window.clearTimeout(timer)
  },[recordFeedback])
  const record=()=>{
    if(recordFeedback==='saving')return
    void playback.pause();setTip(null);setNotice('')
    if(capturing){
      const take=sampleTake(takes.length+1,Math.max(4,Math.min(10,elapsed)))
      setTakes(v=>[...v,take]);setCurrent(take);setReviewTakeId(take.id);setCapturing(false);setRecordFeedback('saving')
    } else {setRecordFeedback(null);setReviewTakeId(null);setElapsed(0);setCapturing(true)}
  }
  const openBuilder=(mode:RoutineBuilderMode)=>{setBuilder(mode);go('routines')}
  const save=(value:Routine)=>{setRoutine(value);go('home')}

  return <>
    <motion.div className={`lens-screen app-shell open-lens-recording app-shell--audio-mode concept-screen ${screen==='tuner'?'concept-screen--tuner':''}`}
      animate={{transform:!reducedMotion&&(screen==='library'||screen==='settings')?'translateY(9px) scale(.975)':'translateY(0px) scale(1)'}}
      transition={{duration:reducedMotion?.1:.684,ease:[.16,1,.3,1]}}>
      <div className="premium-tuner-wash" aria-hidden="true"/>
      <div className="lens-safe-top"/>
      <main className={`lens-content app-ui-overlay app-ui-overlay--audio-mode app-ui-overlay--audio-practice-${tools?screen:'record'}`}>
        {tools ? <AudioPracticeTopTabs activeTab={screen as 'tuner'|'metronome'|'music'|'games'} onTabChange={tab=>go(tab==='audio'?'audio':tab==='practice'?'metronome':tab)}/> : <RecordingHeader mode="audio" disabled={capturing||recordFeedback==='saving'} onModeChange={()=>showNotice('This preview uses audio takes.')} hapticFeedback={false}/>}
        <div ref={boundary} className={`lens-stage premium-stage ${!widgets.cards?'premium-stage--hide-takes':''}`}>
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <PremiumScene key={stageScreen} scene={stageScreen} direction={direction} game={stageScreen==='games'}>
          {tools ? <FeatureScreens screen={screen as 'tuner'|'metronome'|'games'|'music'} onBack={()=>go('audio')} onNotice={showNotice}/> : <div className="concept-recording-stage"><AudioModeHome isRecording={capturing} elapsed={elapsed} ready streamRef={stream} streamGeneration={0} challengerTake={current} benchmarkTake={best} libraryBenchmarkPlayback={null} takeReadiness={current&&recordFeedback==='saving'?{[current.id]:{status:'preparing'}}:{}} onRecord={record} onPinCurrentAsBest={()=>{setBest(current);setTip(null)}} onClearBenchmark={()=>setBest(null)} onClearChallenger={()=>setCurrent(null)} hapticFeedback={false}/>
            {reviewTakeId===current?.id&&!capturing&&recordFeedback!=='saving'&&<GuidedTakeReview key={current.id} takeId={current.id} initialNote={current.notes} focus={nextFocus} mode="audio" voiceEnabled={false} playbackActive={playback.state.isPlaying} onFocusChange={setNextFocus} onSaveNote={(id,notes)=>updateTake(id,{notes})} onRecordAgain={record} recordDisabled={false}/>}
          </div>}
            </PremiumScene>
          </AnimatePresence>
          {!tools&&screen==='audio'&&!intro&&<>
            {widgets.met&&<DraggableMetronomeWidget boundaryRef={boundary} isTakePlaying={playback.state.isPlaying} positionId="premium-concept-met" defaultTopOffset={20} onClose={()=>setWidgets(w=>({...w,met:false}))}/>}
            {widgets.drone&&<DraggableDroneWidget boundaryRef={boundary} isTakePlaying={playback.state.isPlaying} positionId="premium-concept-drone" defaultTopOffset={220} droneWaveform="sine" tunerTransposition="concert" hapticFeedback={false} onClose={()=>setWidgets(w=>({...w,drone:false}))}/>}
            {(widgets.pitch||widgets.music||widgets.hands||widgets.enhance)&&<div className="premium-active-tools">
              {widgets.pitch&&<button onClick={()=>go('tuner')}>Pitch ↗</button>}
              {widgets.music&&<button onClick={()=>go('music')}>Music ↗</button>}
              {widgets.hands&&<button onClick={()=>showNotice('Hands-free capture is simulated in this preview.')}>Hands-free on</button>}
              {widgets.enhance&&<button onClick={()=>showNotice('Enhancement preview · original sample audio')}>Enhance on</button>}
            </div>}
          </>}
        </div>
        {screen!=='metronome'&&screen!=='games'&&<div className="lens-dock-container"><ControlDeck openLens libraryAboveRecord workspaceSections ready isStopping={recordFeedback==='saving'} isRecording={capturing} elapsed={elapsed} recordingMode="audio" onRecordingModeChange={()=>showNotice('This preview uses audio takes.')} onToggleRecord={tools?()=>go('audio'):record}
          onOpenHome={()=>go('home')} onOpenSettings={()=>go('settings')} onOpenTools={()=>go('tuner')} toolsActive={tools} onOpenAudioRecorder={()=>go('audio')} onOpenVault={()=>go('library')} onBranchOpenChange={open=>{setWorkspaceOpen(open);if(open)teach('workspace')}}
          onOpenReferences={()=>teach('references')} onOpenMultitrack={()=>teach('multitrack')} onToggleExpandView={()=>teach('expand')}
          autoSoundRecording={widgets.hands} onAutoSoundRecordingChange={v=>{setWidgets(w=>({...w,hands:v}));if(v)teach('hands')}}
          pitchTrackerEnabled={widgets.pitch} onPitchTrackerChange={v=>{setWidgets(w=>({...w,pitch:v}));if(v)teach('pitch')}}
          showMetronome={widgets.met} onShowMetronomeChange={v=>{setWidgets(w=>({...w,met:v}));if(v)teach('metronome')}}
          showDrone={widgets.drone} onShowDroneChange={v=>{setWidgets(w=>({...w,drone:v}));if(v)teach('drone')}}
          showMusic={widgets.music} musicToggleVisible onShowMusicChange={v=>{setWidgets(w=>({...w,music:v}));if(v)teach('music')}}
          showTakeCards={widgets.cards} onShowTakeCardsChange={v=>setWidgets(w=>({...w,cards:v}))}
          audioEnhancerEnabled={widgets.enhance} onAudioEnhancerChange={v=>{setWidgets(w=>({...w,enhance:v}));if(v)teach('enhance')}} hapticFeedback={false}/></div>}
        {screen==='metronome'&&<button className="concept-tool-back" onClick={()=>go('home')}>‹ Home</button>}
      </main><div className="lens-safe-bottom"><i/></div>
    </motion.div>
    <PracticeHub isOpen={screen==='home'&&!intro} projects={[]} takes={takes} tunerTransposition="concert" hapticFeedback={false} onClose={()=>go('audio')} onOpenSettings={()=>go('settings')} onOpenQuickPractice={()=>go('audio')}
      onOpenGames={()=>go('games')} onDailyPractice={()=>openBuilder('presets')} onDailyGame={()=>go('games')} onOpenVault={()=>go('library')} onOpenTuner={()=>go('tuner')} onOpenMetronome={()=>go('metronome')} onOpenMusic={()=>go('music')}
      routine={routine} routineDay={null} routineBuilderRequest={null} instrumentId={instrument} liveDeskSnapshot={desk} onSelectInstrument={setInstrument} onStartRoutineStep={()=>go('audio')} onToggleRoutineStep={noop} onOpenRoutineBuilder={openBuilder} onCloseRoutineBuilder={()=>go('home')} onSaveRoutine={save} onSaveAndStartRoutine={async value=>{setRoutine(value);go('audio')}} onCreatePracticeItem={async()=> 'concept'} onDeleteRoutine={()=>setRoutine(null)}/>
    <AnimatePresence>{screen==='routines'&&!intro&&<motion.div className="concept-routine" initial={{opacity:0,transform:reducedMotion?'none':'translateY(28px) scale(.97)'}} animate={{opacity:1,transform:'translateY(0px) scale(1)'}} exit={{opacity:0,transition:{duration:.252}}} transition={{duration:reducedMotion?.1:.684,ease:[.16,1,.3,1]}}><GuidedRoutineBuilder mode={builder} routine={routine} instrumentId={instrument} projects={[]} liveDeskSnapshot={desk} tunerTransposition="concert" hapticFeedback={false} onSave={save} onSaveAndStart={value=>{setRoutine(value);go('audio')}} onCreatePracticeItem={async()=> 'concept'} onDelete={()=>setRoutine(null)} onCancel={()=>go('home')}/></motion.div>}</AnimatePresence>
    <SettingsDrawer isOpen={screen==='settings'&&!intro} onClose={()=>go('audio')} settings={settings} hudQuickSettings={pickHudQuickSettings(settings)} onUpdate={patch=>setSettings(s=>({...s,...patch}))} onAudioEnhancerChange={noop} onReset={()=>setSettings(DEFAULT_APP_SETTINGS)} onOpenLabs={()=>go('games')} onOpenQuickTuner={()=>go('tuner')} onOpenQuickMetronome={()=>go('metronome')}/>
    <TakeVaultDrawer simplified isOpen={screen==='library'&&!intro} onClose={()=>go('audio')} projects={[]} activeProject={sampleProject} onSelectProject={noop} onCreateProject={noop} takes={takes} bestTakeHistory={best?[{id:best.id,projectId:sampleProject.id,projectName:sampleProject.name,takeId:best.id,takeName:best.name,markedAt:best.timestamp,takeCreatedAt:best.timestamp,duration:best.duration||8,mediaType:'audio',isCurrentBest:true}]:[]} sortedTakes={sortTakes(takes,sortMode)} sortMode={sortMode} onSortChange={setSortMode} benchmarkId={best?.id??null} benchmarkBinding={null} challengerId={current?.id??null} libraryItems={[]} onImportLibraryAudio={noop} onRenameLibraryItem={noop} onDeleteLibraryItem={noop} onSetLibraryReference={noop} onPinBenchmark={id=>setBest(takes.find(t=>t.id===id)||null)} onPinChallenger={id=>setCurrent(takes.find(t=>t.id===id)||null)} onUpdateTake={updateTake} onDeleteTake={id=>deleteTakes([id])} onDeleteTakes={deleteTakes} onClearAllTakes={()=>deleteTakes(takes.map(t=>t.id))} onOpenTake={take=>{setCurrent(take);go('audio',false);playback.play({id:take.id,takeId:take.id,name:take.name,filePath:take.filePath,mediaUrl:take.videoUrl,mimeType:take.videoMimeType})}}/>
    {intro&&<FirstLaunchIntro onComplete={()=>go('home')} onSelectInstrument={setInstrument} initialInstrumentId={instrument||undefined}/>}
    {!intro&&!capturing&&!recordFeedback&&tip&&tipsEnabled&&<FeatureTip key={tip.id} tip={tip} onClose={closeTip} onDisable={()=>{setTipsEnabled(false);setTip(null)}}/>}
    <PremiumStatusToast message={recordFeedback==='saving'?'Saving take':recordFeedback==='saved'?'Take saved':notice||null} tone={recordFeedback==='saving'?'busy':recordFeedback==='saved'?'success':'info'}/>
  </>
}
const root=import.meta.hot?.data.root ?? createRoot(document.getElementById('root')!)
root.render(<MotionConfig reducedMotion="user"><ActionSheetProvider><MetronomeProvider><AudioModePlaybackProvider><Concept/></AudioModePlaybackProvider></MetronomeProvider></ActionSheetProvider></MotionConfig>)
if(import.meta.hot){import.meta.hot.accept();import.meta.hot.dispose(data=>{data.root=root})}

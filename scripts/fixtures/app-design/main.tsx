import { TakeGuidanceProvider } from '../../../src/context/TakeGuidanceContext'
// A review of production components, on a separate origin from the live app.
// Only data / capture callbacks are simulated. No microphone or camera is opened.
import { createRoot } from 'react-dom/client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import { ActionSheetProvider } from '../../../src/context/ActionSheetContext'
import { MetronomeProvider } from '../../../src/context/MetronomeContext'
import { AudioModePlaybackProvider } from '../../../src/context/AudioModePlaybackContext'
import RoutineBar from '../../../src/components/RoutineBar'
import PracticeHub from '../../../src/components/PracticeHub'
import RecordingHeader from '../../../src/components/RecordingHeader'
import ControlDeck from '../../../src/components/ControlDeck'
import AudioModeHome from '../../../src/components/audioPractice/AudioModeHome'
import PipCompareRow from '../../../src/components/PipCompareRow'
import AudioPracticeTopTabs from '../../../src/components/audioPractice/AudioPracticeTopTabs'
import AudioPracticeMetronomeView from '../../../src/components/audioPractice/AudioPracticeMetronomeView'
import { LiveAudioTunerPane, LivingPitchWidgetPane } from '../../../src/components/LivePitchTuner'
import LabsMenu from '../../../src/components/labs/LabsMenu'
import SettingsDrawer from '../../../src/components/SettingsDrawer'
import PitchInsightsScreen from '../../../src/components/audioPractice/PitchInsightsScreen'
import TakeVaultDrawer from '../../../src/components/TakeVaultDrawer'
import SettingsBranchWheel from '../../../src/components/SettingsBranchWheel'
import DraggablePitchWidget from '../../../src/components/DraggablePitchWidget'
import DraggableMetronomeWidget from '../../../src/components/DraggableMetronomeWidget'
import DraggableDroneWidget from '../../../src/components/DraggableDroneWidget'
import SplitCompareLayout from '../../../src/components/SplitCompareLayout'
import ReferenceWidget from '../../../src/components/ReferenceWidget'
import HandsFreeStage from '../../../src/components/HandsFreeStage'
import HandsFreeSettingsCard from '../../../src/components/HandsFreeSettingsCard'
import { savePracticeChart } from '../../../src/utils/practiceChartStorage'
import PracticeChartLayer from '../../../src/components/PracticeChartLayer'
import MusicWidget from '../../../src/components/practiceChart/MusicWidget'
import '../../../src/components/practice-chart.css'
import { DEFAULT_APP_SETTINGS } from '../../../src/utils/appSettings'
import { pickHudQuickSettings } from '../../../src/utils/hudQuickSettings'
import { drawSilkTuner } from '../../../src/utils/reactiveSilkTuner'
import { drawTraceOption, type TraceOption } from '../tuner-line-options/renderers'
import { appendTunerTrace, createTunerTrace, tunerTracePoints } from '../../../src/utils/tunerTrace'
import { appendTunerHistory } from '../../../src/utils/tunerHistory'
import type { TunerHistorySample } from '../../../src/utils/tunerHistory'
import type { Take } from '../../../src/types'
import type { Routine } from '../../../src/utils/practiceRoutines'
import type { DeskSnapshot } from '../../../src/utils/workspaceDesks'
import type { RoutineBuilderMode } from '../../../src/components/RoutineBuilder'
import '../../../src/index.css'
import '../../../src/styles/drone-keyboard.css'
import '../../../src/styles/drone-sound-wheel.css'
import '../../../src/styles/practice-system.css'
import '../../../src/styles/practice-hub.css'
import '../../../src/styles/practice-routines.css'
import '../../../src/styles/quick-tuner.css'
import '../../../src/styles/pitch-insights.css'
import '../../../src/styles/tablet.css'
import '../../../src/styles/interaction-polish.css'
import '../../../src/styles/refinement-concepts.css'
import '../../../src/styles/direction-concepts.css'
import '../../../src/styles/playful-main-tabs.css'
import '../../../src/styles/alternate-main-tabs.css'
import '../../../src/styles/fresh-concept.css'
import '../../../src/styles/fresh-family.css'
import '../../../src/styles/vibrant-depth.css'
import '../../../src/styles/camera-transparent-concepts.css'
import '../../../src/styles/electric-refinement.css'
import '../../../src/styles/arcade-style-concepts.css'
import '../../../src/styles/midnight-electric.css'
import '../../../src/styles/reactive-silk-tuner.css'
import openLensBaseCss from '../../../src/styles/open-lens.css?inline'
import '../../../src/styles/open-lens-system.css'
import './fixture.css'
import TakeGuidancePreview from './TakeGuidancePreview'
import '../../../src/styles/pocket-arcade.css'

import '../colorways/palettes.css'
import '../home-layouts/concepts.css'
const params = new URLSearchParams(location.search)
const homeDesign = params.get('homeDesign')
if (homeDesign && ['pair','focus','air'].includes(homeDesign)) document.documentElement.dataset.homeDesign = homeDesign
else delete document.documentElement.dataset.homeDesign
const colorway = params.get('colorway')
if (colorway && ['coral','teal','indigo'].includes(colorway)) document.documentElement.dataset.colorway = colorway
else delete document.documentElement.dataset.colorway
// Vite review server uses 5195. Refuse to run storage-owning components on 5194.
if (location.port !== '5195') location.replace(`http://127.0.0.1:5195${location.pathname}${location.search}`)
// Optional two-page test score, confined to the review origin's in-memory chart cache.
if (params.get('screen') === 'music' && params.get('sample') === '1') {
  const response = await fetch('/scripts/fixtures/app-design/music-layout-check.pdf')
  await savePracticeChart('design-review-music', new File([await response.arrayBuffer()], 'Music layout check.pdf', {type:'application/pdf'}))
}
const widgetDemo = params.get('screen') === 'widgets'
const demoWidget = widgetDemo ? (params.get('widget') || 'pitch') : ''
const initialScreen = widgetDemo ? (params.get('surface') === 'audio' ? 'audio' : 'camera') : (params.get('screen') || 'home')
const dark = params.get('dark') === '1'
const originalElectric = params.get('finish') === 'electric'
const requestedGameConcept=params.get('gameConcept')
const gameConcept=['glass','pocket','night'].includes(requestedGameConcept ?? '') ? requestedGameConcept : originalElectric ? null : 'pocket'
function applyGameConcept(screen:string) {
  if(screen==='games' && gameConcept) document.documentElement.dataset.gameConcept=gameConcept
  else delete document.documentElement.dataset.gameConcept
}
applyGameConcept(initialScreen)
if (!originalElectric) {
  document.getElementById('review-lens-base')?.remove()
  const style = document.createElement('style'); style.id='review-lens-base'; style.textContent = openLensBaseCss; document.head.append(style)
}
document.documentElement.classList.toggle('app-dark-mode', dark)
// Games use their own selected skin rather than the recording surface skin.
function applyReviewSkin(preserveOriginal:boolean) {
  document.documentElement.classList.toggle('lens-system', !preserveOriginal)
  document.documentElement.id = preserveOriginal ? '' : 'lens-design-system'
  const base = document.getElementById('review-lens-base') as HTMLStyleElement|null
  if(base)base.media = preserveOriginal ? 'not all' : 'all'
}
applyReviewSkin(originalElectric || initialScreen==='games')
document.documentElement.dataset.refinement = 'depth-electric'
document.documentElement.dataset.arcadeStyle = 'arcade-pop'
document.documentElement.dataset.lensFinish = params.get('finish') || 'glass'
const noop = () => {}
const desk: DeskSnapshot = {mode:'audio',pitchTrackerEnabled:false,showMetronome:false,showDrone:false,showMusic:false,showTakeCards:true,autoSoundRecording:false,audioEnhancerEnabled:false,metronome:{bpm:96,meter:'4/4',subdivision:'off'},drone:{pitchClass:null,octave:4},soundSilenceSeconds:2}
const sampleRoutine: Routine = {id:'demo-routine',name:'Daily warm-up',instrumentId:'trumpet',createdAt:1,updatedAt:1,steps:[
  {id:'one',title:'Long tones',minutes:3,kind:'tune',topic:'long-tones',desk:null,projectId:null,referenceQuery:'',referenceVideoId:null,programId:null,gameRoute:null},
  {id:'two',title:'Major scales',minutes:5,kind:'metro',topic:'scales',desk:null,projectId:null,referenceQuery:'',referenceVideoId:null,programId:null,gameRoute:null},
  {id:'three',title:'Record your piece',minutes:4,kind:'record',topic:'piece',desk:null,projectId:null,referenceQuery:'',referenceVideoId:null,programId:null,gameRoute:null},
]}
// Small, local sample WAV. Actual waveform decoding / playback components use it.
const sampleUrls:string[]=[]
function sampleWav() {
  const rate=8000, frames=rate*24, buffer=new ArrayBuffer(44+frames*2), data=new DataView(buffer)
  const word=(o:number,s:string)=>[...s].forEach((c,i)=>data.setUint8(o+i,c.charCodeAt(0)))
  word(0,'RIFF');data.setUint32(4,36+frames*2,true);word(8,'WAVE');word(12,'fmt ')
  data.setUint32(16,16,true);data.setUint16(20,1,true);data.setUint16(22,1,true);data.setUint32(24,rate,true);data.setUint32(28,rate*2,true);data.setUint16(32,2,true);data.setUint16(34,16,true);word(36,'data');data.setUint32(40,frames*2,true)
  for(let i=0;i<frames;i++){const t=i/rate, envelope=Math.pow(Math.sin(Math.PI*(t%3)/3),2)*(.55+.35*Math.sin(t*1.7)**2);data.setInt16(44+i*2,Math.sin(t*2*Math.PI*220)*envelope*5000,true)}
  const url=URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}));sampleUrls.push(url);return url
}
const wav=sampleWav()
window.addEventListener('pagehide',()=>sampleUrls.forEach(url=>URL.revokeObjectURL(url)),{once:true})
const demoTakes: Take[] = [0,1,2].map(i=>({id:`design-take-${i}`,name:['Long tones · Take 3','Long tones · Take 4','Scales · Take 1'][i],videoUrl:sampleWav(),filePath:'',videoMimeType:'audio/wav',mediaType:'audio',thumbnailUrl:'',timestamp:Date.now()-i*120000,duration:24,rating:0,notes:''}))

function useIllustratedVideo(enabled:boolean) {
  const [url,setUrl]=useState('')
  useEffect(()=>{
    if(!enabled||typeof MediaRecorder==='undefined')return
    let disposed=false, timer=0, result='', stream:MediaStream|undefined, recorder:MediaRecorder|undefined
    const image=new Image()
    image.onload=()=>{
      if(disposed)return
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=640
      canvas.getContext('2d')?.drawImage(image,0,0,320,640)
      stream=canvas.captureStream(1)
      const mime=['video/webm;codecs=vp8','video/webm','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t))
      if(!mime){stream.getTracks().forEach(t=>t.stop());return}
      recorder=new MediaRecorder(stream,{mimeType:mime});const chunks:BlobPart[]=[]
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}
      recorder.onstop=()=>{stream?.getTracks().forEach(t=>t.stop());if(disposed)return;result=URL.createObjectURL(new Blob(chunks,{type:mime}));setUrl(result)}
      recorder.start();timer=window.setTimeout(()=>{if(recorder?.state==='recording')recorder.stop()},1100)
    }
    image.src='/scripts/fixtures/app-design/studio.svg'
    return()=>{disposed=true;clearTimeout(timer);if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());if(result)URL.revokeObjectURL(result)}
  },[enabled])
  return url
}

function TunerPreview({widget=false}:{widget?:boolean}){
  const canvas=useRef<HTMLCanvasElement|null>(null), trace=useRef(createTunerTrace()), history=useRef<TunerHistorySample[]>([])
  const [readout,setReadout]=useState({noteName:'A4',midi:69,frequencyHz:440,cents:2})
  const [notes,setNotes]=useState<number[]>([]), [octave,setOctave]=useState(4)
  useEffect(()=>{
    const soak=params.get('soak')==='1', started=performance.now()
    let frames=0,lastReport=0,lastWash=0
    const report=document.createElement('output')
    if(soak){report.id='tuner-soak-report';report.style.cssText='position:fixed;top:0;left:0;z-index:99999;background:white;color:black;font:10px monospace;pointer-events:none';document.body.append(report)}
    const paint=()=>{
      const c=canvas.current;if(!c)return
      const now=performance.now(), cents=2+8*Math.sin(now/2100)+3*Math.sin(now/560)
      const next={noteName:'A4',midi:69,frequencyHz:440*2**(cents/1200),cents}
      appendTunerTrace(trace.current,now,cents);appendTunerHistory(history.current,now,next)
      setReadout(next)
      const w=c.clientWidth,h=c.clientHeight;if(!w||!h)return
      const dpr=Math.min(devicePixelRatio,2)
      if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr)}
      const ctx=c.getContext('2d');if(!ctx)return
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h)
      const study=params.get('traceStudy')
      const points=tunerTracePoints(trace.current.samples,now,w,h)
      const color=study && ['clean','beads','focus'].includes(study) && !widget
        ? drawTraceOption(ctx,w,h,points,dark,study as TraceOption)
        : drawSilkTuner(ctx,w,h,points,true,dark,!originalElectric && !widget)
      const overlay=c.closest<HTMLElement>('.app-ui-overlay--audio-practice-tuner')
      if(overlay && now-lastWash>=100){overlay.style.setProperty('--silk-wash',color);overlay.style.setProperty('--silk-live',color);lastWash=now}
      if(soak){frames++;if(now-lastReport>=1000){
        const heap=(performance as Performance & {memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize
        report.textContent=JSON.stringify({elapsedSeconds:Math.round((now-started)/1000),frames,traceSamples:trace.current.samples.length,historySamples:history.current.length,canvas:[c.width,c.height],heapMiB:heap?Math.round(heap/1048576):null})
        lastReport=now
      }}
    }
    // Simulated readings, with the production renderer, no pitch engine or microphone.
    const timer=window.setInterval(()=>{if(!document.hidden)paint()},soak?1000/60:50);paint()
    return()=>{clearInterval(timer);report.remove()}
  },[])
  if(widget)return <div className="pitch-tuner pitch-tuner--widget flex h-full min-h-0 w-full flex-col"><div className="pitch-glass-panel pitch-glass-panel--compact pitch-glass-panel--widget pitch-glass-panel--elevated relative flex h-full min-h-0 w-full flex-col overflow-hidden"><LivingPitchWidgetPane readout={readout} canvasRef={canvas} tunerTransposition="concert"/></div></div>
  return <LiveAudioTunerPane readout={readout} canvasRef={canvas} tunerInstrument="winds" tunerTransposition="concert" onTunerTranspositionChange={noop} onTunerInstrumentChange={noop} hapticsEnabled={false} insightsEnabled pitchHistory={history} visualTrace={trace} drone={{activeNotes:notes,octave,onToggleNote:n=>setNotes(v=>v.includes(n)?v.filter(x=>x!==n):[...v,n]),onGlissNote:(n,o)=>{setNotes([n]);setOctave(o)},onSetNotes:setNotes,onIncrementOctave:()=>setOctave(v=>v+1),onDecrementOctave:()=>setOctave(v=>v-1),hapticsEnabled:false}}/>
}

function Preview(){
  const [guidanceDismissed,setGuidanceDismissed]=useState(false)
  const guidanceStage=params.get('takeGuidance')
  const guidanceReference=params.get('guidanceReference')==='imported'?'imported':params.get('emptyBest')==='1'?'none':'best'
  const [referenceView,setReferenceView]=useState(false),[referenceRatio,setReferenceRatio]=useState(55)
  const referencePreview=useRef<HTMLVideoElement|null>(null)
  const [routinePreview,setRoutinePreview]=useState(params.get('routine')==='1'),[routinePaused,setRoutinePaused]=useState(false),[routineIndex,setRoutineIndex]=useState(0)
  const [routineStart,setRoutineStart]=useState<number|null>(Date.now())
  const [screen,setScreen]=useState(initialScreen), [capturing,setCapturing]=useState(false)
  const [instrument,setInstrument]=useState('trumpet'),[routine,setRoutine]=useState<Routine|null>(params.get('empty')==='1'?null:sampleRoutine)
  const [builder,setBuilder]=useState<RoutineBuilderMode|null>(initialScreen==='routines'?'build':null)
  const [settings,setSettings]=useState({...DEFAULT_APP_SETTINGS,darkMode:dark})
  const [takes,setTakes]=useState(params.get('empty')==='1'?[]:demoTakes)
  const [notice,setNotice]=useState(''),[references,setReferences]=useState(demoWidget==='references'),[referenceExpanded,setReferenceExpanded]=useState(true),[referenceLoaded,setReferenceLoaded]=useState(params.get('empty')!=='1'),[handsFreeSettings,setHandsFreeSettings]=useState(false)
  const [musicVisible,setMusicVisible]=useState(initialScreen==='music'),[musicChromeHidden,setMusicChromeHidden]=useState(false)
  const [widgets,setWidgets]=useState({pitch:demoWidget==='pitch',met:demoWidget==='met',drone:demoWidget==='drone',hands:demoWidget==='hands',music:demoWidget==='music',enhance:false,cards:true})
  const boundary=useRef<HTMLDivElement|null>(null),media1=useRef<HTMLMediaElement|null>(null),media2=useRef<HTMLMediaElement|null>(null),drop=useRef<HTMLDivElement|null>(null),stream=useRef<MediaStream|null>(null),anchor=useRef<HTMLDivElement|null>(null)
  const youtubeFrame=useRef<HTMLIFrameElement|null>(null)
  const video=screen==='camera', tools=['tuner','metronome','games'].includes(screen)
  const originalSurface=originalElectric || screen==='games'
  const widgetsVisible=!capturing && !['home','routines','settings','library','games'].includes(screen)
  useLayoutEffect(()=>{applyReviewSkin(originalSurface);applyGameConcept(screen)},[originalSurface,screen])
  const sampleVideo=useIllustratedVideo(video)
  const go=(s:string)=>{setCapturing(false);setScreen(s)}
  const note=(s:string)=>{setNotice(s)}
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),2600);return()=>clearTimeout(t)},[notice])
  useEffect(()=>{document.documentElement.classList.toggle('app-audio-mode',!video)},[video])
  useEffect(()=>{document.documentElement.classList.toggle('app-music-page',screen==='music'&&musicVisible);return()=>document.documentElement.classList.remove('app-music-page')},[screen,musicVisible])
  const openReferences=()=>{setReferences(true);setReferenceExpanded(true)}
  const toggleRecord=()=>{setGuidanceDismissed(false);setCapturing(v=>!v);note(capturing?'Recording preview stopped':'Recording preview · microphone is off')}
  const openRoutine=()=>{setBuilder('build');go('routines')}
  const fakeVideo=(take:Take):Take=>({...take,videoUrl:sampleVideo,videoMimeType:'video/webm',mediaType:'video',duration:1,thumbnailUrl:'/scripts/fixtures/app-design/studio.svg'})
  return <ActionSheetProvider><MetronomeProvider><AudioModePlaybackProvider>
    <TakeGuidanceProvider takeId={guidanceStage==='live'?takes[1]?.id??null:null} currentId={takes[1]?.id??null} enabled={!capturing} hasReference={guidanceReference!=='none'} importedReference={guidanceReference==='imported'} videoPlaying={false} currentVideo={media2} bestVideo={media1}>
    <div ref={boundary} className={`lens-screen app-shell ${guidanceStage && !guidanceDismissed && !capturing ? 'lens-guidance-preview' : ''} ${originalSurface ? 'lens-original-electric' : 'open-lens-recording'} ${video?'lens-camera':'app-shell--audio-mode'} ${capturing?'open-lens-capturing':''} ${screen==='music'&&musicVisible?'app-shell--music-page':''} ${musicChromeHidden&&screen==='music'?'app-shell--music-chrome-hidden':''}`} data-screen={screen}>
      {screen==='music'&&<PracticeChartLayer projectId="design-review-music" active boundaryRef={boundary} offerFileOnOpen={false}
        workspace={{pitchTrackerEnabled:widgets.pitch,showMetronome:widgets.met,showDrone:widgets.drone,showTakeCards:widgets.cards,showMusic:true,audioEnhancerEnabled:false}}
        onWorkspaceChange={(key,value)=>{const names={pitchTrackerEnabled:'pitch',showMetronome:'met',showDrone:'drone',showTakeCards:'cards'} as const;setWidgets(w=>({...w,[names[key]]:value}))}}
        onClose={()=>{setMusicChromeHidden(false);go('home')}} onPaperVisibleChange={setMusicVisible} onChromeHiddenChange={setMusicChromeHidden}
        isRecording={capturing} isStopping={false} recordReady recordElapsed={capturing?12:0} onToggleRecord={toggleRecord}
        handsFreeEnabled={widgets.hands} handsFreePhase={widgets.hands?'listening':null} onToggleHandsFree={()=>setWidgets(w=>({...w,hands:!w.hands}))}/>}
      <div className="lens-safe-top"/>
      <main className={`lens-content app-ui-overlay ${video?'':'app-ui-overlay--audio-mode'} ${tools?'app-ui-overlay--audio-practice-'+screen:'app-ui-overlay--audio-practice-record'}`}>
        {video&&<img className="lens-camera-backdrop" src="/scripts/fixtures/app-design/studio.svg" alt="Illustrated practice room, standing in for the camera"/>}
        {screen!=='music' && screen!=='games' && (tools || (originalSurface && !video) ? <>{originalSurface&&<div className="lens-tools-header"><button onClick={()=>go('audio')}>‹ Recording</button><span>Practice tools</span><button aria-label="Open settings" onClick={()=>go('settings')}><Settings/></button></div>}<AudioPracticeTopTabs includeRecording={originalSurface} activeTab={tools ? screen as 'tuner'|'metronome'|'games' : 'audio'} onTabChange={go}/></> : !originalSurface && <RecordingHeader mode={video?'video':'audio'} disabled={capturing} onModeChange={m=>go(m==='video'?'camera':'audio')} hapticFeedback={false}/>)}
        <div className="lens-stage">
          {guidanceStage && guidanceStage!=='live' && !guidanceDismissed && !capturing && takes[1] && (screen==='audio'||video) && <TakeGuidancePreview reference={guidanceReference} currentTake={takes[1]} bestTake={takes[0]??null} referenceUrl={wav} onRetry={toggleRecord} onClose={()=>setGuidanceDismissed(true)} />}
          {screen==='audio'||screen==='workspace'?<AudioModeHome isRecording={capturing} elapsed={12} ready={false} streamRef={stream} streamGeneration={0} challengerTake={takes[1]??null} benchmarkTake={guidanceReference==='imported'||params.get('emptyBest')==='1'?null:takes[0]??null} libraryBenchmarkPlayback={guidanceReference==='imported'?{id:'guidance-reference',name:'Teacher’s long tones',playbackUrl:wav,filePath:'',mimeType:'audio/wav',duration:24}:null} onRecord={toggleRecord} onExpandBenchmark={()=>note('Take preview · sample recording')} onExpandChallenger={()=>note('Take preview · sample recording')} onPinCurrentAsBest={()=>{setTakes(v=>[v[1],v[0],...v.slice(2)]);note('Current take pinned · preview only')}} onClearBenchmark={()=>setTakes(v=>v.filter((_,i)=>i!==0))} hapticFeedback={false}/>:null}
          {video&&widgets.cards&&<div className="app-pip-row-wrap app-pip-row-wrap--camera app-pip-row-wrap--compact"><PipCompareRow compact boundaryRef={boundary} benchmarkTake={params.get('emptyBest')==='1'?null:takes[0]?fakeVideo(takes[0]):null} challengerTake={takes[1]?fakeVideo(takes[1]):null} libraryBenchmarkPlayback={null} youtubeEmbedUrl={null} suspendPipPlayback benchmarkPipVideoRef={media1} challengerPipVideoRef={media2} deleteDropRef={drop} onPinBenchmark={noop} onMoveBenchmarkToCurrent={noop} onDeleteTake={noop} onUnpinBenchmark={noop} onUnpinChallenger={noop} onUploadBenchmark={noop} onSubmitYoutube={noop} onClearYoutube={noop} onToggleSplitView={noop} onExpandBenchmark={()=>note('Camera take preview · illustrated sample')} onExpandChallenger={()=>note('Camera take preview · illustrated sample')} hapticFeedback={false}/></div>}
          {screen==='tuner'&&<div className="pitch-tuner pitch-tuner--audio flex h-full min-h-0 flex-col"><TunerPreview/></div>}
          {screen==='metronome'&&<AudioPracticeMetronomeView onOpenProgram={()=>note('Program editor retained; this review focuses on the main screens.')}/>}
          {screen==='games'&&<LabsMenu hapticFeedback={false} tunerInstrument="winds" tunerTransposition="concert" onBack={()=>go('audio')} onOpenStaffJumper={()=>note('Staff Jumper · existing game retained')} onOpenBalance={()=>note('Balance · existing game retained')} onOpenLearnInstrument={()=>note('Learn your instrument · existing game retained')}/>}
        </div>
        {!(screen==='music'&&musicChromeHidden) && screen!=='games' && (originalElectric || screen!=='metronome')&&<div ref={anchor} className="lens-dock-container"><ControlDeck workspaceSections={!originalSurface} onToggleExpandView={!originalSurface?()=>note('Expanded view · opens the existing comparison screen in the app'):undefined} onOpenMultitrack={!originalSurface?()=>note('Multitrack · opens the existing studio in the app'):undefined} openLens={!originalSurface} libraryAboveRecord={!originalSurface} toolsActive={tools} onOpenAudioRecorder={!originalSurface ? ()=>go('audio') : undefined} ready isRecording={capturing} elapsed={capturing?12:0} recordingMode={video?'video':'audio'} onRecordingModeChange={m=>go(m==='video'?'camera':'audio')} onToggleRecord={tools?()=>go('audio'):toggleRecord} onOpenHome={()=>go('home')} onOpenSettings={()=>go('settings')} onOpenTools={()=>go('tuner')} onOpenVault={()=>go('library')} onOpenReferences={openReferences} autoSoundRecording={widgets.hands} onAutoSoundRecordingChange={v=>setWidgets(w=>({...w,hands:v}))} showMusic={widgets.music} musicToggleVisible onShowMusicChange={v=>setWidgets(w=>({...w,music:v}))} onPitchTrackerChange={v=>setWidgets(w=>({...w,pitch:v}))} onShowMetronomeChange={v=>setWidgets(w=>({...w,met:v}))} onShowDroneChange={v=>setWidgets(w=>({...w,drone:v}))} onShowTakeCardsChange={v=>setWidgets(w=>({...w,cards:v}))} onAudioEnhancerChange={v=>setWidgets(w=>({...w,enhance:v}))} pitchTrackerEnabled={widgets.pitch} showMetronome={widgets.met} showDrone={widgets.drone} showTakeCards={widgets.cards} audioEnhancerEnabled={widgets.enhance} hapticFeedback={false}/></div>}
      </main>
      <div className="lens-widget-layer" hidden={!widgetsVisible}>
        {widgets.pitch&&<DraggablePitchWidget visible={widgetsVisible} boundaryRef={boundary} positionId={`review-${originalElectric?'old':'new'}-pitch`} mediaRef={media1} isPlaying={false} mediaKey="review-pitch" enabled={false} liveMicEnabled={false} onClose={()=>setWidgets(w=>({...w,pitch:false}))}><TunerPreview widget/></DraggablePitchWidget>}
        {widgets.met&&<DraggableMetronomeWidget visible={widgetsVisible} boundaryRef={boundary} positionId={`review-${originalElectric?'old':'new'}-met`} defaultTopOffset={155} onClose={()=>setWidgets(w=>({...w,met:false}))}/>}
        {widgets.drone&&<DraggableDroneWidget visible={widgetsVisible} boundaryRef={boundary} positionId={`review-${originalElectric?'old':'new'}-drone`} defaultTopOffset={widgets.met?345:155} droneWaveform="sine" tunerTransposition="concert" hapticFeedback={false} onClose={()=>setWidgets(w=>({...w,drone:false}))}/>}
        {referenceView&&<div className="reference-expanded-preview"><button className="reference-expanded-back" onClick={()=>setReferenceView(false)}>Back to workspace</button><SplitCompareLayout referenceMode splitRatio={referenceRatio} onSplitRatioChange={setReferenceRatio} benchmarkTake={null}
          libraryBenchmarkPlayback={referenceLoaded?{id:'review-reference',name:'Teacher’s long tones',playbackUrl:wav,filePath:'',mimeType:'audio/wav',duration:24}:null}
          challengerTake={takes[1]??null} youtubeEmbedUrl={null} suspendPipPlayback={false} benchmarkPipVideoRef={media1} challengerPipVideoRef={media2} splitPreviewRef={referencePreview} streamRef={stream} streamGeneration={0} cameraNeedsPermission={false} recordingMode="audio" isRecording={false} cameraReady={false} pitchStageActive={false} metronomeStageActive={false}
          onUnpinBenchmark={()=>setReferenceLoaded(false)} onClearLibraryReference={()=>setReferenceLoaded(false)} onUnpinChallenger={noop} onClearYoutube={noop} onSubmitYoutube={noop} onUploadBenchmark={()=>note('Import a reference in the app')} onToggleSplitView={()=>setReferenceView(false)} onMoveBenchmarkToCurrent={noop} hapticFeedback={false}/></div>}
        {references&&!referenceView&&!originalElectric&&<ReferenceWidget onExpandView={()=>setReferenceView(true)} showTrackName boundaryRef={boundary} expanded={referenceExpanded} onExpandedChange={setReferenceExpanded} onClose={()=>setReferences(false)} youtubeUrl={null} libraryPlayback={referenceLoaded?{id:'review-reference',name:'Teacher’s long tones',playbackUrl:wav,filePath:'',mimeType:'audio/wav',duration:24}:null} suspended={!widgetsVisible} onSubmitYoutube={()=>note('Reference link selected · review only')} onUpload={()=>note('Audio selected · review only')} onClearAudio={()=>setReferenceLoaded(false)} onClearYoutube={noop} onYoutubeHostChange={noop} youtubeIframeRef={youtubeFrame} onPlaybackChange={noop} onBeforePlay={noop}/>}
        {widgets.hands&&<HandsFreeStage phase={widgetsVisible?"listening":null} elapsed={0} movable onLightBackground={!video} placement="chip" onTapForSettings={()=>setHandsFreeSettings(true)} onClose={()=>setWidgets(w=>({...w,hands:false}))}/>}
        {widgets.music&&<MusicWidget boundaryRef={boundary} visible={widgetsVisible} hasChart={false} fileName={null} pageView={null} paperVisible={false} busy={false} error="" fit="page" spreadAvailable={false} halfTurn={false} onAdd={()=>note('Choose sheet music · review only')} onRemove={()=>setWidgets(w=>({...w,music:false}))} onTurn={noop} onFitChange={noop} onHalfTurnChange={noop} onPaperVisibleChange={noop} chromeHidden={false} onChromeHiddenChange={noop} marker={null} inkWidth="medium" markCount={0} saving={false} onMarkerChange={noop} onInkWidthChange={noop} onUndoMark={noop} onClearMarks={noop} onSaveMarked={noop}/>}
      </div>
      <div className="lens-safe-bottom"><i/></div>
    </div>
    {routinePreview&&<RoutineBar routine={sampleRoutine} day={null} step={sampleRoutine.steps[routineIndex]} nextStep={sampleRoutine.steps[routineIndex+1]??null} startedAt={routineStart} paused={routinePaused} audioSurface={!video} tunerTransposition="concert" hapticFeedback={false}
      onResume={()=>{setRoutinePaused(false);setRoutineStart(Date.now())}} onPause={()=>{setRoutinePaused(true);setRoutineStart(null)}} onClose={()=>setRoutinePreview(false)} onDone={()=>{if(routineIndex===sampleRoutine.steps.length-1)setRoutinePreview(false);else{setRoutineIndex(i=>i+1);setRoutineStart(Date.now())}}}
      onJumpToStep={id=>{setRoutineIndex(sampleRoutine.steps.findIndex(step=>step.id===id));setRoutineStart(Date.now())}} onOpenToday={()=>go('home')}/>}
    <PracticeHub isOpen={screen==='home'||screen==='routines'} projects={[]} takes={takes} tunerTransposition="concert" hapticFeedback={false} onClose={()=>go('audio')} onOpenSettings={()=>go('settings')} onOpenQuickPractice={()=>go('audio')} onOpenGames={()=>go('games')} onDailyPractice={()=>{setRoutine(sampleRoutine);openRoutine()}} onDailyGame={()=>go('games')} onOpenVault={()=>go('library')} onOpenTuner={()=>go('tuner')} onOpenMetronome={()=>go('metronome')} onOpenMusic={()=>go('music')} routine={routine} routineDay={null} routineBuilderRequest={builder} instrumentId={instrument} liveDeskSnapshot={desk} onSelectInstrument={setInstrument} onStartRoutineStep={async()=>go('tuner')} onToggleRoutineStep={noop} onOpenRoutineBuilder={m=>{setBuilder(m);go('routines')}} onCloseRoutineBuilder={()=>{setBuilder(null);go('home')}} onSaveRoutine={r=>{setRoutine(r);setBuilder(null);go('home')}} onSaveAndStartRoutine={async r=>{setRoutine(r);setBuilder(null);go('tuner')}} onCreatePracticeItem={async()=> 'demo-project'} onDeleteRoutine={()=>setRoutine(null)}/>
    <PitchInsightsScreen isOpen={screen==='insights'} onClose={()=>go('tuner')} hapticFeedback={false}/>
    <SettingsDrawer isOpen={screen==='settings'} onClose={()=>go('audio')} settings={settings} hudQuickSettings={pickHudQuickSettings(settings)} onUpdate={patch=>setSettings(s=>({...s,...patch}))} onAudioEnhancerChange={noop} onReset={()=>setSettings(DEFAULT_APP_SETTINGS)} onOpenLabs={()=>go('games')} onOpenQuickTuner={()=>go('tuner')} onOpenQuickMetronome={()=>go('metronome')}/>
    <TakeVaultDrawer simplified={!originalSurface} isOpen={screen==='library'} onClose={()=>go('audio')} projects={[]} activeProject={null} onSelectProject={noop} onCreateProject={noop} takes={takes} bestTakeHistory={[]} sortedTakes={takes} sortMode="newest" onSortChange={noop} benchmarkId={takes[0]?.id??null} benchmarkBinding={null} challengerId={takes[1]?.id??null} libraryItems={[]} onImportLibraryAudio={noop} onRenameLibraryItem={noop} onDeleteLibraryItem={noop} onSetLibraryReference={noop} onPinBenchmark={noop} onPinChallenger={noop} onUpdateTake={noop} onDeleteTake={id=>setTakes(v=>v.filter(t=>t.id!==id))} onDeleteTakes={ids=>setTakes(v=>v.filter(t=>!ids.includes(t.id)))} onClearAllTakes={()=>setTakes([])} onOpenTake={()=>note('Sample take · review data only')}/>
    <SettingsBranchWheel workspaceSections={!originalSurface} workspaceActionsVisible={!originalSurface} onToggleExpandView={()=>note('Expanded view · opens the existing comparison screen in the app')} onOpenMultitrack={()=>note('Multitrack · opens the existing studio in the app')} open={screen==='workspace'} showDrone={widgets.drone} droneToggleVisible onShowDroneChange={v=>setWidgets(w=>({...w,drone:v}))} handsFreeEnabled={widgets.hands} handsFreeToggleVisible onHandsFreeChange={v=>setWidgets(w=>({...w,hands:v}))} showMusic={widgets.music} musicToggleVisible onShowMusicChange={v=>setWidgets(w=>({...w,music:v}))} onClose={()=>go('audio')} anchorRef={anchor} pitchTrackerEnabled={widgets.pitch} showTakeCards={widgets.cards} showMetronome={widgets.met} audioEnhancerEnabled={widgets.enhance} pitchToggleVisible onPitchTrackerChange={v=>setWidgets(w=>({...w,pitch:v}))} onShowTakeCardsChange={v=>setWidgets(w=>({...w,cards:v}))} onShowMetronomeChange={v=>setWidgets(w=>({...w,met:v}))} onAudioEnhancerChange={v=>setWidgets(w=>({...w,enhance:v}))} onOpenReferences={()=>{go('audio');openReferences()}} hapticFeedback={false}/>
    <HandsFreeSettingsCard open={handsFreeSettings} silenceSeconds={settings.soundSilenceSeconds} volumeThreshold={settings.soundVolumeThreshold} hapticFeedback={false} onSilenceSecondsChange={v=>setSettings(s=>({...s,soundSilenceSeconds:v}))} onVolumeThresholdChange={v=>setSettings(s=>({...s,soundVolumeThreshold:v}))} onClose={()=>setHandsFreeSettings(false)}/>
    {notice&&<div className="lens-notice" role="status">{notice}</div>}
  </TakeGuidanceProvider></AudioModePlaybackProvider></MetronomeProvider></ActionSheetProvider>
}
if(location.port==='5195'){
  const root=import.meta.hot?.data.root ?? createRoot(document.getElementById('root')!)
  root.render(<Preview/>)
  if(import.meta.hot){import.meta.hot.accept();import.meta.hot.dispose(data=>{data.root=root;sampleUrls.forEach(url=>URL.revokeObjectURL(url))})}
}

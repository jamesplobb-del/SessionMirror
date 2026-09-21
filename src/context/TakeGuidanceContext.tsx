import { advanceTakeGuidance } from '../utils/takeGuidance'
import { subscribeTakeBoxCompletion } from '../utils/nativeInlineTakeBoxPlayback'
import { createContext, useContext, useEffect, useState, type ReactNode, type RefObject } from 'react'
import { useAudioModePlayback } from './AudioModePlaybackContext'
import '../styles/take-guidance.css'

type Tone = 'current' | 'best'
const Context = createContext<{ tone: Tone | null; reference: boolean; firstUse: boolean }>({ tone: null, reference: false, firstUse: false })

/** Only new captures opt in. Never changes a reference or starts playback. */
export function TakeGuidanceProvider({ takeId, currentId, enabled, hasReference, importedReference, videoPlaying, currentVideo, bestVideo, children }: {
  takeId: string | null; currentId: string | null; enabled: boolean; hasReference: boolean; importedReference: boolean; videoPlaying: boolean
  currentVideo: RefObject<HTMLMediaElement | null>; bestVideo: RefObject<HTMLMediaElement | null>; children: ReactNode
}) {
  const [firstUse,setFirstUse]=useState(()=>{try{return localStorage.getItem('besttake.take-guidance.seen')!=='1'}catch{return true}})
  const audio = useAudioModePlayback()
  const [progress,setProgress]=useState<{id:string|null;stage:Tone|'done'}>({id:null,stage:'current'})
  const [mediaPlaying,setMediaPlaying]=useState(false)
  const stage=progress.id===takeId?progress.stage:'current'
  useEffect(()=>{
    // Selecting a different saved take ends this capture's guidance permanently.
    if(takeId && currentId!==takeId)setProgress({id:takeId,stage:'done'})
  },[takeId,currentId])
  useEffect(()=>subscribeTakeBoxCompletion(tone=>{
    if(!enabled||!takeId||takeId!==currentId)return
    if(tone==='current'){setFirstUse(false);try{localStorage.setItem('besttake.take-guidance.seen','1')}catch{/* Optional first-use memory. */}}
    setProgress(p=>({id:takeId,stage:advanceTakeGuidance(p.id===takeId?p.stage:'current',tone,hasReference)}))
  }),[enabled,takeId,currentId,hasReference])
  useEffect(()=>{
    const isCurrent=(media:EventTarget|null)=>media===currentVideo.current || (media===audio.playerRef.current && (audio.state.currentItem?.takeId??audio.state.currentItem?.id)===takeId)
    const relevant=(media:EventTarget|null)=>media===currentVideo.current || media===bestVideo.current || media===audio.playerRef.current
    const play=(event:Event)=>{if(relevant(event.target))setMediaPlaying(true);if(enabled&&takeId&&isCurrent(event.target)){setFirstUse(false);try{localStorage.setItem('besttake.take-guidance.seen','1')}catch{/* Guidance works without storage. */}}}
    const pause=(event:Event)=>{if(relevant(event.target))setMediaPlaying(false)}
    const ended=(event:Event)=>{
      if(!enabled||!takeId||currentId!==takeId||!relevant(event.target))return
      setMediaPlaying(false)
      // Pause, interruption, and source replacement never count as completing a take.
      const tone=isCurrent(event.target)?'current':'best'
      setProgress(p=>({id:takeId,stage:advanceTakeGuidance(p.id===takeId?p.stage:'current',tone,hasReference)}))
    }
    document.addEventListener('play',play,true);document.addEventListener('pause',pause,true);document.addEventListener('ended',ended,true)
    return()=>{document.removeEventListener('play',play,true);document.removeEventListener('pause',pause,true);document.removeEventListener('ended',ended,true)}
  },[audio.playerRef,audio.state.currentItem,takeId,currentId,enabled,hasReference,currentVideo,bestVideo])
  const visible=enabled&&takeId!==null&&takeId===currentId&&!audio.state.isPlaying&&!videoPlaying&&!mediaPlaying
  const tone=visible&&stage!=='done'&&(stage!=='best'||hasReference)?stage:null
  return <Context.Provider value={{tone,reference:importedReference,firstUse}}>{children}</Context.Provider>
}

export function useTakeGuidance(tone:Tone, ready=true) {
  const guidance=useContext(Context)
  const visible=ready&&guidance.tone===tone
  const [emphasis,setEmphasis]=useState(false)
  useEffect(()=>{
    setEmphasis(visible)
    if(!visible)return
    const timer=window.setTimeout(()=>setEmphasis(false),2600)
    return()=>clearTimeout(timer)
  },[visible])
  return {visible,emphasis,label:tone==='current'?(guidance.firstUse?'Start here · Listen back':'Listen back'):guidance.reference?'Listen to reference':'Listen to Best Take'}
}

export function TakeGuidanceLabel({tone,ready=true}:{tone:Tone;ready?:boolean}) {
  const cue=useTakeGuidance(tone,ready)
  return cue.visible?<span className="take-guidance-label" role="status">{cue.label}</span>:null
}

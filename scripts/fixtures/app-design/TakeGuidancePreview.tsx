import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAudioModePlayback } from '../../../src/context/AudioModePlaybackContext'
import { useAudioModeTakeItem } from '../../../src/hooks/useAudioModeTakeItem'
import type { Take } from '../../../src/types'
import './take-guidance-preview.css'

/** Isolated preview: guidance attaches to existing take cards, never to a floating menu. */
export default function TakeGuidancePreview({ reference, currentTake }: {
  reference: 'best' | 'imported' | 'none'; currentTake: Take; bestTake: Take | null; referenceUrl: string; onRetry: () => void; onClose: () => void
}) {
  const initial=new URLSearchParams(location.search).get('cueStage')||'current'
  const [stage,setStage]=useState(initial)
  const [playing,setPlaying]=useState(false)
  const [host,setHost]=useState<HTMLElement|null>(null)
  const playback=useAudioModePlayback()
  const current=useAudioModeTakeItem({tone:'current',take:currentTake}).playbackItem
  useEffect(()=>{
    const ended=(event:Event)=>{
      const media=event.target as HTMLMediaElement
      const card=media.closest('.compact-take-slot')
      if(card?.classList.contains('compact-take-slot--current') || (media===playback.playerRef.current && current && playback.matchesCurrentSource(current)))setStage(reference==='none'?'done':'best')
      else setStage('done')
      setPlaying(false)
    }
    const start=()=>setPlaying(true)
    const pause=()=>setPlaying(false)
    document.addEventListener('play',start,true)
    document.addEventListener('pause',pause,true)
    document.addEventListener('ended',ended,true)
    return()=>{document.removeEventListener('play',start,true);document.removeEventListener('pause',pause,true);document.removeEventListener('ended',ended,true)}
  },[playback,current,reference])
  useEffect(()=>{
    if(stage==='done'||playing||(stage==='best'&&reference==='none')){setHost(null);return}
    const tone=stage==='best'?'best':'current'
    const card=document.querySelector<HTMLElement>(`.audio-mode-take-card--${tone},.compact-take-slot--${tone}`)
    if(!card)return
    const detail=card.querySelector<HTMLElement>('.compact-take-caption__detail')
    const button=card.querySelector<HTMLElement>('.audio-mode-take-card__play,button[aria-label*="Play"],button[aria-label*="play"]')
    const target=button??card
    target.classList.add('take-cue-emphasis')
    card.classList.add('take-cue-owner')
    if(detail)detail.classList.add('take-cue-caption')
    setHost(detail??card)
    const timeout=window.setTimeout(()=>target.classList.remove('take-cue-emphasis'),2600)
    return()=>{clearTimeout(timeout);target.classList.remove('take-cue-emphasis');card.classList.remove('take-cue-owner');detail?.classList.remove('take-cue-caption')}
  },[stage,playing,currentTake.id,reference])
  if(!host)return null
  const text=stage==='best'?(reference==='imported'?'Listen to reference':'Listen to Best Take'):'Listen back'
  return createPortal(<span className="take-inline-cue" role="status">{initial==='first'&&stage==='first'?'Start here · ':''}{text}</span>,host)
}

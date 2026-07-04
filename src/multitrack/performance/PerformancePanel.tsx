import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Film, Pause, Play, Trash2, Video } from 'lucide-react'
import { assignMediaPlaybackSrc } from '../../utils/mediaPlayback'
import { playTakeMediaAudible } from '../../utils/takePlaybackAudio'
import { resolveTakePlaybackUrl } from '../../utils/takeStorage'
import Pressable from '../../components/ui/Pressable'
import type { MultitrackRecordingPhase, PerformancePanelState } from '../types'

export default function PerformancePanel({ panel, isRecordingTarget, recordingPhase, onTap, onRemoveTake, onRegisterMedia }: {
  panel: PerformancePanelState
  isRecordingTarget: boolean
  recordingPhase: MultitrackRecordingPhase
  onTap: () => void
  onRemoveTake: () => void
  onRegisterMedia: (panelId: string, element: HTMLMediaElement | null) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [quickPlaying, setQuickPlaying] = useState(false)

  useEffect(() => {
    let cancelled = false
    const video = videoRef.current

    if (!panel.take || !video) {
      onRegisterMedia(panel.id, null)
      return undefined
    }

    video.muted = true
    video.volume = 1
    video.preload = 'auto'
    video.setAttribute('playsinline', 'true')
    video.setAttribute('webkit-playsinline', 'true')

    void resolveTakePlaybackUrl(panel.take.filePath, panel.take.videoUrl).then((url) => {
      if (cancelled || !url) return
      assignMediaPlaybackSrc(video, url)
      video.load()
      onRegisterMedia(panel.id, video)
    })

    return () => {
      cancelled = true
      onRegisterMedia(panel.id, null)
    }
  }, [onRegisterMedia, panel.id, panel.take])

  useEffect(() => {
    setQuickPlaying(false)
  }, [panel.take?.id])

  if (!panel.take) {
    return (
      <Pressable type="button" intensity="soft" onClick={onTap} className="multitrack-panel multitrack-panel--empty" aria-label="Record performance take">
        <Video className="h-8 w-8 text-stone-400" />
        <span className="mt-2 text-sm font-medium text-stone-500">Tap to record</span>
        {isRecordingTarget && recordingPhase !== 'idle' && <span className="mt-1 text-xs font-semibold text-red-500">{recordingPhase === 'count-in' ? 'Count-in…' : 'Recording…'}</span>}
      </Pressable>
    )
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onTap()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={handleKeyDown}
      className={`multitrack-panel multitrack-panel--performance ${isRecordingTarget ? 'multitrack-panel--recording' : ''}`}
      aria-label="Record another take in this box"
    >
      <video ref={videoRef} className="multitrack-panel__media" playsInline preload="metadata" onEnded={() => setQuickPlaying(false)} />
      <div className="multitrack-panel__overlay">
        <div className="multitrack-panel__label"><Film className="h-3.5 w-3.5" /><span>{panel.take.name || 'Performance'}</span></div>
        <div className="multitrack-panel__actions">
          <Pressable
            type="button"
            intensity="soft"
            onClick={(event) => {
              event.stopPropagation()
              const video = videoRef.current
              if (!video) return
              if (quickPlaying) {
                video.pause()
                setQuickPlaying(false)
                return
              }
              try {
                video.currentTime = 0
              } catch {
                /* media may still be loading */
              }
              void playTakeMediaAudible(video).then(setQuickPlaying)
            }}
            aria-label={quickPlaying ? 'Pause take' : 'Play take'}
            className="multitrack-panel__action"
          >
            {quickPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Pressable>
          <Pressable
            type="button"
            intensity="soft"
            onClick={(event) => {
              event.stopPropagation()
              onRemoveTake()
            }}
            aria-label="Remove take"
            className="multitrack-panel__action"
          >
            <Trash2 className="h-4 w-4" />
          </Pressable>
        </div>
      </div>
    </div>
  )
}

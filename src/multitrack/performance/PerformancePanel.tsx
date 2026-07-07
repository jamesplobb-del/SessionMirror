import { useEffect, useRef, useState } from 'react'
import { Film, MoreHorizontal, Pause, Play, Video, X } from 'lucide-react'
import { playTakeMediaFromUserGesture } from '../../utils/takePlaybackAudio'
import Pressable from '../../components/ui/Pressable'
import TakeVideoPlayer from '../../components/TakeVideoPlayer'
import type { MultitrackRecordingPhase, PerformancePanelState } from '../types'

export default function PerformancePanel({ panel, isRecordingTarget, recordingPhase, onTap, onRemoveTake, onRegisterMedia }: {
  panel: PerformancePanelState
  isRecordingTarget: boolean
  recordingPhase: MultitrackRecordingPhase
  onTap: () => void
  onRemoveTake: () => void
  onRegisterMedia: (panelId: string, element: HTMLMediaElement | null) => void
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [quickPlaying, setQuickPlaying] = useState(false)

  useEffect(() => {
    onRegisterMedia(panel.id, panel.take ? mediaRef.current : null)
    return () => onRegisterMedia(panel.id, null)
  }, [onRegisterMedia, panel.id, panel.take?.id])

  useEffect(() => {
    setQuickPlaying(false)
  }, [panel.take?.id])

  if (!panel.take) {
    return (
      <Pressable type="button" intensity="soft" onClick={onTap} className="multitrack-panel multitrack-panel--empty" aria-label="Add to this tile">
        <Video className="h-8 w-8 text-stone-400" />
        <span className="mt-2 text-sm font-medium text-stone-500">Tap to add</span>
        {isRecordingTarget && recordingPhase !== 'idle' && (
          <span className="mt-1 text-xs font-semibold text-red-500">
            {recordingPhase === 'count-in' ? 'Count-in…' : recordingPhase === 'review' ? 'Reviewing…' : 'Recording…'}
          </span>
        )}
      </Pressable>
    )
  }

  const toggleQuickPlayback = () => {
    const media = mediaRef.current
    if (!media) return
    if (quickPlaying) {
      media.pause()
      setQuickPlaying(false)
      return
    }
    try {
      media.currentTime = 0
    } catch {
      /* media may still be loading */
    }
    void playTakeMediaFromUserGesture(media, {
      onPlaying: () => setQuickPlaying(true),
      onFailure: () => setQuickPlaying(false),
    })
  }

  return (
    <Pressable
      type="button"
      intensity="soft"
      squish={false}
      onClick={toggleQuickPlayback}
      className={`multitrack-panel multitrack-panel--performance ${isRecordingTarget ? 'multitrack-panel--recording' : ''}`}
      aria-label={quickPlaying ? 'Pause take' : 'Play take'}
    >
      <TakeVideoPlayer
        filePath={panel.take.filePath}
        videoUrl={panel.take.videoUrl}
        mimeType={panel.take.videoMimeType}
        videoRef={mediaRef}
        videoSourceKey={panel.take.id}
        className="multitrack-panel__media"
        loadingClassName="multitrack-panel__media multitrack-panel__media--loading"
        mirror={panel.take.mirrorPlayback !== false}
        recordingOrientation={panel.take.recordingOrientation}
        fit="cover"
        eagerLoad
        preload="auto"
        manualPlayOnly
        audible
        poster={panel.take.thumbnailUrl || undefined}
        onLoadedMetadata={(event) => onRegisterMedia(panel.id, event.currentTarget)}
        onCanPlay={(event) => onRegisterMedia(panel.id, event.currentTarget)}
        onEnded={() => setQuickPlaying(false)}
      />
      <Pressable
        type="button"
        intensity="icon"
        className="multitrack-panel__remove"
        aria-label="Remove video"
        onClick={(event) => {
          event.stopPropagation()
          onRemoveTake()
        }}
      >
        <X className="h-3.5 w-3.5" />
      </Pressable>
      <div className="multitrack-panel__overlay">
        <div className="multitrack-panel__label"><Film className="h-3.5 w-3.5" /><span>{panel.take.name || 'Performance'}</span></div>
        <div className="multitrack-panel__actions">
          <Pressable
            type="button"
            intensity="soft"
            onClick={(event) => {
              event.stopPropagation()
              toggleQuickPlayback()
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
              onTap()
            }}
            aria-label="Tile options"
            className="multitrack-panel__action"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Pressable>
        </div>
      </div>
    </Pressable>
  )
}

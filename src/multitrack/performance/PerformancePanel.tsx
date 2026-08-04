import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Film, MoreHorizontal, Pause, Play, Video, X } from 'lucide-react'
import { playTakeMediaFromUserGesture } from '../../utils/takePlaybackAudio'
import Pressable from '../../components/ui/Pressable'
import TakeVideoPlayer from '../../components/TakeVideoPlayer'
import type { Take } from '../../types'
import type { MultitrackRecordingPhase, PerformancePanelState } from '../types'
import MultitrackCapturePanel from './MultitrackCapturePanel'

export default function PerformancePanel({
  panel,
  isRecordingTarget,
  recordingPhase,
  streamRef,
  streamGeneration = 0,
  nativeLivePreviewActive = false,
  nativeCameraBridgeEnabled = false,
  countInRemaining = 0,
  recordingElapsed = 0,
  reviewTake = null,
  reviewMediaRef,
  onTap,
  onRemoveTake,
  onRegisterMedia,
}: {
  panel: PerformancePanelState
  isRecordingTarget: boolean
  recordingPhase: MultitrackRecordingPhase
  streamRef?: RefObject<MediaStream | null>
  streamGeneration?: number
  nativeLivePreviewActive?: boolean
  nativeCameraBridgeEnabled?: boolean
  countInRemaining?: number
  recordingElapsed?: number
  reviewTake?: Take | null
  reviewMediaRef?: RefObject<HTMLMediaElement | null>
  onTap: () => void
  onRemoveTake: () => void
  onRegisterMedia: (panelId: string, element: HTMLMediaElement | null) => void
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [quickPlaying, setQuickPlaying] = useState(false)

  useEffect(() => {
    onRegisterMedia(panel.id, panel.take && !isRecordingTarget ? mediaRef.current : null)
    return () => onRegisterMedia(panel.id, null)
  }, [isRecordingTarget, onRegisterMedia, panel.id, panel.take?.id])

  useEffect(() => {
    setQuickPlaying(false)
  }, [panel.take?.id])

  if (isRecordingTarget && streamRef && reviewMediaRef) {
    return (
      <MultitrackCapturePanel
        streamRef={streamRef}
        streamGeneration={streamGeneration}
        nativeLivePreviewActive={nativeLivePreviewActive}
        nativeCameraBridgeEnabled={nativeCameraBridgeEnabled}
        phase={recordingPhase}
        countInRemaining={countInRemaining}
        elapsed={recordingElapsed}
        reviewTake={reviewTake}
        reviewMediaRef={reviewMediaRef}
      />
    )
  }

  if (!panel.take) {
    return (
      <Pressable type="button" intensity="soft" onClick={onTap} className="multitrack-panel multitrack-panel--empty" aria-label="Add to this tile">
        <Video className="h-8 w-8 text-stone-400" />
        <span className="mt-2 text-sm font-medium text-stone-500">Tap to add</span>
        {isRecordingTarget && recordingPhase !== 'idle' && (
          <span className="mt-1 text-xs font-semibold text-red-500">
            {recordingPhase === 'arming'
              ? 'Loading…'
              : recordingPhase === 'count-in'
                ? 'Count-in…'
                : recordingPhase === 'review'
                  ? 'Reviewing…'
                  : 'Recording…'}
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
        mirror={panel.take.mirrorPlayback === true}
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

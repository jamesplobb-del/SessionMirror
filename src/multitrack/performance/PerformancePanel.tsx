import { useCallback, useEffect, useRef } from 'react'
import { Film, Plus, Trash2 } from 'lucide-react'
import type { Take } from '../../types'
import { assignMediaPlaybackSrc } from '../../utils/mediaPlayback'
import { resolveTakePlaybackUrl } from '../../utils/takeStorage'
import Pressable from '../../components/ui/Pressable'
import type { MultitrackRecordingPhase, PerformancePanelState } from '../types'

export default function PerformancePanel({ panel, isRecordingTarget, recordingPhase, onTapEmpty, onRemoveTake, onRegisterMedia }: {
  panel: PerformancePanelState
  isRecordingTarget: boolean
  recordingPhase: MultitrackRecordingPhase
  onTapEmpty: () => void
  onRemoveTake: () => void
  onRegisterMedia: (panelId: string, element: HTMLMediaElement | null) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const loadTake = useCallback(async (take: Take) => {
    const video = videoRef.current
    if (!video) return
    assignMediaPlaybackSrc(video, await resolveTakePlaybackUrl(take.filePath, take.videoUrl))
    video.load()
  }, [])

  useEffect(() => {
    onRegisterMedia(panel.id, panel.take ? videoRef.current : null)
    return () => onRegisterMedia(panel.id, null)
  }, [onRegisterMedia, panel.id, panel.take])

  useEffect(() => { if (panel.take) void loadTake(panel.take) }, [loadTake, panel.take])

  if (!panel.take) {
    return (
      <Pressable type="button" intensity="soft" onClick={onTapEmpty} className="multitrack-panel multitrack-panel--empty" aria-label="Add performance take">
        <Plus className="h-8 w-8 text-stone-400" />
        <span className="mt-2 text-sm font-medium text-stone-500">Add performance</span>
        {isRecordingTarget && recordingPhase !== 'idle' && <span className="mt-1 text-xs font-semibold text-red-500">{recordingPhase === 'count-in' ? 'Count-in…' : 'Recording…'}</span>}
      </Pressable>
    )
  }

  return (
    <div className={`multitrack-panel multitrack-panel--performance ${isRecordingTarget ? 'multitrack-panel--recording' : ''}`}>
      <video ref={videoRef} className="multitrack-panel__media" playsInline preload="metadata" />
      <div className="multitrack-panel__overlay">
        <div className="multitrack-panel__label"><Film className="h-3.5 w-3.5" /><span>{panel.take.name || 'Performance'}</span></div>
        <Pressable type="button" intensity="soft" onClick={onRemoveTake} aria-label="Remove take" className="multitrack-panel__action"><Trash2 className="h-4 w-4" /></Pressable>
      </div>
    </div>
  )
}

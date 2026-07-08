import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Pause, Play, RotateCcw, X } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import type { PerformancePanelState } from '../types'
import type { useMultitrackSync } from '../synchronization/useMultitrackSync'
import { useMediaWaveform } from '../../hooks/useMediaWaveform'
import { extractNativeWaveformPeaks } from '../../utils/nativeWaveform'

type SyncApi = ReturnType<typeof useMultitrackSync>

/** Pixels per second of timeline — the single knob controlling zoom. */
const PX_PER_SEC = 70
/** Left padding so a clip can be dragged to start before timeline zero (negative offset). */
const TIMELINE_ORIGIN_PX = 220
const MIN_CLIP_SEC = 0.2

export interface AlignClipState {
  panelId: string
  takeId: string
  label: string
  filePath: string
  videoUrl: string
  duration: number
  offsetMs: number
  trimStart: number
  trimEnd: number | undefined
}

interface MultitrackAlignStageProps {
  isOpen: boolean
  panels: PerformancePanelState[]
  sync: SyncApi
  onClose: () => void
  onPreviewToggle: () => void
  onDone: (
    changes: Array<{ panelId: string; takeId: string; offsetMs: number; trimStart: number; trimEnd: number | undefined }>,
  ) => Promise<void>
}

function secToPx(sec: number): number {
  return TIMELINE_ORIGIN_PX + sec * PX_PER_SEC
}

function pxToSec(px: number): number {
  return px / PX_PER_SEC
}

/** Waveform bars for one clip's KEPT (trimmed) region only, scaled to fill the block. */
function ClipWaveform({
  filePath,
  videoUrl,
  duration,
  trimStart,
  trimEndValue,
  widthPx,
}: {
  filePath: string
  videoUrl: string
  duration: number
  trimStart: number
  trimEndValue: number
  widthPx: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fullBarCount = 220
  const jsPeaks = useMediaWaveform({ filePath, mediaUrl: videoUrl, barCount: fullBarCount })
  const [nativePeaks, setNativePeaks] = useState<number[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void extractNativeWaveformPeaks({ filePath, videoUrl }, fullBarCount).then((peaks) => {
      if (!cancelled) setNativePeaks(peaks)
    })
    return () => {
      cancelled = true
    }
  }, [filePath, videoUrl])

  const peaks = nativePeaks ?? jsPeaks

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || peaks.length === 0 || duration <= 0 || widthPx <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const h = canvas.offsetHeight
    canvas.width = widthPx * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, widthPx, h)

    const startIdx = Math.max(0, Math.floor((trimStart / duration) * peaks.length))
    const endIdx = Math.min(peaks.length, Math.ceil((trimEndValue / duration) * peaks.length))
    const slice = peaks.slice(startIdx, Math.max(startIdx + 1, endIdx))
    if (slice.length === 0) return

    const gap = widthPx / slice.length
    const barW = Math.max(1, gap * 0.68)
    for (let i = 0; i < slice.length; i += 1) {
      const amp = Math.min(1, slice[i])
      const barH = Math.max(2, amp * h * 0.78)
      const x = i * gap
      const y = (h - barH) / 2
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.beginPath()
      ctx.roundRect(x, y, barW, barH, 1)
      ctx.fill()
    }
  }, [peaks, duration, trimStart, trimEndValue, widthPx])

  return <canvas ref={canvasRef} className="multitrack-align-stage__clip-waveform" />
}

function ClipTrack({
  clip,
  onChange,
}: {
  clip: AlignClipState
  onChange: (next: Partial<Pick<AlignClipState, 'offsetMs' | 'trimStart' | 'trimEnd'>>) => void
}) {
  const dragRef = useRef<{
    mode: 'move' | 'trim-start' | 'trim-end'
    startX: number
    startOffsetMs: number
    startTrimStart: number
    startTrimEnd: number
  } | null>(null)

  const duration = clip.duration > 0 ? clip.duration : 60
  const trimEndValue = clip.trimEnd ?? duration
  const clipStartSec = -clip.offsetMs / 1000
  const clipDurationSec = Math.max(MIN_CLIP_SEC, trimEndValue - clip.trimStart)
  const leftPx = secToPx(clipStartSec)
  const widthPx = Math.max(24, clipDurationSec * PX_PER_SEC)

  const beginDrag = (mode: 'move' | 'trim-start' | 'trim-end') => (event: ReactPointerEvent) => {
    event.stopPropagation()
    ;(event.target as Element).setPointerCapture(event.pointerId)
    dragRef.current = {
      mode,
      startX: event.clientX,
      startOffsetMs: clip.offsetMs,
      startTrimStart: clip.trimStart,
      startTrimEnd: trimEndValue,
    }
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const deltaPx = event.clientX - drag.startX
    const deltaSec = pxToSec(deltaPx)

    if (drag.mode === 'move') {
      onChange({ offsetMs: drag.startOffsetMs - deltaSec * 1000 })
      return
    }

    if (drag.mode === 'trim-start') {
      const maxStart = drag.startTrimEnd - MIN_CLIP_SEC
      const nextStart = Math.max(0, Math.min(maxStart, drag.startTrimStart + deltaSec))
      const actualDelta = nextStart - drag.startTrimStart
      onChange({ trimStart: nextStart, offsetMs: drag.startOffsetMs - actualDelta * 1000 })
      return
    }

    // trim-end
    const minEnd = drag.startTrimStart + MIN_CLIP_SEC
    const nextEnd = Math.max(minEnd, Math.min(duration, drag.startTrimEnd + deltaSec))
    onChange({ trimEnd: nextEnd >= duration - 0.02 ? undefined : nextEnd })
  }

  const endDrag = (event: ReactPointerEvent) => {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      ;(event.target as Element).releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="multitrack-align-stage__track">
      <div className="multitrack-align-stage__track-label">{clip.label}</div>
      <div className="multitrack-align-stage__track-lane">
        <div
          className="multitrack-align-stage__clip"
          style={{ left: leftPx, width: widthPx }}
          onPointerDown={beginDrag('move')}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <ClipWaveform
            filePath={clip.filePath}
            videoUrl={clip.videoUrl}
            duration={duration}
            trimStart={clip.trimStart}
            trimEndValue={trimEndValue}
            widthPx={widthPx}
          />
          <div
            className="multitrack-align-stage__handle multitrack-align-stage__handle--left"
            onPointerDown={beginDrag('trim-start')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
          <div
            className="multitrack-align-stage__handle multitrack-align-stage__handle--right"
            onPointerDown={beginDrag('trim-end')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        </div>
      </div>
    </div>
  )
}

export default function MultitrackAlignStage({
  isOpen,
  panels,
  sync,
  onClose,
  onPreviewToggle,
  onDone,
}: MultitrackAlignStageProps) {
  const [clips, setClips] = useState<Record<string, AlignClipState>>({})
  const dirtyRef = useRef<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const next: Record<string, AlignClipState> = {}
    for (const panel of panels) {
      if (panel.kind !== 'performance' || !panel.take) continue
      next[panel.id] = {
        panelId: panel.id,
        takeId: panel.take.id,
        label: panel.take.name || 'Performance',
        filePath: panel.take.filePath,
        videoUrl: panel.take.videoUrl,
        duration: sync.getPanelMediaDuration(panel.id) || 0,
        offsetMs: panel.take.timelineOffsetMs ?? 0,
        trimStart: panel.trimStartSec ?? 0,
        trimEnd: panel.trimEndSec,
      }
    }
    setClips(next)
    dirtyRef.current = new Set()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const clipList = useMemo(() => Object.values(clips), [clips])

  const maxDurationSec = useMemo(() => {
    let max = 8
    for (const clip of clipList) {
      const trimEndValue = clip.trimEnd ?? (clip.duration > 0 ? clip.duration : 60)
      const end = -clip.offsetMs / 1000 + Math.max(MIN_CLIP_SEC, trimEndValue - clip.trimStart)
      max = Math.max(max, end)
    }
    return max
  }, [clipList])

  const timelineWidth = secToPx(maxDurationSec) + 120

  const updateClip = useCallback(
    (panelId: string, patch: Partial<Pick<AlignClipState, 'offsetMs' | 'trimStart' | 'trimEnd'>>) => {
      dirtyRef.current.add(panelId)
      setClips((prev) => {
        const current = prev[panelId]
        if (!current) return prev
        const nextClip = { ...current, ...patch }
        sync.setPanelOffset(panelId, nextClip.offsetMs)
        sync.setPanelTrim(panelId, nextClip.trimStart, nextClip.trimEnd ?? null)
        return { ...prev, [panelId]: nextClip }
      })
    },
    [sync],
  )

  const handleReset = (panelId: string) => {
    updateClip(panelId, { offsetMs: 0, trimStart: 0, trimEnd: undefined })
  }

  const handleDone = async () => {
    setSaving(true)
    try {
      const changes = [...dirtyRef.current]
        .map((panelId) => clips[panelId])
        .filter((clip): clip is AlignClipState => Boolean(clip))
        .map((clip) => ({
          panelId: clip.panelId,
          takeId: clip.takeId,
          offsetMs: clip.offsetMs,
          trimStart: clip.trimStart,
          trimEnd: clip.trimEnd,
        }))
      await onDone(changes)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const playheadPx = secToPx(sync.state.currentTime)

  if (!isOpen) return null

  return (
    <div className="multitrack-align-stage" role="dialog" aria-modal="true" aria-label="Align tracks">
      <header className="multitrack-align-stage__header">
        <Pressable type="button" intensity="icon" className="multitrack-align-stage__close" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </Pressable>
        <p className="multitrack-align-stage__title">Align tracks</p>
        <Pressable
          type="button"
          intensity="normal"
          haptic="medium"
          className="multitrack-align-stage__done"
          disabled={saving}
          onClick={() => void handleDone()}
        >
          {saving ? 'Saving…' : 'Done'}
        </Pressable>
      </header>

      <p className="multitrack-align-stage__hint">
        Drag a clip to shift its timing. Drag the edges to trim. Preview plays everything in sync.
      </p>

      <div className="multitrack-align-stage__scroll">
        <div className="multitrack-align-stage__timeline" style={{ width: timelineWidth }}>
          <div className="multitrack-align-stage__ruler">
            {Array.from({ length: Math.ceil(maxDurationSec) + 2 }, (_, sec) => (
              <div key={sec} className="multitrack-align-stage__tick" style={{ left: secToPx(sec) }}>
                {sec % 2 === 0 && <span>{sec}s</span>}
              </div>
            ))}
          </div>
          <div className="multitrack-align-stage__zero-line" style={{ left: TIMELINE_ORIGIN_PX }} />
          <div className="multitrack-align-stage__playhead" style={{ left: playheadPx }} />
          <div className="multitrack-align-stage__tracks">
            {clipList.map((clip) => (
              <ClipTrack key={clip.panelId} clip={clip} onChange={(patch) => updateClip(clip.panelId, patch)} />
            ))}
          </div>
        </div>
      </div>

      <footer className="multitrack-align-stage__transport">
        <Pressable
          type="button"
          intensity="soft"
          className="multitrack-align-stage__transport-btn"
          onClick={() => {
            for (const panelId of Object.keys(clips)) handleReset(panelId)
          }}
        >
          <RotateCcw className="h-4 w-4" />
          Reset all
        </Pressable>
        <Pressable
          type="button"
          intensity="normal"
          className="multitrack-align-stage__transport-btn multitrack-align-stage__transport-btn--primary"
          onClick={onPreviewToggle}
        >
          {sync.state.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          {sync.state.isPlaying ? 'Pause' : 'Preview'}
        </Pressable>
      </footer>
    </div>
  )
}

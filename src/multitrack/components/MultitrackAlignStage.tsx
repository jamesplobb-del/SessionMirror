import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Check, ImagePlus, Pause, Play, Plus, RotateCcw, Trash2, Video, X, ZoomIn, ZoomOut } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import type { PerformancePanelState, SheetMusicPanelState } from '../types'
import type { useMultitrackSync } from '../synchronization/useMultitrackSync'
import { useMediaWaveform } from '../../hooks/useMediaWaveform'
import { extractNativeWaveformPeaks } from '../../utils/nativeWaveform'
import { timelineOffsetMsForTake } from '../synchronization/multitrackBeatSchedule'
import { hasSectionWindow } from '../layout/sectionVisibility'
import { sheetCueWindows } from '../sheetMusic/sheetMusicTimeline'

type SyncApi = ReturnType<typeof useMultitrackSync>

/** Timeline zoom steps in pixels per second. */
const ZOOM_STEPS = [24, 40, 70, 120]
const DEFAULT_ZOOM_INDEX = 1
/** Left padding so a clip can be dragged to start before timeline zero (negative offset). */
const TIMELINE_ORIGIN_PX = 96
const MIN_CLIP_SEC = 0.2
/** Movement before a touch on a selected clip counts as a drag and not a scroll. */
const DRAG_INTENT_PX = 8

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
  /** True while this box is scoped to its own clip instead of the whole song. */
  windowed: boolean
}

interface MultitrackAlignStageProps {
  isOpen: boolean
  panels: PerformancePanelState[]
  sheetMusic: SheetMusicPanelState
  bpm: number
  sync: SyncApi
  /** Blocks edits while a render or recording owns the transport. */
  busy?: boolean
  onClose: () => void
  onPreviewToggle: () => void
  /** Claim a new box and start recording over the mix at this second. */
  onAddBox: (atSec: number) => void
  /** Record into an existing empty box, starting at this second. */
  onRecordBox: (panelId: string, atSec: number) => void
  onAddImage: (atSec: number) => void
  onMoveImage: (cueId: string, startSec: number) => void
  onRemoveImage: (cueId: string) => void
  onSectionChange: (panelId: string, startSec: number | undefined, endSec: number | undefined) => void
  onDone: (
    changes: Array<{ panelId: string; takeId: string; offsetMs: number; trimStart: number; trimEnd: number | undefined }>,
  ) => Promise<void>
}

function formatClock(seconds: number): string {
  const total = Math.max(0, seconds)
  const mins = Math.floor(total / 60)
  const secs = Math.floor(total % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
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
  pxPerSec,
  onChange,
  selected,
  onSelect,
}: {
  clip: AlignClipState
  pxPerSec: number
  onChange: (next: Partial<Pick<AlignClipState, 'offsetMs' | 'trimStart' | 'trimEnd'>>) => void
  selected: boolean
  onSelect: () => void
}) {
  const dragRef = useRef<{
    mode: 'move' | 'trim-start' | 'trim-end'
    startX: number
    startY: number
    /** False until the gesture has proved itself a horizontal drag. */
    committed: boolean
    startOffsetMs: number
    startTrimStart: number
    startTrimEnd: number
  } | null>(null)

  const duration = clip.duration > 0 ? clip.duration : 60
  const trimEndValue = clip.trimEnd ?? duration
  const clipStartSec = -clip.offsetMs / 1000
  const clipDurationSec = Math.max(MIN_CLIP_SEC, trimEndValue - clip.trimStart)
  const leftPx = TIMELINE_ORIGIN_PX + clipStartSec * pxPerSec
  const widthPx = Math.max(24, clipDurationSec * pxPerSec)

  /**
   * A clip only moves once it is selected, and only after the finger has
   * committed to a horizontal gesture. Grabbing the timeline anywhere else
   * scrolls it — dragging a clip by accident while trying to scroll was the
   * single easiest way to knock a part out of alignment.
   */
  const beginDrag = (mode: 'move' | 'trim-start' | 'trim-end') => (event: ReactPointerEvent) => {
    if (!selected) {
      // First touch selects; it never moves anything. The gesture is left
      // uncaptured so this same swipe can still scroll the timeline.
      onSelect()
      return
    }
    event.stopPropagation()
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      committed: false,
      startOffsetMs: clip.offsetMs,
      startTrimStart: clip.trimStart,
      startTrimEnd: trimEndValue,
    }
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag) return

    if (!drag.committed) {
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      // Mostly-vertical movement is a scroll: let go entirely.
      if (Math.abs(dy) > DRAG_INTENT_PX && Math.abs(dy) > Math.abs(dx)) {
        dragRef.current = null
        return
      }
      if (Math.abs(dx) < DRAG_INTENT_PX) return
      drag.committed = true
      try {
        ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
      } catch {
        /* capture is best-effort */
      }
    }

    const deltaSec = (event.clientX - drag.startX) / pxPerSec

    if (drag.mode === 'move') {
      onChange({ offsetMs: Math.round(drag.startOffsetMs - deltaSec * 1000) })
      return
    }

    if (drag.mode === 'trim-start') {
      const maxStart = drag.startTrimEnd - MIN_CLIP_SEC
      const nextStart = Math.max(0, Math.min(maxStart, drag.startTrimStart + deltaSec))
      const actualDelta = nextStart - drag.startTrimStart
      onChange({
        trimStart: Math.round(nextStart * 1000) / 1000,
        offsetMs: Math.round(drag.startOffsetMs - actualDelta * 1000),
      })
      return
    }

    // trim-end
    const minEnd = drag.startTrimStart + MIN_CLIP_SEC
    const nextEnd = Math.max(minEnd, Math.min(duration, drag.startTrimEnd + deltaSec))
    onChange({ trimEnd: nextEnd >= duration - 0.02 ? undefined : Math.round(nextEnd * 1000) / 1000 })
  }

  const endDrag = (event: ReactPointerEvent) => {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      ;(event.currentTarget as Element).releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="multitrack-align-stage__clip"
      style={{ left: leftPx, width: widthPx }}
      onPointerDown={beginDrag('move')}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      data-selected={selected ? 'true' : 'false'}
    >
      <ClipWaveform
        filePath={clip.filePath}
        videoUrl={clip.videoUrl}
        duration={duration}
        trimStart={clip.trimStart}
        trimEndValue={trimEndValue}
        widthPx={widthPx}
      />
      <span className="multitrack-align-stage__clip-name">{clip.label}</span>
      {/* Trim handles belong to the selected clip only — otherwise every lane
          carries two thin targets that swallow a scroll. */}
      {selected ? (
        <>
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
        </>
      ) : null}
    </div>
  )
}

export default function MultitrackAlignStage({
  isOpen,
  panels,
  sheetMusic,
  bpm,
  sync,
  busy = false,
  onClose,
  onPreviewToggle,
  onAddBox,
  onRecordBox,
  onAddImage,
  onMoveImage,
  onRemoveImage,
  onSectionChange,
  onDone,
}: MultitrackAlignStageProps) {
  const [clips, setClips] = useState<Record<string, AlignClipState>>({})
  /** Mirror of `clips` so drag handlers can read and write without a stale closure. */
  const clipsRef = useRef<Record<string, AlignClipState>>({})
  const initialClipsRef = useRef<Record<string, AlignClipState>>({})
  /** Section windows as they were when the editor opened, for Cancel. */
  const initialSectionsRef = useRef<Record<string, [number | undefined, number | undefined]>>({})
  const dirtyRef = useRef<Set<string>>(new Set())

  const commitClips = useCallback((next: Record<string, AlignClipState>) => {
    clipsRef.current = next
    setClips(next)
  }, [])
  const [saving, setSaving] = useState(false)
  const [selection, setSelection] = useState<{ kind: 'clip' | 'image'; id: string } | null>(null)
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pxPerSec = ZOOM_STEPS[zoomIndex]

  const secToPx = useCallback((sec: number) => TIMELINE_ORIGIN_PX + sec * pxPerSec, [pxPerSec])

  useEffect(() => {
    if (!isOpen) return
    const next: Record<string, AlignClipState> = {}
    const sections: Record<string, [number | undefined, number | undefined]> = {}
    for (const panel of panels) {
      if (panel.kind !== 'performance') continue
      sections[panel.id] = [panel.sectionStartSec, panel.sectionEndSec]
      if (!panel.take) continue
      next[panel.id] = {
        panelId: panel.id,
        takeId: panel.take.id,
        label: panel.take.name || 'Performance',
        filePath: panel.take.filePath,
        videoUrl: panel.take.videoUrl,
        duration: sync.getPanelMediaDuration(panel.id) || panel.take.duration || 0,
        offsetMs: timelineOffsetMsForTake(panel.take, bpm),
        trimStart: panel.trimStartSec ?? 0,
        trimEnd: panel.trimEndSec,
        windowed: hasSectionWindow(panel),
      }
    }
    commitClips(next)
    initialClipsRef.current = next
    initialSectionsRef.current = sections
    dirtyRef.current = new Set()
    setSelection(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Boxes recorded while the editor is open (the "+" flow) arrive as new takes —
  // fold them in without disturbing clips the user is already dragging.
  useEffect(() => {
    if (!isOpen) return
    let changed = false
    const next = { ...clipsRef.current }
    for (const panel of panels) {
      if (panel.kind !== 'performance') continue
      if (!panel.take) {
        if (next[panel.id]) {
          delete next[panel.id]
          changed = true
        }
        continue
      }
      if (next[panel.id]?.takeId === panel.take.id) continue
      const offsetMs = timelineOffsetMsForTake(panel.take, bpm)
      const trimStart = panel.trimStartSec ?? 0
      // The overlay stands its reconcile effect down while this editor is open,
      // so a clip that arrives now has to seed the transport itself — otherwise
      // Preview would play it at offset zero, ahead of its own count-in.
      sync.setPanelOffset(panel.id, offsetMs)
      sync.setPanelTrim(panel.id, trimStart, panel.trimEndSec ?? null)
      const arrived: AlignClipState = {
        panelId: panel.id,
        takeId: panel.take.id,
        label: panel.take.name || 'Performance',
        filePath: panel.take.filePath,
        videoUrl: panel.take.videoUrl,
        duration: sync.getPanelMediaDuration(panel.id) || panel.take.duration || 0,
        offsetMs,
        trimStart,
        trimEnd: panel.trimEndSec,
        windowed: hasSectionWindow(panel),
      }
      next[panel.id] = arrived
      // Where it landed is where it was recorded, so that becomes the spot
      // Reset returns it to — a part overdubbed into the bridge has no earlier
      // state in this session to fall back on.
      initialClipsRef.current = { ...initialClipsRef.current, [panel.id]: arrived }
      changed = true
    }
    if (changed) commitClips(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, panels])

  const performancePanels = useMemo(
    () => panels.filter((panel): panel is PerformancePanelState => panel.kind === 'performance'),
    [panels],
  )

  const imageWindows = useMemo(() => sheetCueWindows(sheetMusic), [sheetMusic])

  const maxDurationSec = useMemo(() => {
    let max = Math.max(8, sync.state.duration)
    for (const clip of Object.values(clips)) {
      const trimEndValue = clip.trimEnd ?? (clip.duration > 0 ? clip.duration : 60)
      const end = -clip.offsetMs / 1000 + Math.max(MIN_CLIP_SEC, trimEndValue - clip.trimStart)
      max = Math.max(max, end)
    }
    for (const window of imageWindows) max = Math.max(max, window.startSec + 2)
    return max
  }, [clips, imageWindows, sync.state.duration])

  const timelineWidth = secToPx(maxDurationSec) + 160

  const clipTimelineWindow = useCallback((clip: AlignClipState) => {
    const trimEndValue = clip.trimEnd ?? (clip.duration > 0 ? clip.duration : 60)
    const start = -clip.offsetMs / 1000
    return { start, end: start + Math.max(MIN_CLIP_SEC, trimEndValue - clip.trimStart) }
  }, [])

  const updateClip = useCallback(
    (panelId: string, patch: Partial<Pick<AlignClipState, 'offsetMs' | 'trimStart' | 'trimEnd'>>) => {
      const current = clipsRef.current[panelId]
      if (!current) return
      dirtyRef.current.add(panelId)
      const nextClip = { ...current, ...patch }
      sync.setPanelOffset(panelId, nextClip.offsetMs)
      sync.setPanelTrim(panelId, nextClip.trimStart, nextClip.trimEnd ?? null)
      commitClips({ ...clipsRef.current, [panelId]: nextClip })
      // A windowed box is on screen exactly while its own clip plays, so
      // dragging the clip drags the box's appearance with it.
      if (nextClip.windowed) {
        const window = clipTimelineWindow(nextClip)
        onSectionChange(panelId, Math.max(0, window.start), window.end)
      }
    },
    [clipTimelineWindow, commitClips, onSectionChange, sync],
  )

  const toggleWindowed = useCallback(
    (panelId: string) => {
      const current = clipsRef.current[panelId]
      if (!current) return
      const windowed = !current.windowed
      commitClips({ ...clipsRef.current, [panelId]: { ...current, windowed } })
      if (windowed) {
        const window = clipTimelineWindow(current)
        onSectionChange(panelId, Math.max(0, window.start), window.end)
      } else {
        onSectionChange(panelId, undefined, undefined)
      }
    },
    [clipTimelineWindow, commitClips, onSectionChange],
  )

  /**
   * Puts a clip back where it started — its own recorded spot on the timeline,
   * not timeline zero. A part overdubbed into the last chorus belongs in the
   * last chorus; dragging it to the top would be a different edit, not a reset.
   */
  const handleReset = useCallback(
    (panelId: string) => {
      const original = initialClipsRef.current[panelId]
      const current = clipsRef.current[panelId]
      if (!original || !current) return
      dirtyRef.current.add(panelId)
      const restored: AlignClipState = {
        ...current,
        offsetMs: original.offsetMs,
        trimStart: original.trimStart,
        trimEnd: original.trimEnd,
        windowed: original.windowed,
      }
      sync.setPanelOffset(panelId, restored.offsetMs)
      sync.setPanelTrim(panelId, restored.trimStart, restored.trimEnd ?? null)
      commitClips({ ...clipsRef.current, [panelId]: restored })
      if (restored.windowed) {
        const window = clipTimelineWindow(restored)
        onSectionChange(panelId, Math.max(0, window.start), window.end)
      } else {
        onSectionChange(panelId, undefined, undefined)
      }
    },
    [clipTimelineWindow, commitClips, onSectionChange, sync],
  )

  const handleCancel = () => {
    for (const clip of Object.values(initialClipsRef.current)) {
      sync.setPanelOffset(clip.panelId, clip.offsetMs)
      sync.setPanelTrim(clip.panelId, clip.trimStart, clip.trimEnd ?? null)
    }
    // Window toggles are written straight to the session as you make them, so
    // discarding has to put them back too.
    for (const [panelId, [startSec, endSec]] of Object.entries(initialSectionsRef.current)) {
      onSectionChange(panelId, startSec, endSec)
    }
    onClose()
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

  // ── Scrubbing ────────────────────────────────────────────────────────────
  const seekFromClientX = useCallback(
    (clientX: number) => {
      const scroll = scrollRef.current
      if (!scroll) return
      const rect = scroll.getBoundingClientRect()
      const px = clientX - rect.left + scroll.scrollLeft - TIMELINE_ORIGIN_PX
      sync.seek(Math.max(0, px / pxPerSec))
    },
    [pxPerSec, sync],
  )

  const rulerDragRef = useRef(false)
  const onRulerDown = (event: ReactPointerEvent) => {
    rulerDragRef.current = true
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    seekFromClientX(event.clientX)
  }
  const onRulerMove = (event: ReactPointerEvent) => {
    if (rulerDragRef.current) seekFromClientX(event.clientX)
  }
  const onRulerUp = (event: ReactPointerEvent) => {
    rulerDragRef.current = false
    try {
      ;(event.currentTarget as Element).releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
  }

  // Keep the playhead on screen while the mix rolls, the way a video editor
  // does. Only re-centre once it actually leaves the comfortable middle band —
  // chasing it every tick would restart the scroll animation continuously.
  const playheadPx = secToPx(sync.state.currentTime)
  useEffect(() => {
    if (!isOpen || !sync.state.isPlaying) return
    const scroll = scrollRef.current
    if (!scroll) return
    const left = scroll.scrollLeft
    const width = scroll.clientWidth
    if (playheadPx > left + width * 0.2 && playheadPx < left + width * 0.8) return
    scroll.scrollLeft = Math.max(0, playheadPx - width * 0.4)
  }, [isOpen, playheadPx, sync.state.isPlaying])

  // ── Image cue dragging ───────────────────────────────────────────────────
  const [imageDrag, setImageDrag] = useState<{ cueId: string; startSec: number } | null>(null)
  const imageDragRef = useRef<{
    cueId: string
    startX: number
    startY: number
    committed: boolean
    startSec: number
  } | null>(null)

  /** Same rule as clips: tap selects, and only a committed sideways drag retimes. */
  const beginImageDrag = (cueId: string, startSec: number) => (event: ReactPointerEvent) => {
    const alreadySelected = selection?.kind === 'image' && selection.id === cueId
    if (!alreadySelected) {
      setSelection({ kind: 'image', id: cueId })
      return
    }
    event.stopPropagation()
    imageDragRef.current = {
      cueId,
      startX: event.clientX,
      startY: event.clientY,
      committed: false,
      startSec,
    }
  }

  const onImageDragMove = (event: ReactPointerEvent) => {
    const drag = imageDragRef.current
    if (!drag) return
    if (!drag.committed) {
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      if (Math.abs(dy) > DRAG_INTENT_PX && Math.abs(dy) > Math.abs(dx)) {
        imageDragRef.current = null
        return
      }
      if (Math.abs(dx) < DRAG_INTENT_PX) return
      drag.committed = true
      try {
        ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
      } catch {
        /* capture is best-effort */
      }
    }
    const deltaSec = (event.clientX - drag.startX) / pxPerSec
    setImageDrag({ cueId: drag.cueId, startSec: Math.max(0, drag.startSec + deltaSec) })
  }

  const endImageDrag = (event: ReactPointerEvent) => {
    const drag = imageDragRef.current
    if (!drag) return
    imageDragRef.current = null
    const dropped = imageDrag
    setImageDrag(null)
    if (drag.committed && dropped && dropped.cueId === drag.cueId) {
      onMoveImage(drag.cueId, Math.round(dropped.startSec * 10) / 10)
    }
    try {
      ;(event.currentTarget as Element).releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
  }

  if (!isOpen) return null

  const selectedClip =
    selection?.kind === 'clip' ? clips[selection.id] : undefined
  const selectedImage =
    selection?.kind === 'image'
      ? imageWindows.find((window) => window.id === selection.id) ?? null
      : null
  const playheadSec = Math.max(0, sync.state.currentTime)

  return (
    <section className="multitrack-align-stage" aria-label="Editor">
      <header className="multitrack-align-stage__header">
        <Pressable
          type="button"
          intensity="icon"
          className="multitrack-align-stage__close"
          onClick={handleCancel}
          aria-label="Discard editor changes"
        >
          <X className="h-5 w-5" />
        </Pressable>
        <div className="multitrack-align-stage__titles">
          <p className="multitrack-align-stage__title">Editor</p>
          <span className="multitrack-align-stage__clock">
            {formatClock(playheadSec)} / {formatClock(maxDurationSec)}
          </span>
        </div>
        <div className="multitrack-align-stage__zoom" aria-label="Zoom">
          <Pressable
            type="button"
            intensity="icon"
            onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
            disabled={zoomIndex === 0}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Pressable>
          <Pressable
            type="button"
            intensity="icon"
            onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Pressable>
        </div>
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

      <div className="multitrack-align-stage__actions">
        <Pressable
          type="button"
          intensity="normal"
          haptic="medium"
          className="multitrack-align-stage__action multitrack-align-stage__action--primary"
          disabled={busy}
          onClick={() => onAddBox(playheadSec)}
        >
          <Plus className="h-4 w-4" />
          Add box here
        </Pressable>
        <Pressable
          type="button"
          intensity="soft"
          className="multitrack-align-stage__action"
          disabled={busy}
          onClick={() => onAddImage(playheadSec)}
        >
          <ImagePlus className="h-4 w-4" />
          Add image here
        </Pressable>
        <Pressable
          type="button"
          intensity="soft"
          className="multitrack-align-stage__action multitrack-align-stage__action--play"
          onClick={onPreviewToggle}
        >
          {sync.state.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {sync.state.isPlaying ? 'Pause' : 'Preview'}
        </Pressable>
      </div>

      {selectedClip ? (
        <div className="multitrack-align-stage__inspector">
          <div className="multitrack-align-stage__selection">
            <strong>{selectedClip.label}</strong>
            <span>
              Starts {formatClock(Math.max(0, -selectedClip.offsetMs / 1000))} ·{' '}
              {selectedClip.windowed ? 'box appears only here' : 'box shows all song'}
            </span>
          </div>
          <div className="multitrack-align-stage__nudge">
            <Pressable
              type="button"
              intensity="soft"
              onClick={() => handleReset(selectedClip.panelId)}
              aria-label="Put this clip back where it was recorded"
              title="Back to its recorded spot"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Pressable>
          </div>
        </div>
      ) : null}

      {selectedImage ? (
        <div className="multitrack-align-stage__inspector">
          <div className="multitrack-align-stage__selection">
            <strong>{selectedImage.asset.fileName}</strong>
            <span>
              {selectedImage.isBase
                ? 'First image — on screen from the start'
                : `Cuts in at ${formatClock(selectedImage.startSec)}`}
            </span>
          </div>
          <div className="multitrack-align-stage__nudge">
            <Pressable
              type="button"
              intensity="soft"
              className="multitrack-align-stage__nudge-danger"
              onClick={() => {
                onRemoveImage(selectedImage.id)
                setSelection(null)
              }}
              aria-label="Remove this image"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Pressable>
          </div>
        </div>
      ) : null}

      <div className="multitrack-align-stage__scroll" ref={scrollRef}>
        <div className="multitrack-align-stage__timeline" style={{ width: timelineWidth }}>
          <div
            className="multitrack-align-stage__ruler"
            onPointerDown={onRulerDown}
            onPointerMove={onRulerMove}
            onPointerUp={onRulerUp}
            onPointerCancel={onRulerUp}
          >
            {Array.from({ length: Math.ceil(maxDurationSec) + 2 }, (_, sec) => sec).map((sec) => {
              const labelEvery = pxPerSec >= 70 ? 2 : pxPerSec >= 40 ? 5 : 10
              return (
                <div key={sec} className="multitrack-align-stage__tick" style={{ left: secToPx(sec) }}>
                  {sec % labelEvery === 0 && <span>{formatClock(sec)}</span>}
                </div>
              )
            })}
          </div>
          <div className="multitrack-align-stage__zero-line" style={{ left: TIMELINE_ORIGIN_PX }} />
          <div className="multitrack-align-stage__playhead" style={{ left: playheadPx }} />

          <div className="multitrack-align-stage__tracks">
            {imageWindows.length > 0 ? (
              <div className="multitrack-align-stage__track multitrack-align-stage__track--images">
                <div className="multitrack-align-stage__track-label">
                  <span className="multitrack-align-stage__track-name">Music</span>
                </div>
                <div className="multitrack-align-stage__track-lane">
                  {imageWindows.map((window) => {
                    const startSec =
                      imageDrag?.cueId === window.id ? imageDrag.startSec : window.startSec
                    const endSec = window.endSec ?? maxDurationSec
                    const width = Math.max(28, (endSec - startSec) * pxPerSec)
                    return (
                      <div
                        key={window.id}
                        className="multitrack-align-stage__image-cue"
                        style={{ left: secToPx(startSec), width }}
                        data-selected={selection?.kind === 'image' && selection.id === window.id ? 'true' : 'false'}
                        data-pinned={window.isBase ? 'true' : 'false'}
                        onPointerDown={
                          window.isBase
                            ? () => setSelection({ kind: 'image', id: window.id })
                            : beginImageDrag(window.id, window.startSec)
                        }
                        onPointerMove={window.isBase ? undefined : onImageDragMove}
                        onPointerUp={window.isBase ? undefined : endImageDrag}
                        onPointerCancel={window.isBase ? undefined : endImageDrag}
                      >
                        {window.asset.mimeType === 'application/pdf' ? null : (
                          <img
                            src={window.asset.src}
                            alt=""
                            className="multitrack-align-stage__image-thumb"
                            draggable={false}
                          />
                        )}
                        <span className="multitrack-align-stage__image-name">
                          {window.asset.fileName}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {performancePanels.map((panel, index) => {
              const clip = clips[panel.id]
              const label = clip?.label ?? `Box ${index + 1}`
              return (
                <div
                  key={panel.id}
                  className={`multitrack-align-stage__track ${
                    selection?.kind === 'clip' && selection.id === panel.id ? 'is-selected' : ''
                  }`}
                >
                  <div className="multitrack-align-stage__track-label">
                    <span className="multitrack-align-stage__track-name">{label}</span>
                    {clip ? (
                      <Pressable
                        type="button"
                        intensity="soft"
                        className={`multitrack-align-stage__window-chip ${clip.windowed ? 'is-on' : ''}`}
                        onClick={() => toggleWindowed(panel.id)}
                        aria-pressed={clip.windowed}
                      >
                        {clip.windowed ? <Check className="h-3 w-3" /> : null}
                        {clip.windowed ? 'Only here' : 'All song'}
                      </Pressable>
                    ) : null}
                  </div>
                  <div
                    className="multitrack-align-stage__track-lane"
                    onPointerDown={() => setSelection({ kind: 'clip', id: panel.id })}
                  >
                    {clip ? (
                      <ClipTrack
                        clip={clip}
                        pxPerSec={pxPerSec}
                        selected={selection?.kind === 'clip' && selection.id === panel.id}
                        onSelect={() => setSelection({ kind: 'clip', id: panel.id })}
                        onChange={(patch) => updateClip(panel.id, patch)}
                      />
                    ) : (
                      <Pressable
                        type="button"
                        intensity="soft"
                        className="multitrack-align-stage__empty-clip"
                        style={{ left: secToPx(playheadSec) }}
                        disabled={busy}
                        onClick={() => onRecordBox(panel.id, playheadSec)}
                      >
                        <Video className="h-3.5 w-3.5" />
                        Record here
                      </Pressable>
                    )}
                  </div>
                </div>
              )
            })}
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
        <p className="multitrack-align-stage__hint">
          Drag clips to move them, edges to trim. Reset puts a clip back on its own recorded spot,
          wherever that is in the song.
        </p>
      </footer>
    </section>
  )
}

import { useEffect, useRef, useState, type RefObject, type PointerEvent, type KeyboardEvent } from 'react'
import { motion, useDragControls, useMotionValue } from 'framer-motion'
import { GripHorizontal, Grip, Minus, Maximize, Play, X } from 'lucide-react'
import BestTakeBox from './BestTakeBox'
import type { LibraryPlaybackReference } from '../types/library'
import { clampWidgetPosition, loadWidgetSize, saveWidgetSize } from '../utils/floatingWidgetLayout'

export default function ReferenceWidget({ boundaryRef, expanded, onExpandedChange, onExpandView, onClose, showTrackName = false, visible = true, youtubeUrl, libraryPlayback,
  suspended, onSubmitYoutube, onUpload, onClearAudio, onClearYoutube, onYoutubeHostChange, youtubeIframeRef, onPlaybackChange, onBeforePlay,
}: {
  boundaryRef: RefObject<HTMLElement | null>
  expanded: boolean
  onExpandedChange: (open: boolean) => void
  onExpandView: () => void
  onClose?: () => void
  showTrackName?: boolean
  visible?: boolean
  youtubeUrl: string | null
  libraryPlayback: LibraryPlaybackReference | null
  suspended: boolean
  onSubmitYoutube: (url: string) => void
  onUpload: (file: File) => void
  onClearAudio: () => void
  onClearYoutube: () => void
  onYoutubeHostChange: (host: HTMLDivElement | null) => void
  youtubeIframeRef: RefObject<HTMLIFrameElement | null>
  onPlaybackChange: (playing: boolean) => void
  onBeforePlay: () => void
}) {
  const node = useRef<HTMLDivElement>(null)
  const drag = useDragControls()
  const chipDragged = useRef(false)
  const [size, setSize] = useState(() => loadWidgetSize('reference') ?? { width: 280, height: 240 })
  const [room, setRoom] = useState({ width: 320, height: 480 })
  const resizing = useRef<{ id: number; x: number; y: number; width: number; height: number } | null>(null)
  const clampSize = (width: number, height: number) => ({
    width: Math.max(Math.min(260, room.width), Math.min(room.width, width)),
    height: Math.max(Math.min(220, room.height), Math.min(room.height, height)),
  })
  const displayed = clampSize(size.width, size.height)
  const updateSize = (width: number, height: number) => {
    const next = clampSize(width, height)
    setSize(next)
    saveWidgetSize('reference', next.width, next.height)
  }
  const resize = (event: PointerEvent<HTMLButtonElement>) => {
    const start = resizing.current
    if (!start || start.id !== event.pointerId) return
    event.preventDefault(); event.stopPropagation()
    updateSize(start.width + event.clientX - start.x, start.height + event.clientY - start.y)
  }
  const finishResize = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const start = resizing.current
    if (!start || start.id !== event.pointerId) return
    if (cancelled) updateSize(start.width, start.height)
    else resize(event)
    resizing.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const resizeWithKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault(); event.stopPropagation()
    const step = event.shiftKey ? 32 : 16
    updateSize(displayed.width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
      displayed.height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))
  }
  const x = useMotionValue(16)
  const y = useMotionValue(112)
  useEffect(() => {
    if (suspended) onPlaybackChange(false)
  }, [suspended, onPlaybackChange])
  useEffect(() => {
    const bounds = boundaryRef.current, widget = node.current
    if (!bounds || !widget) return
    const fit = () => { const width = Math.max(1, bounds.clientWidth - 24), height = Math.max(1, bounds.clientHeight - 24); setRoom(prev => prev.width === width && prev.height === height ? prev : { width, height }); const p = clampWidgetPosition(bounds.clientWidth, bounds.clientHeight, widget.offsetWidth, widget.offsetHeight, x.get(), y.get()); x.set(p.x); y.set(p.y) }
    const observer = new ResizeObserver(fit);observer.observe(bounds);observer.observe(widget);fit()
    return () => observer.disconnect()
  }, [boundaryRef, x, y])
  return <motion.div ref={node} className={`reference-widget-live ${expanded ? 'is-expanded' : ''}`}
    style={{ display: visible ? undefined : 'none', width: expanded ? displayed.width : undefined, height: expanded ? displayed.height : undefined, x, y }} drag dragControls={drag} dragListener={false} dragMomentum={false} dragElastic={0} dragConstraints={boundaryRef}
    onDragStart={() => { if (!expanded) chipDragged.current = true }}>
    {!expanded && <button type="button" className="reference-widget-chip"
      onPointerDown={event => {
        if (event.button !== 0) return
        chipDragged.current = false
        drag.start(event)
      }}
      onClick={event => {
        // Releasing a drag must not also open the panel. A fresh tap or a
        // keyboard activation still opens it normally.
        if (chipDragged.current && event.detail !== 0) { event.preventDefault(); return }
        chipDragged.current = false
        onExpandedChange(true)
      }}
      aria-label="Open References" title="Tap to open; drag to move"><Play aria-hidden />References</button>}
    <div className={`reference-widget-panel ${showTrackName && libraryPlayback ? 'reference-widget-panel--named-audio' : ''}`} hidden={!expanded}>
      <header onPointerDown={e => { if (!(e.target as HTMLElement).closest('button')) drag.start(e) }}>
        <span><GripHorizontal aria-hidden />References</span>
        <button type="button" onClick={onExpandView} disabled={!youtubeUrl && !libraryPlayback} aria-label="Open reference in Expand View" title="Open Expand View"><Maximize aria-hidden /></button>
        <button onClick={() => onExpandedChange(false)} aria-label="Collapse References" title="Collapse to References chip"><Minus aria-hidden /></button>{onClose && <button onClick={onClose} aria-label="Close References"><X aria-hidden /></button>}
      </header>
      {showTrackName && libraryPlayback && <p className="reference-widget-track-name">{libraryPlayback.name}</p>}
      <div className="reference-widget-media">
        <BestTakeBox layout={youtubeUrl ? 'pip' : 'fill'} take={null} playbackOwner="reference-widget" displayLabel="" uploadAccept="audio/*,.mp3,.m4a,.wav" youtubeEmbedUrl={youtubeUrl} libraryPlayback={libraryPlayback}
          suspendPlayback={suspended || !expanded} onBeforePlay={onBeforePlay} onUnpinTake={onClearAudio} onClearLibraryReference={onClearAudio}
          onClearYoutube={onClearYoutube} onSubmitYoutube={onSubmitYoutube} onUpload={onUpload}
          onYoutubeHostChange={onYoutubeHostChange} youtubeIframeRef={youtubeIframeRef} onPlaybackChange={onPlaybackChange} />
      </div>
      <footer className="reference-widget-size-bar">
        <span>Resize</span>
        <button type="button" className="reference-widget-resize" aria-label="Resize reference. Drag, or use arrow keys."
          onPointerDown={event => {
            if (event.button !== 0) return
            event.preventDefault(); event.stopPropagation()
            resizing.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: displayed.width, height: displayed.height }
            event.currentTarget.setPointerCapture(event.pointerId)
          }} onPointerMove={resize} onPointerUp={event => finishResize(event)} onPointerCancel={event => finishResize(event, true)}
          onLostPointerCapture={event => finishResize(event, true)} onKeyDown={resizeWithKeys}><Grip aria-hidden /></button>
      </footer>
    </div>
  </motion.div>
}

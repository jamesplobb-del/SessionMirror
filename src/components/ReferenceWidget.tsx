import { useEffect, useLayoutEffect, useRef, useState, type RefObject, type PointerEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion, useDragControls, useMotionValue } from 'framer-motion'
import { ChevronDown, ChevronUp, FileMusic, GripHorizontal, Grip, Maximize, X } from 'lucide-react'
import BestTakeBox from './BestTakeBox'
import type { LibraryPlaybackReference } from '../types/library'
import { clampWidgetPosition, loadWidgetSize, saveWidgetSize } from '../utils/floatingWidgetLayout'
import { useMusicDockItem, type DockDropPoint } from './useMusicDockItem'
import { musicDockClearX } from '../utils/musicDockClearance'
import { focusWidgetLauncher } from '../utils/widgetFocus'

export default function ReferenceWidget({ boundaryRef, expanded, onExpandedChange, onExpandView, onClose, showTrackName = false, visible = true, dockRight = false, playing = false, youtubeUrl, libraryPlayback,
  suspended, onSubmitYoutube, onUpload, onClearAudio, onClearYoutube, onYoutubeHostChange, youtubeIframeRef, onPlaybackChange, onBeforePlay,
}: {
  boundaryRef: RefObject<HTMLElement | null>
  expanded: boolean
  onExpandedChange: (open: boolean) => void
  onExpandView: () => void
  onClose?: () => void
  showTrackName?: boolean
  visible?: boolean
  dockRight?: boolean
  playing?: boolean
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
  const collapseRequested = useRef(false)
  const [size, setSize] = useState(() => loadWidgetSize('reference') ?? { width: 280, height: 240 })
  const [room, setRoom] = useState({ width: 320, height: 480 })
  const [dockHost, setDockHost] = useState<HTMLElement | null>(null)
  const dockChip = useRef<HTMLButtonElement>(null)
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
  useLayoutEffect(() => {
    const findDock = () => setDockHost(dockRight && (boundaryRef.current?.clientWidth ?? window.innerWidth) >= 700
      ? document.getElementById('music-widget-dock') : null)
    findDock()
    const observer = new ResizeObserver(findDock)
    if (boundaryRef.current) observer.observe(boundaryRef.current)
    window.addEventListener('resize', findDock)
    return () => { observer.disconnect(); window.removeEventListener('resize', findDock) }
  }, [boundaryRef, dockRight])
  const openFromDock = (point?: DockDropPoint) => {
    const bounds = boundaryRef.current
    const widget = node.current
    if (bounds && widget) {
      const ball = dockChip.current?.getBoundingClientRect()
      const frame = bounds.getBoundingClientRect()
      const fromX = point ? point.x - frame.left - displayed.width / 2
        : (ball?.left ?? frame.right) - frame.left - displayed.width - 12
      const next = clampWidgetPosition(bounds.clientWidth, bounds.clientHeight,
        displayed.width, displayed.height,
        musicDockClearX(fromX, displayed.width, frame.left),
        point ? point.y - frame.top - 28 : (ball?.top ?? frame.top) - frame.top)
      x.set(next.x)
      y.set(next.y)
    }
    onExpandedChange(true)
  }
  const dockItem = useMusicDockItem('references', openFromDock)
  useLayoutEffect(() => {
    if (expanded || !collapseRequested.current) return
    collapseRequested.current = false
    const chip = dockHost ? dockChip.current : node.current?.querySelector<HTMLButtonElement>('.reference-widget-chip')
    focusWidgetLauncher(chip)
  }, [expanded, dockHost])
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
  return <>
  <motion.div ref={node} className={`reference-widget-live ${expanded ? 'is-expanded' : 'is-collapsed'}`}
    style={{ display: visible ? undefined : 'none', opacity: !expanded && dockHost ? 0 : undefined, pointerEvents: !expanded && dockHost ? 'none' : undefined, width: expanded || dockHost ? displayed.width : undefined, height: expanded || dockHost ? displayed.height : undefined, x, y }} drag dragControls={drag} dragListener={false} dragMomentum={false} dragElastic={0} dragConstraints={boundaryRef}
    onDragStart={() => { if (!expanded) chipDragged.current = true }}>
    {!expanded && !dockHost && <button type="button" className="reference-widget-chip" data-playing={playing}
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
      aria-label={playing ? 'Open References, playing' : 'Open References'} title="Tap to open; drag to move"><FileMusic aria-hidden /><span>Ref</span><ChevronDown className="widget-ball__expand" aria-hidden /></button>}
    <div className={`reference-widget-panel ${showTrackName && libraryPlayback ? 'reference-widget-panel--named-audio' : ''}`} aria-hidden={!expanded} inert={!expanded}
      style={!expanded ? { width: displayed.width, height: displayed.height } : undefined}>
      <header onPointerDown={e => { if (!(e.target as HTMLElement).closest('button')) drag.start(e) }}>
        <span><GripHorizontal aria-hidden />References</span>
        <button onClick={() => { collapseRequested.current = true; onExpandedChange(false) }} aria-label="Collapse References" title="Collapse References"><ChevronUp aria-hidden /></button>{onClose && <button onClick={onClose} aria-label="Close References"><X aria-hidden /></button>}
      </header>
      {showTrackName && libraryPlayback && <p className="reference-widget-track-name">{libraryPlayback.name}</p>}
      <div className="reference-widget-media">
        <BestTakeBox layout="fill" take={null} playbackOwner="reference-widget" displayLabel="" uploadAccept="audio/*,.mp3,.m4a,.wav" youtubeEmbedUrl={youtubeUrl} libraryPlayback={libraryPlayback}
          suspendPlayback={suspended} onBeforePlay={onBeforePlay} onUnpinTake={onClearAudio} onClearLibraryReference={onClearAudio}
          onClearYoutube={onClearYoutube} onSubmitYoutube={onSubmitYoutube} onUpload={onUpload}
          onYoutubeHostChange={onYoutubeHostChange} youtubeIframeRef={youtubeIframeRef} onPlaybackChange={onPlaybackChange} />
      </div>
      <footer className="reference-widget-size-bar">
        <button type="button" className="reference-widget-compare" onClick={onExpandView} disabled={!youtubeUrl && !libraryPlayback} aria-label="Open reference comparison" title="Open two-box comparison"><Maximize aria-hidden /> Compare</button>
        <button type="button" className="reference-widget-resize" aria-label="Resize reference. Drag, or use arrow keys."
          onPointerDown={event => {
            if (event.button !== 0) return
            event.preventDefault(); event.stopPropagation()
            resizing.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: displayed.width, height: displayed.height }
            event.currentTarget.setPointerCapture(event.pointerId)
          }} onPointerMove={resize} onPointerUp={event => finishResize(event)} onPointerCancel={event => finishResize(event, true)}
          onLostPointerCapture={event => finishResize(event, true)} onKeyDown={resizeWithKeys}><span>Resize</span><Grip aria-hidden /></button>
      </footer>
    </div>
  </motion.div>
  {visible && !expanded && dockHost && createPortal(
    <button ref={dockChip} type="button" className="reference-widget-chip reference-widget-chip--docked" data-playing={playing}
      aria-label={playing ? 'Open References, playing' : 'Open References'} title="Open References; drag left to place, or up/down to reorder"
      data-music-dock-id="references" style={{ order: dockItem.order, translate: dockItem.translate }}
      onPointerDown={dockItem.pointerDown} onPointerMove={dockItem.pointerMove}
      onPointerUp={event => dockItem.pointerEnd(event)} onPointerCancel={event => dockItem.pointerEnd(event, true)}
      onLostPointerCapture={event => dockItem.pointerEnd(event, true)} onClick={dockItem.click} onKeyDown={dockItem.keyDown}>
      <FileMusic aria-hidden /><span>Ref</span><ChevronDown className="widget-ball__expand" aria-hidden />
    </button>, dockHost)}
  </>
}
